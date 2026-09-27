import { NextRequest, NextResponse } from "next/server";
import { createRequestFingerprints } from "./visitor-fingerprint";
import { consumeRateLimit } from "./store";

export const NO_STORE_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export const MAX_REPORT_REQUEST_BYTES = 4 * 1024 * 1024;

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE_HEADERS, ...headers } });
}

export function requestHasAllowedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).origin === request.nextUrl.origin; } catch { return false; }
}

export function reportWritesEnabled() {
  return process.env.REPORT_WRITES_ENABLED === "true";
}

export async function checkRequestRateLimits(request: NextRequest, visitorId: string, input: {
  network: { action: string; limit: number; windowSeconds: number };
  visitor: { action: string; limit: number; windowSeconds: number };
}) {
  const fingerprints = createRequestFingerprints(request, visitorId);
  const [networkLimit, visitorLimit] = await Promise.all([
    consumeRateLimit({ keyHmac: fingerprints.networkHmac, ...input.network }),
    consumeRateLimit({ keyHmac: fingerprints.visitorHmac, ...input.visitor }),
  ]);
  return {
    ...fingerprints,
    allowed: networkLimit.allowed && visitorLimit.allowed,
    retryAfterSeconds: Math.max(networkLimit.retryAfterSeconds, visitorLimit.retryAfterSeconds),
  };
}
