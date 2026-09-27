import "server-only";
import { z } from "zod";

export class OpenAIServiceError extends Error {
  constructor(
    readonly code: "not-configured" | "upstream" | "invalid-response",
    readonly diagnostic?: string,
  ) {
    super(code);
    this.name = "OpenAIServiceError";
  }
}

type OpenAIEndpoint = "responses" | "moderations";

export async function callOpenAI(endpoint: OpenAIEndpoint, payload: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new OpenAIServiceError("not-configured");

  let response: Response;
  try {
    response = await fetch(`https://api.openai.com/v1/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    const diagnostic = error && typeof error === "object" && "name" in error && error.name === "TimeoutError" ? "timeout" : "network";
    throw new OpenAIServiceError("upstream", diagnostic);
  }

  if (!response.ok) {
    const code = [401, 403, 404].includes(response.status) ? "not-configured" : "upstream";
    throw new OpenAIServiceError(code, `http-${response.status}`);
  }

  try {
    return await response.json() as unknown;
  } catch {
    throw new OpenAIServiceError("invalid-response", "malformed-api-json");
  }
}

export function parseOpenAIStructuredOutput<TSchema extends z.ZodType>(body: unknown, schema: TSchema): z.infer<TSchema> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new OpenAIServiceError("invalid-response", "malformed-response-body");
  }
  const response = body as Record<string, unknown>;
  const status = typeof response.status === "string" ? response.status : undefined;
  const incompleteDetails = response.incomplete_details && typeof response.incomplete_details === "object"
    ? response.incomplete_details as Record<string, unknown>
    : {};
  if (status && status !== "completed") {
    const diagnostic = status === "incomplete"
      ? incompleteDetails.reason === "max_output_tokens" ? "incomplete-output-limit" : "incomplete-response"
      : `response-${status}`;
    throw new OpenAIServiceError("invalid-response", diagnostic);
  }
  const output = Array.isArray(response.output) ? response.output : [];
  const content = output.flatMap((item) => {
    if (!item || typeof item !== "object" || !Array.isArray((item as Record<string, unknown>).content)) return [];
    return (item as { content: unknown[] }).content.filter((part): part is Record<string, unknown> => Boolean(part && typeof part === "object" && !Array.isArray(part)));
  });
  const textPart = content.find((part) => part.type === "output_text" && typeof part.text === "string");
  const text = typeof textPart?.text === "string" ? textPart.text : undefined;
  if (!text) {
    const diagnostic = content.some((part) => part.type === "refusal") ? "refusal" : "missing-output-text";
    throw new OpenAIServiceError("invalid-response", diagnostic);
  }

  let decoded: unknown;
  try { decoded = JSON.parse(text); }
  catch { throw new OpenAIServiceError("invalid-response", "malformed-output-json"); }
  const parsed = schema.safeParse(decoded);
  if (!parsed.success) {
    const paths = [...new Set(parsed.error.issues.slice(0, 4).map((issue) => issue.path.join(".") || "root"))];
    throw new OpenAIServiceError("invalid-response", `schema-${paths.join(",")}`);
  }
  return parsed.data;
}

export const moderationResultSchema = z.object({
  results: z.array(z.object({ flagged: z.boolean() }).passthrough()).min(1),
}).passthrough();
