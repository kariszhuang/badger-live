import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CampusPlace, HazardReport } from "@/lib/report/types";

const mocks = vi.hoisted(() => ({
  places: [] as CampusPlace[],
  reports: [] as HazardReport[],
  directions: { coordinates: [[-89.406, 43.075], [-89.405, 43.075]], distanceM: 82, durationS: 67 },
  checkRequestRateLimits: vi.fn(),
  getCampusPlaces: vi.fn(),
  getWalkingDirections: vi.fn(),
  listHazardsForRoute: vi.fn(),
}));

vi.mock("@/lib/report/route-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/report/route-helpers")>();
  return {
    ...actual,
    requestHasAllowedOrigin: () => true,
    checkRequestRateLimits: (...args: unknown[]) => mocks.checkRequestRateLimits(...args),
  };
});

vi.mock("@/lib/report/store", () => ({
  ReportStoreError: class ReportStoreError extends Error {},
  getCampusPlaces: () => mocks.getCampusPlaces(),
  listHazardsForRoute: (...args: unknown[]) => mocks.listHazardsForRoute(...args),
}));

vi.mock("@/lib/report/walking-directions", () => ({
  WalkingDirectionsError: class WalkingDirectionsError extends Error {
    constructor(readonly code: "not-configured" | "upstream" | "invalid-response") { super(code); }
  },
  getWalkingDirections: (...args: unknown[]) => mocks.getWalkingDirections(...args),
}));

vi.mock("@/lib/report/visitor-fingerprint", () => ({
  FingerprintConfigurationError: class FingerprintConfigurationError extends Error {},
}));

import { POST } from "./route";

const originPlace: CampusPlace = {
  id: "00000000-0000-4000-8000-000000000010", sourcePlaceId: "union-south", name: "Union South",
  aliases: [], kind: "building", coordinates: [-89.406, 43.075], officialSourceUrl: "https://map.wisc.edu/",
};
const destinationPlace: CampusPlace = {
  id: "00000000-0000-4000-8000-000000000011", sourcePlaceId: "van-vleck", name: "Van Vleck Hall",
  aliases: [], kind: "building", coordinates: [-89.405, 43.075], officialSourceUrl: "https://map.wisc.edu/",
};
const originalKey = process.env.OPENROUTESERVICE_API_KEY;

function request(input: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/routes/plan", {
    method: "POST",
    headers: { origin: "http://localhost", "content-type": "application/json" },
    body: JSON.stringify({
      visitorId: "00000000-0000-4000-8000-000000000101",
      originPlaceId: originPlace.id,
      destinationPlaceId: destinationPlace.id,
      ...input,
    }),
  });
}

beforeEach(() => {
  process.env.OPENROUTESERVICE_API_KEY = "test-server-only-key";
  mocks.places = [originPlace, destinationPlace];
  mocks.reports = [];
  mocks.directions = { coordinates: [originPlace.coordinates, destinationPlace.coordinates], distanceM: 82, durationS: 67 };
  mocks.checkRequestRateLimits.mockReset().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  mocks.getCampusPlaces.mockReset().mockResolvedValue(mocks.places);
  mocks.getWalkingDirections.mockReset().mockImplementation(async () => mocks.directions);
  mocks.listHazardsForRoute.mockReset().mockImplementation(async () => mocks.reports);
});

afterAll(() => {
  if (originalKey === undefined) delete process.env.OPENROUTESERVICE_API_KEY;
  else process.env.OPENROUTESERVICE_API_KEY = originalKey;
});

describe("POST /api/routes/plan", () => {
  it("routes only between trusted selected places and returns nearby unverified observations", async () => {
    mocks.reports = [{
      id: "00000000-0000-4000-8000-000000000222", kind: "ice", title: "Icy surface", coordinates: [-89.4055, 43.075],
      placeId: null, locationMethod: "pin", locationAccuracyM: null, reportedSeverity: "unknown", observationLabel: "unverified",
      lifecycle: "active", observationCount: 2, observedAt: new Date().toISOString(), lastObservedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), version: 1,
    }];
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getWalkingDirections).toHaveBeenCalledWith(originPlace, destinationPlace);
    expect(body.route).toEqual(mocks.directions);
    expect(body.warnings).toMatchObject([{ title: "Icy surface", observationLabel: "unverified", observationCount: 2 }]);
    expect(body.disclaimer).toMatch(/not verified for accessibility/i);
  });

  it("does not call the directions provider when no server key is configured", async () => {
    delete process.env.OPENROUTESERVICE_API_KEY;
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ code: "directions_not_configured" });
    expect(mocks.getWalkingDirections).not.toHaveBeenCalled();
    expect(mocks.getCampusPlaces).not.toHaveBeenCalled();
  });

  it("rejects identical endpoints before using rate or directions services", async () => {
    const response = await POST(request({ destinationPlaceId: originPlace.id }));
    expect(response.status).toBe(400);
    expect(mocks.checkRequestRateLimits).not.toHaveBeenCalled();
    expect(mocks.getWalkingDirections).not.toHaveBeenCalled();
  });
});
