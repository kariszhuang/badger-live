import { intakePlanSchema, intakePlanJsonSchema } from "./structured-schema";
import { createReportIntakeSystemPrompt } from "./prompts";
import type { CampusPlace, IntakePlan } from "./types";
import { callOpenAI, moderationResultSchema, OpenAIServiceError, parseOpenAIStructuredOutput } from "./openai-client";
import { rankCampusPlaces } from "@/lib/campus-place-catalog";

// Server-only callers and the local prompt-evaluation CLI share this exact API
// boundary so an evaluation cannot silently drift from production's prompt/schema.
export class IntakeServiceError extends Error {
  constructor(readonly code: "not-configured" | "upstream" | "invalid-response", readonly diagnostic?: string) {
    super(code);
  }
}

export type IntakePromptContext = {
  selectedLocation?: {
    method: "gps" | "pin" | "place";
    available: boolean;
    accuracyM?: number;
    ageSeconds?: number;
    placeId?: string;
    placeName?: string;
  };
  nearbyHazards?: Array<{
    kind: string;
    title: string;
    lifecycle: string;
    lastObservedAt: string;
    approximateDistanceM: number;
  }>;
};

export async function interpretReport(input: {
  mode: "report" | "ask";
  text: string;
  places: CampusPlace[];
  context?: IntakePromptContext;
  photo?: string;
  now?: Date;
}): Promise<IntakePlan> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_REPORT_MODEL?.trim() || "gpt-6-luna";
  if (!apiKey) throw new IntakeServiceError("not-configured");
  const now = input.now || new Date();
  const system = createReportIntakeSystemPrompt(now);
  const rankedPlaces = rankCampusPlaces(input.places, input.text, 20);
  const candidates = (rankedPlaces.length ? rankedPlaces : input.places.slice(0, 20)).map(({ sourcePlaceId, name, aliases, coordinates }) => ({
    id: sourcePlaceId,
    name,
    aliases: aliases.slice(0, 8),
    coordinates,
  }));
  const userContent: Array<Record<string, unknown>> = [{
    type: "input_text",
    text: JSON.stringify({
      mode: input.mode,
      message: input.text,
      trusted_campus_places: candidates,
      selected_location: input.context?.selectedLocation || null,
      nearby_unverified_hazards: input.context?.nearbyHazards?.slice(0, 12) || [],
    }),
  }];
  if (input.photo) userContent.push({ type: "input_image", image_url: input.photo, detail: "low" });

  let body: unknown;
  try {
    body = await callOpenAI("responses", {
        model,
        input: [
          { role: "system", content: [{ type: "input_text", text: system }] },
          { role: "user", content: userContent },
        ],
        text: { format: { type: "json_schema", name: "campus_intake", strict: true, schema: intakePlanJsonSchema } },
        max_output_tokens: 900,
        store: false,
      }, 18_000);
  } catch (error) {
    throw translateOpenAIError(error);
  }
  let parsed: ReturnType<typeof intakePlanSchema.parse>;
  try { parsed = parseOpenAIStructuredOutput(body, intakePlanSchema); }
  catch (error) { throw translateOpenAIError(error); }
  return {
    intent: parsed.intent,
    issues: parsed.issues.map((issue) => ({
      kind: issue.kind,
      evidence: issue.evidence,
      placeName: issue.place_name,
      observedAt: issue.observed_at,
      observedAtBasis: issue.observed_at_basis,
      locationIntent: issue.location_intent,
      relativeToIssueIndex: issue.relative_to_issue_index,
    })),
    missingCriticalField: parsed.missing_critical_field,
    followup: parsed.followup,
    acknowledgment: parsed.acknowledgment,
  };
}

export async function moderateReportInput(text: string, photo?: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new IntakeServiceError("not-configured");
  const content: Array<Record<string, unknown>> = [{ type: "text", text }];
  if (photo) content.push({ type: "image_url", image_url: { url: photo } });
  let result: ReturnType<typeof moderationResultSchema.parse>;
  try {
    const body = await callOpenAI("moderations", { model: "omni-moderation-latest", input: content }, 12_000);
    result = moderationResultSchema.parse(body);
  } catch (error) {
    if (error instanceof OpenAIServiceError) throw translateOpenAIError(error);
    throw new IntakeServiceError("invalid-response", "moderation-schema");
  }
  return { allowed: !result.results[0].flagged };
}

function translateOpenAIError(error: unknown): IntakeServiceError {
  if (error instanceof OpenAIServiceError) return new IntakeServiceError(error.code, error.diagnostic);
  return new IntakeServiceError("upstream");
}
