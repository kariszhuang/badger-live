import { NextRequest } from "next/server";
import { z } from "zod";
import { readBoundedJson, RequestBodyError } from "@/lib/report/body";
import { checkRequestRateLimits, jsonResponse, MAX_REPORT_REQUEST_BYTES, reportWritesEnabled, requestHasAllowedOrigin } from "@/lib/report/route-helpers";
import { observeHazard, ReportStoreError } from "@/lib/report/store";
import { FingerprintConfigurationError } from "@/lib/report/visitor-fingerprint";

export const runtime = "nodejs";

const schema = z.object({ visitorId: z.string().uuid(), observation: z.enum(["still_there", "possibly_cleared"]) }).strict();
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  if (!requestHasAllowedOrigin(request)) return jsonResponse({ error: "This request did not come from this site." }, 403);
  if (!reportWritesEnabled()) return jsonResponse({ error: "Community reporting is temporarily in read-only mode." }, 503);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return jsonResponse({ error: "That observation is no longer available." }, 404);
  let body: unknown;
  try { body = await readBoundedJson(request, MAX_REPORT_REQUEST_BYTES); }
  catch (error) { return jsonResponse({ error: "Use a valid recheck." }, error instanceof RequestBodyError && error.code === "too_large" ? 413 : 400); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonResponse({ error: "Choose Still there or Possibly cleared." }, 400);
  try {
    const rate = await checkRequestRateLimits(request, parsed.data.visitorId, {
      network: { action: "observe_network", limit: 20, windowSeconds: 3600 },
      visitor: { action: "observe_browser", limit: 6, windowSeconds: 3600 },
    });
    if (!rate.allowed) return jsonResponse({ error: "You’ve checked several reports recently. Try again later." }, 429, { "Retry-After": String(rate.retryAfterSeconds) });
    const result = await observeHazard(id, rate.visitorHmac, parsed.data.observation);
    return jsonResponse({ result }, 200);
  } catch (error) {
    if (error instanceof FingerprintConfigurationError || error instanceof ReportStoreError) return jsonResponse({ error: "The recheck could not be saved. Try again shortly." }, 503);
    return jsonResponse({ error: "The recheck could not be saved. Try again shortly." }, 503);
  }
}
