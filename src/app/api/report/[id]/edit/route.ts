import { NextRequest } from "next/server";
import { z } from "zod";
import { readBoundedJson, RequestBodyError } from "@/lib/report/body";
import { hazardKinds } from "@/lib/report/types";
import { checkRequestRateLimits, jsonResponse, MAX_REPORT_REQUEST_BYTES, reportWritesEnabled, requestHasAllowedOrigin } from "@/lib/report/route-helpers";
import { createCapabilityHash, FingerprintConfigurationError } from "@/lib/report/visitor-fingerprint";
import { editHazardCategory, ReportStoreError } from "@/lib/report/store";

export const runtime = "nodejs";

const schema = z.object({
  visitorId: z.string().uuid(),
  capability: z.string().min(32).max(100),
  kind: z.enum(hazardKinds),
  expectedVersion: z.number().int().min(1).max(1_000_000),
}).strict();
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  if (!requestHasAllowedOrigin(request)) return jsonResponse({ error: "This edit request did not come from this site." }, 403);
  if (!reportWritesEnabled()) return jsonResponse({ error: "Community reporting is temporarily in read-only mode." }, 503);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return jsonResponse({ error: "That report is no longer editable." }, 404);

  let body: unknown;
  try { body = await readBoundedJson(request, MAX_REPORT_REQUEST_BYTES); }
  catch (error) { return jsonResponse({ error: "Use a valid category edit." }, error instanceof RequestBodyError && error.code === "too_large" ? 413 : 400); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonResponse({ error: "The local edit capability or category is invalid." }, 400);

  try {
    const rate = await checkRequestRateLimits(request, parsed.data.visitorId, {
      network: { action: "edit_network", limit: 10, windowSeconds: 3600 },
      visitor: { action: "edit_browser", limit: 5, windowSeconds: 3600 },
    });
    if (!rate.allowed) return jsonResponse({ error: "Try again later." }, 429, { "Retry-After": String(rate.retryAfterSeconds) });
    const report = await editHazardCategory(id, createCapabilityHash(parsed.data.capability), parsed.data.kind, parsed.data.expectedVersion);
    return report
      ? jsonResponse({ updated: true, report }, 200)
      : jsonResponse({ error: "This report has changed or is no longer editable." }, 409);
  } catch (error) {
    if (error instanceof FingerprintConfigurationError || error instanceof ReportStoreError) return jsonResponse({ error: "The report could not be edited. Try again shortly." }, 503);
    return jsonResponse({ error: "The report could not be edited. Try again shortly." }, 503);
  }
}
