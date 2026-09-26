import { NextRequest, NextResponse } from "next/server";
import { chicagoDate, isValidDate } from "@/lib/chicago-date";
import { getEventsForDate } from "@/lib/uw-events-api";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") || chicagoDate();
  if (!isValidDate(date)) return NextResponse.json({ error: "Date must be a real YYYY-MM-DD calendar date" }, { status: 400 });
  try {
    const result = await getEventsForDate(date);
    return NextResponse.json({ date, ...result }, { headers: { "Cache-Control": result.fallback ? "no-store" : "public, s-maxage=900, stale-while-revalidate=300" } });
  } catch {
    return NextResponse.json({ date, error: "UW calendar is temporarily unavailable. Please try again shortly." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
