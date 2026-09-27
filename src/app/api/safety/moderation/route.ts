import { NextRequest, NextResponse } from "next/server";
import { safetyModerationActionSchema } from "@/lib/safety";
import { getSafetyModerator, safetyModerationConfigured } from "@/lib/safety-moderator";
import { moderateSafetyReports, readSafetyModerationQueue, SafetyStoreError } from "@/lib/safety-store";

export const runtime = "nodejs";

async function authorize(request: NextRequest) {
  if (!safetyModerationConfigured()) return { response: NextResponse.json({ error: "No human reviewer is assigned. Reports remain private." }, { status: 503 }) };
  const origin = request.headers.get("origin");
  if (request.method !== "GET" && (!origin || origin !== request.nextUrl.origin)) {
    return { response: NextResponse.json({ error: "Cross-site review actions are not accepted." }, { status: 403 }) };
  }
  const email = await getSafetyModerator();
  if (!email) return { response: NextResponse.json({ error: "Sign in with an assigned, verified moderator account." }, { status: 401 }) };
  return { email };
}

export async function GET(request: NextRequest) {
  const access = await authorize(request);
  if ("response" in access) return access.response;
  try {
    const items = await readSafetyModerationQueue();
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The private review queue is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  const access = await authorize(request);
  if ("response" in access) return access.response;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Use a valid review action." }, { status: 400 }); }
  const parsed = safetyModerationActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "The review action is incomplete." }, { status: 400 });

  try {
    const result = await moderateSafetyReports({ ...parsed.data, reviewerEmail: access.email });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SafetyStoreError) {
      if (error.code === "needs-more-reports") return NextResponse.json({ error: "Community confirmation requires two distinct reports and an explicit human verification." }, { status: 409 });
      if (error.code === "not-found") return NextResponse.json({ error: "Those reports have already been reviewed or expired." }, { status: 404 });
    }
    return NextResponse.json({ error: "The review action could not be saved." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
