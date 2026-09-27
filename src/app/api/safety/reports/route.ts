import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSafetyLocation } from "@/lib/safety-locations";
import { safetyReportSubmissionSchema } from "@/lib/safety";
import { readPublicSafetyReports, SafetyStoreError, submitSafetyReport } from "@/lib/safety-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const reports = await readPublicSafetyReports();
    return NextResponse.json({ reports }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Community reports are temporarily unavailable.", reports: [] }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Cross-site requests are not accepted." }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Use a valid JSON report." }, { status: 400 }); }
  const parsed = safetyReportSubmissionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Choose an environmental concern, a verified campus building, and when it was last observed." }, { status: 400 });

  try {
    const location = await getVerifiedSafetyLocation(parsed.data.buildingId);
    if (!location) return NextResponse.json({ error: "Choose a building from the campus directory." }, { status: 400 });

    const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || request.headers.get("user-agent") || "unknown";
    const key = process.env.SAFETY_REPORT_HASH_SECRET || process.env.DATABASE_URL || "badger-live-local-report-hash";
    const reporterHash = createHmac("sha256", key).update(address).digest("hex");
    const created = await submitSafetyReport({
      ...parsed.data,
      buildingName: location.buildingName,
      coordinates: location.coordinates,
      reporterHash,
    });

    return NextResponse.json({ id: created.id, status: "pending" }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SafetyStoreError) {
      if (error.code === "rate-limited") return NextResponse.json({ error: "You’ve sent the maximum number of private reports for today. For help now, use the official contacts below." }, { status: 429 });
      if (error.code === "duplicate") return NextResponse.json({ error: "A report for this concern and building was already received from this connection recently." }, { status: 409 });
    }
    return NextResponse.json({ error: "The private report queue is unavailable. Please contact UW through the official channels below." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
