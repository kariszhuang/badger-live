import { NextRequest } from "next/server";
import { z } from "zod";
import { isWithinCampusMapBounds } from "@/lib/campus-map-bounds";
import { readBoundedJson, RequestBodyError } from "@/lib/report/body";
import { checkRequestRateLimits, jsonResponse, requestHasAllowedOrigin } from "@/lib/report/route-helpers";
import { inspectRouteAgainstHazards, routeBounds, routeLengthMeters } from "@/lib/report/route-inspection";
import { FingerprintConfigurationError } from "@/lib/report/visitor-fingerprint";
import { listHazardsForRoute, ReportStoreError } from "@/lib/report/store";

export const runtime = "nodejs";

const coordinateSchema = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);
const requestSchema = z.object({ visitorId: z.string().uuid(), route: z.array(coordinateSchema).min(2).max(100) }).strict();

export async function POST(request: NextRequest) {
  if (!requestHasAllowedOrigin(request)) return jsonResponse({ error: "This request did not come from this site." }, 403);
  let body: unknown;
  try { body = await readBoundedJson(request, 24_576); }
  catch (error) { return jsonResponse({ error: "Choose a short candidate route." }, error instanceof RequestBodyError && error.code === "too_large" ? 413 : 400); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success || parsed.data.route.some((coordinate) => !isWithinCampusMapBounds(coordinate))) {
    return jsonResponse({ error: "Choose a candidate route inside the UW–Madison campus map." }, 400);
  }
  const route = parsed.data.route;
  if (routeLengthMeters(route) > 10_000) return jsonResponse({ error: "That candidate route is too long to inspect." }, 400);
  const bounds = routeBounds(route);
  if (!bounds) return jsonResponse({ warnings: [], disclaimer: "This checks only current unverified observations; it cannot establish safety or accessibility." }, 200);
  try {
    const rate = await checkRequestRateLimits(request, parsed.data.visitorId, {
      network: { action: "route_inspect_network", limit: 30, windowSeconds: 3600 },
      visitor: { action: "route_inspect_browser", limit: 60, windowSeconds: 86400 },
    });
    if (!rate.allowed) return jsonResponse({ error: "You’ve checked several routes recently. Try again later." }, 429, { "Retry-After": String(rate.retryAfterSeconds) });
    const reports = await listHazardsForRoute(bounds);
    return jsonResponse({
      warnings: inspectRouteAgainstHazards(route, reports),
      disclaimer: "This checks current unverified observations only. A clear result does not establish that a route is safe, accessible, or unobstructed.",
    }, 200);
  } catch (error) {
    if (error instanceof FingerprintConfigurationError || error instanceof ReportStoreError) return jsonResponse({ error: "Route observations are temporarily unavailable." }, 503);
    return jsonResponse({ error: "Route observations are temporarily unavailable." }, 503);
  }
}
