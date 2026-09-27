import "server-only";
import { createHash, createHmac } from "node:crypto";
import type { NextRequest } from "next/server";

export class FingerprintConfigurationError extends Error {
  constructor() {
    super("Report fingerprinting is not configured");
  }
}

function hmac(value: string) {
  const secret = process.env.REPORT_FINGERPRINT_HMAC_KEY;
  if (!secret || Buffer.byteLength(secret) < 32) throw new FingerprintConfigurationError();
  return createHmac("sha256", secret).update(value).digest("hex");
}

function capabilitySecret() {
  const secret = process.env.REPORT_CAPABILITY_HMAC_KEY;
  if (!secret || Buffer.byteLength(secret) < 32) throw new FingerprintConfigurationError();
  return secret;
}

function clientNetwork(request: NextRequest) {
  const vercel = request.headers.get("x-vercel-forwarded-for");
  const cloudflare = request.headers.get("cf-connecting-ip");
  const forwarded = request.headers.get("x-forwarded-for");
  const nearestForwarded = forwarded?.split(",").map((part) => part.trim()).filter(Boolean).at(-1);
  return (vercel || cloudflare || nearestForwarded || request.headers.get("x-real-ip") || "local").slice(0, 128);
}

export function createRequestFingerprints(request: NextRequest, visitorId: string) {
  const networkHmac = hmac(`network:${clientNetwork(request)}`);
  const visitorHmac = hmac(`visitor:${networkHmac}:${visitorId}`);
  return { networkHmac, visitorHmac };
}

export function createCapabilityToken(reportId: string) {
  return createHmac("sha256", capabilitySecret())
    .update(`undo:${reportId}`)
    .digest("base64url");
}

export function createCapabilityHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function deterministicReportId(batchId: string, itemIndex: number) {
  const key = capabilitySecret();
  const bytes = createHmac("sha256", key).update(`report:${batchId}:${itemIndex}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createRequestDigest(value: unknown) {
  const key = process.env.REPORT_FINGERPRINT_HMAC_KEY;
  if (!key || Buffer.byteLength(key) < 32) throw new FingerprintConfigurationError();
  return createHmac("sha256", key).update(stableStringify(value)).digest("hex");
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
