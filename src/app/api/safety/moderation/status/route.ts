import { NextResponse } from "next/server";
import { safetyModerationConfigured, getSafetyModerator } from "@/lib/safety-moderator";

export const runtime = "nodejs";

export async function GET() {
  if (!safetyModerationConfigured()) {
    return NextResponse.json({ configured: false, authenticated: false, reason: "reviewer-unassigned" }, { headers: { "Cache-Control": "no-store" } });
  }
  const moderator = await getSafetyModerator();
  return NextResponse.json({ configured: true, authenticated: Boolean(moderator) }, { headers: { "Cache-Control": "no-store" } });
}
