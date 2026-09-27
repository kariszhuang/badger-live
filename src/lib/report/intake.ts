import "server-only";
import { intakePlanSchema, intakePlanJsonSchema } from "./structured-schema";
import { createReportIntakeSystemPrompt } from "./prompts";
import type { CampusPlace, IntakePlan } from "./types";

export class IntakeServiceError extends Error {
  constructor(readonly code: "not-configured" | "upstream" | "invalid-response") {
    super(code);
  }
}

export async function interpretReport(input: {
  mode: "report" | "ask";
  text: string;
  places: CampusPlace[];
  photo?: string;
  now?: Date;
}): Promise<IntakePlan> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_REPORT_MODEL;
  if (!apiKey || !model) throw new IntakeServiceError("not-configured");
  const now = input.now || new Date();
  const system = createReportIntakeSystemPrompt(now);
  const candidates = input.places.slice(0, 20).map(({ sourcePlaceId, name, aliases }) => ({
    id: sourcePlaceId,
    name,
    aliases: aliases.slice(0, 8),
  }));
  const userContent: Array<Record<string, unknown>> = [{
    type: "input_text",
    text: JSON.stringify({ mode: input.mode, message: input.text, trusted_campus_places: candidates }),
  }];
  if (input.photo) userContent.push({ type: "input_image", image_url: input.photo, detail: "low" });

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: [{ type: "input_text", text: system }] },
          { role: "user", content: userContent },
        ],
        text: { format: { type: "json_schema", name: "campus_intake", strict: true, schema: intakePlanJsonSchema } },
        max_output_tokens: 900,
        store: false,
      }),
      signal: AbortSignal.timeout(18_000),
      cache: "no-store",
    });
  } catch {
    throw new IntakeServiceError("upstream");
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403 || response.status === 404) throw new IntakeServiceError("not-configured");
    throw new IntakeServiceError("upstream");
  }
  const body = await response.json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const outputText = body.output?.flatMap((item) => item.content || []).find((part) => part.type === "output_text")?.text;
  if (!outputText) throw new IntakeServiceError("invalid-response");
  let decoded: unknown;
  try { decoded = JSON.parse(outputText); } catch { throw new IntakeServiceError("invalid-response"); }
  const parsed = intakePlanSchema.safeParse(decoded);
  if (!parsed.success) throw new IntakeServiceError("invalid-response");
  return {
    intent: parsed.data.intent,
    issues: parsed.data.issues.map((issue) => ({
      kind: issue.kind,
      evidence: issue.evidence,
      placeName: issue.place_name,
      observedAt: issue.observed_at,
      observedAtBasis: issue.observed_at_basis,
      locationIntent: issue.location_intent,
      relativeToIssueIndex: issue.relative_to_issue_index,
    })),
    missingCriticalField: parsed.data.missing_critical_field,
    followup: parsed.data.followup,
    acknowledgment: parsed.data.acknowledgment,
  };
}

export async function moderateReportInput(text: string, photo?: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new IntakeServiceError("not-configured");
  const content: Array<Record<string, unknown>> = [{ type: "text", text }];
  if (photo) content.push({ type: "image_url", image_url: { url: photo } });
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "omni-moderation-latest", input: content }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
  } catch {
    throw new IntakeServiceError("upstream");
  }
  if (!response.ok) throw new IntakeServiceError("upstream");
  const result = await response.json() as { results?: Array<{ flagged?: boolean }> };
  if (!Array.isArray(result.results) || typeof result.results[0]?.flagged !== "boolean") throw new IntakeServiceError("invalid-response");
  return { allowed: !result.results[0].flagged };
}
