import { NextRequest } from "next/server";
import { z } from "zod";
import { chicagoDate, isValidDate } from "@/lib/chicago-date";
import { getEventsForDate } from "@/lib/uw-events-api";
import { getUwpdBlotter } from "@/lib/uwpd-blotter";
import { readBoundedJson, RequestBodyError } from "@/lib/report/body";
import { fallbackPhysicalIssueKinds } from "@/lib/report/policy";
import { assistantSystemPrompt } from "@/lib/report/prompts";
import { callOpenAI, OpenAIServiceError, parseOpenAIStructuredOutput } from "@/lib/report/openai-client";
import { checkRequestRateLimits, jsonResponse, requestHasAllowedOrigin } from "@/lib/report/route-helpers";
import { getAssistantHazardRows, getCampusPlaces, ReportStoreError } from "@/lib/report/store";
import { FingerprintConfigurationError } from "@/lib/report/visitor-fingerprint";

export const runtime = "nodejs";

const requestSchema = z.object({
  visitorId: z.string().uuid(),
  query: z.string().trim().min(1).max(1200),
  date: z.string().optional(),
  bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
}).strict();

const answerSchema = z.object({
  answer: z.string().min(1).max(1000),
  source_ids: z.array(z.string().regex(/^[EHP]\d+$/)).max(12),
  report_action_available: z.boolean(),
}).strict();

const answerJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "source_ids", "report_action_available"],
  properties: {
    answer: { type: "string", minLength: 1, maxLength: 1000 },
    source_ids: { type: "array", maxItems: 12, items: { type: "string", pattern: "^[EHP][0-9]+$" } },
    report_action_available: { type: "boolean" },
  },
} as const;

