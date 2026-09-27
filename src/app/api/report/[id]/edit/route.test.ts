import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  checkRequestRateLimits: vi.fn(),
  createCapabilityHash: vi.fn(),
  editHazardCategory: vi.fn(),
}));

vi.mock("@/lib/report/route-helpers", () => ({
  MAX_REPORT_REQUEST_BYTES: 16_000,
  checkRequestRateLimits: (...args: unknown[]) => mocks.checkRequestRateLimits(...args),
  jsonResponse: (body: unknown, status = 200, headers?: HeadersInit) => Response.json(body, { status, headers }),
  reportWritesEnabled: () => true,
  requestHasAllowedOrigin: () => true,
}));

vi.mock("@/lib/report/visitor-fingerprint", () => ({
  FingerprintConfigurationError: class FingerprintConfigurationError extends Error {},
  createCapabilityHash: (...args: unknown[]) => mocks.createCapabilityHash(...args),
}));

vi.mock("@/lib/report/store", () => ({
  ReportStoreError: class ReportStoreError extends Error {},
  editHazardCategory: (...args: unknown[]) => mocks.editHazardCategory(...args),
}));

import { POST } from "./route";

const reportId = "00000000-0000-4000-8000-000000000555";
const visitorId = "00000000-0000-4000-8000-000000000101";
const report = {
  id: reportId, kind: "broken_light", title: "Broken exterior light", coordinates: [-89.407, 43.071],
  placeId: null, locationMethod: "pin", locationAccuracyM: null, reportedSeverity: "unknown",
  observationLabel: "unverified", lifecycle: "active", observationCount: 1,
  observedAt: "2026-09-27T12:00:00.000Z", lastObservedAt: "2026-09-27T12:00:00.000Z",
  expiresAt: "2026-09-28T00:00:00.000Z", version: 2,
};

function makeRequest(body: unknown) {
  const url = `http://localhost/api/report/${reportId}/edit`;
  return new NextRequest(url, {
    method: "POST",
    headers: { origin: url, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: reportId }) };

describe("POST /api/report/:id/edit", () => {
  beforeEach(() => {
    mocks.checkRequestRateLimits.mockReset().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.createCapabilityHash.mockReset().mockReturnValue("c".repeat(64));
    mocks.editHazardCategory.mockReset().mockResolvedValue(report);
  });

  it("hashes the local capability and sends only the expected category edit", async () => {
    const response = await POST(makeRequest({ visitorId, capability: "local-one-time-capability-value-123456", kind: "broken_light", expectedVersion: 1 }), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updated: true, report });
    expect(mocks.createCapabilityHash).toHaveBeenCalledWith("local-one-time-capability-value-123456");
    expect(mocks.editHazardCategory).toHaveBeenCalledWith(reportId, "c".repeat(64), "broken_light", 1);
    expect(mocks.checkRequestRateLimits).toHaveBeenCalledWith(expect.any(NextRequest), visitorId, {
      network: { action: "edit_network", limit: 10, windowSeconds: 3600 },
      visitor: { action: "edit_browser", limit: 5, windowSeconds: 3600 },
    });
  });

  it("rejects extra fields and invalid categories before touching the store", async () => {
    const extra = await POST(makeRequest({ visitorId, capability: "local-one-time-capability-value-123456", kind: "ice", expectedVersion: 1, text: "private source text" }), context);
    const invalidKind = await POST(makeRequest({ visitorId, capability: "local-one-time-capability-value-123456", kind: "person", expectedVersion: 1 }), context);

    expect(extra.status).toBe(400);
    expect(invalidKind.status).toBe(400);
    expect(mocks.editHazardCategory).not.toHaveBeenCalled();
  });

  it("returns a conflict when the report has changed or the capability no longer applies", async () => {
    mocks.editHazardCategory.mockResolvedValue(null);

    const response = await POST(makeRequest({ visitorId, capability: "local-one-time-capability-value-123456", kind: "broken_light", expectedVersion: 1 }), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("changed") });
  });

  it("returns not found for malformed report IDs", async () => {
    const response = await POST(makeRequest({}), { params: Promise.resolve({ id: "not-a-uuid" }) });

    expect(response.status).toBe(404);
    expect(mocks.editHazardCategory).not.toHaveBeenCalled();
  });
});
