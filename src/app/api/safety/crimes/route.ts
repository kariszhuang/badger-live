import { NextRequest, NextResponse } from "next/server";
import { getUwpdBlotter, isCrimeWindowDays } from "@/lib/uwpd-blotter";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestedDays = request.nextUrl.searchParams.get("days");
  if (requestedDays && !isCrimeWindowDays(requestedDays)) {
    return NextResponse.json({ error: "Choose a 14- or 30-day window." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const result = await getUwpdBlotter(requestedDays === "14" ? 14 : 30);
    return NextResponse.json(result, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=300" } });
  } catch {
    return NextResponse.json(
      { error: "The UWPD public blotter is temporarily unavailable. No incidents have been invented." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
