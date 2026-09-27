import { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/report/route-helpers";
import { ReportStoreError, searchCampusPlaces } from "@/lib/report/store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") || "").trim();
  if (query.length < 2 || query.length > 80) return jsonResponse({ places: [] }, 200, { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" });
  try {
    const places = await searchCampusPlaces(query);
    return jsonResponse({ places }, 200, { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" });
  } catch (error) {
    if (error instanceof ReportStoreError) return jsonResponse({ error: "Campus place search is temporarily unavailable." }, 503);
    return jsonResponse({ error: "Campus place search is temporarily unavailable." }, 503);
  }
}
