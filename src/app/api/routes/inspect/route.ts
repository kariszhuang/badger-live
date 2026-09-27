import { NextRequest } from "next/server";
import { z } from "zod";
import { isWithinCampusMapBounds } from "@/lib/campus-map-bounds";
import { readBoundedJson, RequestBodyError } from "@/lib/report/body";
import { checkRequestRateLimits, jsonResponse, requestHasAllowedOrigin } from "@/lib/report/route-helpers";
import { inspectRouteAgainstHazards } from "@/lib/report/route-inspection";
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
  const distance = route.slice(1).reduce((total, point, index) => total + Math.hypot((point[0] - route[index][0]) * 82_000, (point[1] - route[index][1]) * 111_000), 0);
  if (distance > 10_000) return jsonResponse({ error: "That candidate route is too long to inspect." }, 400);
  const bounds: [number, number, number, number] = [
    Math.max(-89.455, Math.min(...route.map(([longitude]) => longitude)) - 0.002),
    Math.max(43.045, Math.min(...route.map(([, latitude]) => latitude)) - 0.002),
    Math.min(-89.375, Math.max(...route.map(([longitude]) => longitude)) + 0.002),
    Math.min(43.095, Math.max(...route.map(([, latitude]) => latitude)) + 0.002),
  ];
  if (bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) return jsonResponse({ warnings: [], disclaimer: "This checks only current unverified observations; it cannot establish safety or accessibility." }, 200);
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
