import { NextRequest } from "next/server";
import { z } from "zod";
import { readBoundedJson, RequestBodyError } from "@/lib/report/body";
import { checkRequestRateLimits, jsonResponse, requestHasAllowedOrigin } from "@/lib/report/route-helpers";
import { inspectRouteAgainstHazards, routeBounds, routeLengthMeters } from "@/lib/report/route-inspection";
import { getWalkingDirections, WalkingDirectionsError } from "@/lib/report/walking-directions";
import { FingerprintConfigurationError } from "@/lib/report/visitor-fingerprint";
import { getCampusPlaces, listHazardsForRoute, ReportStoreError } from "@/lib/report/store";

export const runtime = "nodejs";

const requestSchema = z.object({
  visitorId: z.string().uuid(),
  originPlaceId: z.string().uuid(),
  destinationPlaceId: z.string().uuid(),
}).strict();

export async function POST(request: NextRequest) {
  if (!requestHasAllowedOrigin(request)) return jsonResponse({ error: "This request did not come from this site." }, 403);
  let body: unknown;
  try { body = await readBoundedJson(request, 4096); }
  catch (error) { return jsonResponse({ error: "Choose two campus places for a walking route." }, error instanceof RequestBodyError && error.code === "too_large" ? 413 : 400); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success || parsed.data.originPlaceId === parsed.data.destinationPlaceId) {
    return jsonResponse({ error: "Choose two different campus places." }, 400);
  }
  if (!process.env.OPENROUTESERVICE_API_KEY?.trim()) {
    return jsonResponse({ error: "Walking directions are not configured on this deployment yet.", code: "directions_not_configured" }, 503);
  }

  try {
    const rate = await checkRequestRateLimits(request, parsed.data.visitorId, {
      network: { action: "route_plan_network", limit: 10, windowSeconds: 3600 },
      visitor: { action: "route_plan_browser", limit: 20, windowSeconds: 86400 },
    });
    if (!rate.allowed) return jsonResponse({ error: "You’ve planned several routes recently. Try again later." }, 429, { "Retry-After": String(rate.retryAfterSeconds) });

    const places = await getCampusPlaces();
    const origin = places.find((place) => place.id === parsed.data.originPlaceId);
    const destination = places.find((place) => place.id === parsed.data.destinationPlaceId);
    if (!origin || !destination) return jsonResponse({ error: "Choose places from the campus search results." }, 400);

    const directions = await getWalkingDirections(origin, destination);
    if (routeLengthMeters(directions.coordinates) > 10_000) return jsonResponse({ error: "That route is too long to inspect from this campus map." }, 422);
    const bounds = routeBounds(directions.coordinates);
    const reports = bounds ? await listHazardsForRoute(bounds) : [];
    return jsonResponse({
      route: directions,
      origin: { id: origin.id, name: origin.name },
      destination: { id: destination.id, name: destination.name },
      warnings: inspectRouteAgainstHazards(directions.coordinates, reports),
      disclaimer: "This route uses OpenStreetMap pedestrian data and checks only current unverified reports. It is not verified for accessibility, safety, closures, or construction.",
    }, 200);
  } catch (error) {
    if (error instanceof FingerprintConfigurationError || error instanceof ReportStoreError) {
      return jsonResponse({ error: "Walking routes are temporarily unavailable. Try again shortly." }, 503);
    }
    if (error instanceof WalkingDirectionsError) {
      if (error.code === "not-configured") return jsonResponse({ error: "Walking directions are not configured on this deployment yet.", code: "directions_not_configured" }, 503);
      return jsonResponse({ error: "Walking directions are temporarily unavailable. Try again shortly." }, error.code === "invalid-response" ? 502 : 503);
    }
    return jsonResponse({ error: "Walking routes are temporarily unavailable. Try again shortly." }, 503);
  }
}
