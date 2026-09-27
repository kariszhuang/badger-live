import { NextRequest } from "next/server";
import { z } from "zod";
import { chicagoDate, isValidDate } from "@/lib/chicago-date";
import { getEventsForDate } from "@/lib/uw-events-api";
import { getUwpdBlotter } from "@/lib/uwpd-blotter";
import { readBoundedJson, RequestBodyError } from "@/lib/report/body";
import { fallbackPhysicalIssueKinds } from "@/lib/report/policy";
import { assistantSystemPrompt } from "@/lib/report/prompts";
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
      return { id, kind: report.kind, title: report.title, place: placeName || "Approximate campus location", location_accuracy_m: report.locationAccuracyM, lifecycle: report.lifecycle, observation_count: report.observationCount, last_observed_at: report.lastObservedAt, observation_label: "unverified", coordinates: report.coordinates };
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
    const model = process.env.OPENAI_ASSISTANT_MODEL || process.env.OPENAI_REPORT_MODEL;
    if (!apiKey || !model) return jsonResponse({ error: "The campus assistant AI is not configured for this deployment yet." }, 503);
    const context = JSON.stringify({
      date,
      timezone: "America/Chicago",
      events: eventContext,
      unverified_community_observations: hazardContext,
      historical_official_records: officialRecordContext,
      official_archive_unavailable: officialRecordContext.length === 0 && /\b(?:uwpd|police|blotter|historical incident|official record|crime record)\b/i.test(input.query),
    });
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: [{ type: "input_text", text: assistantSystemPrompt }] },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify({ query: input.query, context: JSON.parse(context) }) }] },
        ],
        text: { format: { type: "json_schema", name: "campus_answer", strict: true, schema: answerJsonSchema } },
        max_output_tokens: 650,
        store: false,
      }),
      signal: AbortSignal.timeout(18_000),
      cache: "no-store",
    });
    if (!response.ok) return jsonResponse({ error: response.status === 401 || response.status === 403 || response.status === 404 ? "The campus assistant model is not available to this project." : "The campus assistant is temporarily unavailable." }, 502);
    const responseBody = await response.json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    const text = responseBody.output?.flatMap((item) => item.content || []).find((part) => part.type === "output_text")?.text;
    if (!text) return jsonResponse({ error: "The campus assistant returned an incomplete answer." }, 502);
    const decoded = answerSchema.safeParse(JSON.parse(text));
    if (!decoded.success) return jsonResponse({ error: "The campus assistant returned an invalid answer." }, 502);
    const validSourceIds = new Set(sources.map((source) => source.id));
    const visibleSources = decoded.data.source_ids.filter((id) => validSourceIds.has(id)).map((id) => sources.find((source) => source.id === id)!).slice(0, 6);
    return jsonResponse({
      answer: decoded.data.answer,
      sources: visibleSources,
      reportActionAvailable: decoded.data.report_action_available && fallbackPhysicalIssueKinds(input.query).length > 0,
      date,
      dataFreshness: { eventsFetchedAt: eventsResult?.fetchedAt || null, eventSource: "UW Today", observations: "unverified community reports" },
    }, 200);
  } catch (error) {
    if (error instanceof FingerprintConfigurationError || error instanceof ReportStoreError) return jsonResponse({ error: "The campus assistant is not configured on this server yet." }, 503);
    console.error("Read-only campus assistant request failed.");
    return jsonResponse({ error: "The campus assistant is temporarily unavailable." }, 503);
  }
}
