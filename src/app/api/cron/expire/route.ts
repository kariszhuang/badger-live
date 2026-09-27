import { NextRequest } from "next/server";
import { expireHazards, ReportStoreError } from "@/lib/report/store";
import { jsonResponse } from "@/lib/report/route-helpers";

export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && Buffer.byteLength(secret) >= 32 && request.headers.get("authorization") === `Bearer ${secret}`);
}

async function run(request: NextRequest) {
  if (!authorized(request)) return jsonResponse({ error: "Not authorized." }, 401);
  try { return jsonResponse({ expired: await expireHazards() }, 200); }
  catch (error) {
    if (error instanceof ReportStoreError) return jsonResponse({ error: "Expiry housekeeping is temporarily unavailable." }, 503);
    return jsonResponse({ error: "Expiry housekeeping is temporarily unavailable." }, 503);
  }
}

export const GET = run;
export const POST = run;