export async function POST(request: NextRequest) {
  if (!requestHasAllowedOrigin(request)) return jsonResponse({ error: "This request did not come from this site." }, 403);
  let body: unknown;
  try { body = await readBoundedJson(request, 24_576); }
  catch (error) { return jsonResponse({ error: "Ask one short campus question." }, error instanceof RequestBodyError && error.code === "too_large" ? 413 : 400); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return jsonResponse({ error: "Ask one short campus question." }, 400);
  const input = parsed.data;
  const date = input.date || chicagoDate();
  if (!isValidDate(date)) return jsonResponse({ error: "Choose a real calendar date." }, 400);
  try {
    const rate = await checkRequestRateLimits(request, input.visitorId, {
      network: { action: "assistant_network", limit: 20, windowSeconds: 60 },
      visitor: { action: "assistant_browser", limit: 80, windowSeconds: 86400 },
    });
    if (!rate.allowed) return jsonResponse({ error: "You’ve asked several questions recently. Try again in a moment." }, 429, { "Retry-After": String(rate.retryAfterSeconds) });

    const eventsResult = await getEventsForDate(date).catch(() => null);
    const relevantEvents = (eventsResult?.events || []).slice(0, 60);
    let hazards = [] as Awaited<ReturnType<typeof getAssistantHazardRows>>;
    let places = [] as Awaited<ReturnType<typeof getCampusPlaces>>;
    try {
      hazards = await getAssistantHazardRows([-89.455, 43.045, -89.375, 43.095]);
      places = await getCampusPlaces();
    } catch { /* Keep the source-backed event result usable when reports are offline. */ }
    const placeNames = new Map(places.map((place) => [place.id, place.name]));
    const sources: Array<{ id: string; kind: "event" | "hazard" | "official_record"; title: string; url?: string; date?: string; detail?: string }> = [];
    const eventContext = relevantEvents.map((event, index) => {
      const id = `E${index}`;
      sources.push({ id, kind: "event", title: event.title, url: event.sourceUrl, date: event.startsAt });
      return { id, title: event.title, subtitle: event.subtitle || null, starts_at: event.startsAt, ends_at: event.endsAt || null, location: event.venueName || event.locationLabel, source_url: event.sourceUrl, description: event.description.slice(0, 500) };
    });
    const hazardContext = hazards.slice(0, 40).map((report, index) => {
      const id = `H${index}`;
      const placeName = report.placeId ? placeNames.get(report.placeId) : null;
      sources.push({ id, kind: "hazard", title: report.title, date: report.lastObservedAt });
      return { id, kind: report.kind, title: report.title, place: placeName || "Approximate campus location", location_accuracy_m: report.locationAccuracyM, lifecycle: report.lifecycle, observation_count: report.observationCount, last_observed_at: report.lastObservedAt, observation_label: "unverified" };
    });

    let officialRecordContext: Array<Record<string, unknown>> = [];
    if (/\b(?:uwpd|police|blotter|historical incident|official record|crime record)\b/i.test(input.query)) {
      try {
        const result = await getUwpdBlotter(14);
        officialRecordContext = result.incidents.slice(0, 20).map((incident, index) => {
          const id = `P${index}`;
          sources.push({ id, kind: "official_record", title: `${incident.incidentType} · ${incident.locationLabel}`, url: incident.sourceUrl, date: incident.occurredAt, detail: incident.details?.slice(0, 240) });
          return { id, incident_type: incident.incidentType, date: incident.incidentDate, location: incident.locationLabel, details: incident.details || null, source_url: incident.sourceUrl, historical_only: true };
        });
      } catch { /* The answer will say the official archive could not be checked. */ }
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_ASSISTANT_MODEL?.trim() || process.env.OPENAI_REPORT_MODEL?.trim() || "gpt-6-luna";
    if (!apiKey) return jsonResponse({ error: "The campus assistant AI is not configured for this deployment yet." }, 503);
    const context = {
      date,
      timezone: "America/Chicago",
      events: eventContext,
      unverified_community_observations: hazardContext,
      historical_official_records: officialRecordContext,
      official_archive_unavailable: officialRecordContext.length === 0 && /\b(?:uwpd|police|blotter|historical incident|official record|crime record)\b/i.test(input.query),
    };
    const answerPayload = {
        model,
        input: [
          { role: "system", content: [{ type: "input_text", text: assistantSystemPrompt }] },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify({ query: input.query, context }) }] },
        ],
        text: { format: { type: "json_schema", name: "campus_answer", strict: true, schema: answerJsonSchema } },
        store: false,
      };
    async function generateAnswer(maxOutputTokens: number) {
      const responseBody = await callOpenAI("responses", { ...answerPayload, max_output_tokens: maxOutputTokens }, 18_000);
      return parseOpenAIStructuredOutput(responseBody, answerSchema);
    }
    let decoded;
    try {
      decoded = await generateAnswer(2048);
    } catch (error) {
      // A truncated JSON response cannot be repaired by parsing its partial text.
      // Retry once with room for both reasoning and the complete answer object.
      if (!(error instanceof OpenAIServiceError) || error.diagnostic !== "incomplete-output-limit") throw error;
      console.warn("Campus assistant retrying truncated response");
      decoded = await generateAnswer(4096);
    }
    const validSourceIds = new Set(sources.map((source) => source.id));
    const visibleSources = decoded.source_ids.filter((id) => validSourceIds.has(id)).map((id) => sources.find((source) => source.id === id)!).slice(0, 6);
    return jsonResponse({
      answer: decoded.answer,
      sources: visibleSources,
      reportActionAvailable: decoded.report_action_available && fallbackPhysicalIssueKinds(input.query).length > 0,
      date,
      dataFreshness: { eventsFetchedAt: eventsResult?.fetchedAt || null, eventSource: "UW Today", observations: "unverified community reports" },
    }, 200);
  } catch (error) {
    if (error instanceof OpenAIServiceError) {
      console.warn("Campus assistant model response failed", { code: error.code, diagnostic: error.diagnostic });
      const message = error.code === "not-configured" ? "The campus assistant model is not available to this project."
        : error.code === "invalid-response" ? "The campus assistant returned an incomplete or invalid answer."
          : "The campus assistant is temporarily unavailable.";
      return jsonResponse({ error: message }, error.code === "not-configured" ? 503 : 502);
    }
    if (error instanceof FingerprintConfigurationError || error instanceof ReportStoreError) return jsonResponse({ error: "The campus assistant is not configured on this server yet." }, 503);
    console.error("Read-only campus assistant request failed.");
    return jsonResponse({ error: "The campus assistant is temporarily unavailable." }, 503);
  }
}
