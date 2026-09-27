import { NextRequest } from "next/server";
import { z } from "zod";
import { readBoundedJson, RequestBodyError } from "@/lib/report/body";
import { IntakeServiceError, interpretReport } from "@/lib/report/intake";
import { screenReportText } from "@/lib/report/policy";
import { checkRequestRateLimits, jsonResponse, requestHasAllowedOrigin } from "@/lib/report/route-helpers";
import { getCampusPlaces, ReportStoreError } from "@/lib/report/store";
import { FingerprintConfigurationError } from "@/lib/report/visitor-fingerprint";

export const runtime = "nodejs";

const inputSchema = z.object({
  mode: z.literal("ask"),
  visitorId: z.string().uuid(),
  text: z.string().trim().min(1).max(2000),
}).strict();

export async function POST(request: NextRequest) {
  if (!requestHasAllowedOrigin(request)) return jsonResponse({ error: "This request did not come from this site." }, 403);
  let body: unknown;
  try { body = await readBoundedJson(request, 16_384); }
  catch (error) { return jsonResponse({ error: "Use a valid short message." }, error instanceof RequestBodyError && error.code === "too_large" ? 413 : 400); }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return jsonResponse({ error: "Ask a short campus question." }, 400);
  const input = parsed.data;
  const screened = screenReportText(input.text);
  if (!screened.allowed && screened.reason === "emergency") {
    return jsonResponse({ outcome: "emergency", answer: "For an immediate emergency, call 911 or use a verified UW emergency channel. Badger Live is not an emergency service." }, 200);
  }
  try {
    const limits = await checkRequestRateLimits(request, input.visitorId, {
      network: { action: "interpret_network", limit: 30, windowSeconds: 3600 },
      visitor: { action: "interpret_browser", limit: 60, windowSeconds: 86400 },
    });
    if (!limits.allowed) return jsonResponse({ error: "You’ve asked several questions recently. Try again later." }, 429, { "Retry-After": String(limits.retryAfterSeconds) });
    const places = await getCampusPlaces();
    const plan = await interpretReport({ mode: "ask", text: input.text, places });
    return jsonResponse({ outcome: "interpreted", plan, canPostAsReport: plan.intent === "report" && plan.issues.length > 0 }, 200);
  } catch (error) {
    if (error instanceof FingerprintConfigurationError || error instanceof ReportStoreError) return jsonResponse({ error: "The campus assistant is not configured on this server yet." }, 503);
    if (error instanceof IntakeServiceError) return jsonResponse({ error: error.code === "not-configured" ? "The campus assistant AI is not configured for this deployment yet." : "The message could not be safely interpreted. Try again shortly." }, error.code === "not-configured" ? 503 : 502);
    return jsonResponse({ error: "The message could not be interpreted. Try again shortly." }, 503);
  }
}
