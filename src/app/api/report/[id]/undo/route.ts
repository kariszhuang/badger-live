import { NextRequest } from "next/server";
import { z } from "zod";
import { readBoundedJson, RequestBodyError } from "@/lib/report/body";
import { checkRequestRateLimits, jsonResponse, MAX_REPORT_REQUEST_BYTES, reportWritesEnabled, requestHasAllowedOrigin } from "@/lib/report/route-helpers";
import { createCapabilityHash, FingerprintConfigurationError } from "@/lib/report/visitor-fingerprint";
import { ReportStoreError, undoHazard } from "@/lib/report/store";

export const runtime = "nodejs";

const schema = z.object({ visitorId: z.string().uuid(), capability: z.string().min(32).max(100) }).strict();
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  if (!requestHasAllowedOrigin(request)) return jsonResponse({ error: "This request did not come from this site." }, 403);
  if (!reportWritesEnabled()) return jsonResponse({ error: "Community reporting is temporarily in read-only mode." }, 503);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return jsonResponse({ error: "That report cannot be undone." }, 404);
  let body: unknown;
  try { body = await readBoundedJson(request, MAX_REPORT_REQUEST_BYTES); }
  catch (error) { return jsonResponse({ error: "Use a valid undo request." }, error instanceof RequestBodyError && error.code === "too_large" ? 413 : 400); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonResponse({ error: "The local undo capability is missing." }, 400);
  try {
    const rate = await checkRequestRateLimits(request, parsed.data.visitorId, {
      network: { action: "undo_network", limit: 10, windowSeconds: 3600 },
      visitor: { action: "undo_browser", limit: 5, windowSeconds: 3600 },
    });
    if (!rate.allowed) return jsonResponse({ error: "Try again later." }, 429, { "Retry-After": String(rate.retryAfterSeconds) });
    const undone = await undoHazard(id, createCapabilityHash(parsed.data.capability));
    return undone ? jsonResponse({ undone: true }, 200) : jsonResponse({ error: "This report can no longer be undone." }, 404);
  } catch (error) {
    if (error instanceof FingerprintConfigurationError || error instanceof ReportStoreError) return jsonResponse({ error: "The report could not be undone. Try again shortly." }, 503);
    return jsonResponse({ error: "The report could not be undone. Try again shortly." }, 503);
  }
}
