import { NextRequest } from "next/server";
import { isWithinCampusMapBounds } from "@/lib/campus-map-bounds";
import { jsonResponse } from "@/lib/report/route-helpers";
import { listPublicHazards, ReportStoreError } from "@/lib/report/store";

export const runtime = "nodejs";

function parseBounds(value: string | null): [number, number, number, number] | null {
  if (!value) return [-89.455, 43.045, -89.375, 43.095];
  const parts = value.split(",").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const [west, south, east, north] = parts;
  if (west >= east || south >= north || !isWithinCampusMapBounds([west, south]) || !isWithinCampusMapBounds([east, north])) return null;
  return [west, south, east, north];
}

export async function GET(request: NextRequest) {
  const bounds = parseBounds(request.nextUrl.searchParams.get("bbox"));
  if (!bounds) return jsonResponse({ error: "Choose a map area inside the UW–Madison campus." }, 400);
  try {
    const reports = await listPublicHazards(bounds);
    return jsonResponse({ reports }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    if (error instanceof ReportStoreError) return jsonResponse({ error: "Community observations are temporarily unavailable." }, 503);
    return jsonResponse({ error: "Community observations are temporarily unavailable." }, 503);
  }
}
