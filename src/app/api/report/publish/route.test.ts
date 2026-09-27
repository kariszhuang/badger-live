import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CampusPlace, IntakePlan } from "@/lib/report/types";

const mocks = vi.hoisted(() => ({
  plan: null as unknown,
  places: [] as Array<Record<string, unknown>>,
  namedPlaces: [] as Array<Record<string, unknown>>,
  candidates: [] as Array<Record<string, unknown>>,
  submittedItems: [] as Array<Record<string, unknown>>,
  interpretReport: vi.fn(),
  moderateReportInput: vi.fn(),
  findDuplicateCandidates: vi.fn(),
  publishHazardBatch: vi.fn(),
}));

vi.mock("@/lib/report/intake", () => ({
  IntakeServiceError: class IntakeServiceError extends Error {
    constructor(readonly code: "not-configured" | "upstream" | "invalid-response") { super(code); }
  },
  interpretReport: (...args: unknown[]) => mocks.interpretReport(...args),
  moderateReportInput: (...args: unknown[]) => mocks.moderateReportInput(...args),
}));

vi.mock("@/lib/report/route-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/report/route-helpers")>();
  return {
    ...actual,
    requestHasAllowedOrigin: () => true,
    reportWritesEnabled: () => true,
    checkRequestRateLimits: async () => ({ allowed: true, retryAfterSeconds: 0, networkHmac: "a".repeat(64), visitorHmac: "b".repeat(64) }),
  };
});

vi.mock("@/lib/report/store", () => ({
  ReportStoreError: class ReportStoreError extends Error {
    constructor(readonly code: "unavailable" | "idempotency_conflict" | "duplicate_changed" | "invalid" | "not_found") { super(code); }
  },
  findDuplicateCandidates: (...args: unknown[]) => mocks.findDuplicateCandidates(...args),
  findNamedPlacesInText: async () => mocks.namedPlaces,
  getCampusPlaces: async () => mocks.places,
  publishHazardBatch: (...args: unknown[]) => mocks.publishHazardBatch(...args),
}));

vi.mock("@/lib/report/visitor-fingerprint", () => ({
  FingerprintConfigurationError: class FingerprintConfigurationError extends Error {},
  createCapabilityHash: () => "c".repeat(64),
  createCapabilityToken: (id: string) => `${id}.undo-token`,
  createRequestDigest: () => "d".repeat(64),
  deterministicReportId: (_submissionId: string, itemIndex: number) => `00000000-0000-4000-8000-${String(itemIndex + 1).padStart(12, "0")}`,
}));

import { POST } from "./route";

const place: CampusPlace = {
  id: "00000000-0000-4000-8000-000000000010",
  sourcePlaceId: "van-vleck",
  name: "Van Vleck Hall",
  aliases: ["Van Vleck"],
  kind: "building",
  coordinates: [-89.4055, 43.0756],
  officialSourceUrl: "https://map.wisc.edu/",
};

function makePlan(issues: IntakePlan["issues"], missingCriticalField: IntakePlan["missingCriticalField"] = "none"): IntakePlan {
  return { intent: "report", issues, missingCriticalField, followup: null, acknowledgment: "Thanks for reporting this." };
}

function makeIssue(overrides: Partial<IntakePlan["issues"][number]> = {}): IntakePlan["issues"][number] {
  return {
    kind: "ice", evidence: "icy here", placeName: null, observedAt: null, observedAtBasis: "submission",
    locationIntent: "here", relativeToIssueIndex: null, ...overrides,
  };
}

function makeRequest(input: Record<string, unknown>) {
  const url = "http://localhost/api/report/publish";
  return new NextRequest(url, {
    method: "POST",
    headers: { origin: url, "content-type": "application/json" },
    body: JSON.stringify({
      mode: "report",
      submissionId: "00000000-0000-4000-8000-000000000100",
      visitorId: "00000000-0000-4000-8000-000000000101",
      text: "Icy here",
      location: { method: "gps", longitude: -89.407, latitude: 43.071, accuracyM: 18, capturedAt: Date.now() },
      ...input,
    }),
  });
}

function preparePublishedRows(input: { items: Array<Record<string, unknown>> }) {
  mocks.submittedItems = input.items;
  return {
    idempotent: false,
    reports: input.items.map((item) => ({
      id: item.report_id,
      kind: item.kind,
      title: item.kind === "broken_light" ? "Broken exterior light" : "Icy surface",
      coordinates: [item.longitude, item.latitude],
      placeId: item.place_id,
      locationMethod: item.location_method,
      locationAccuracyM: item.location_accuracy_m,
      reportedSeverity: item.reported_severity,
      observationLabel: "unverified" as const,
      lifecycle: "active" as const,
      observationCount: 1,
      observedAt: item.observed_at,
      lastObservedAt: item.observed_at,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      version: 1,
      undoAvailable: true,
    })),
  };
}

beforeEach(() => {
  mocks.plan = makePlan([makeIssue()]);
  mocks.places = [];
  mocks.namedPlaces = [];
  mocks.candidates = [];
  mocks.submittedItems = [];
  mocks.interpretReport.mockReset().mockImplementation(async () => mocks.plan);
  mocks.moderateReportInput.mockReset().mockResolvedValue({ allowed: true });
  mocks.findDuplicateCandidates.mockReset().mockImplementation(async () => mocks.candidates);
  mocks.publishHazardBatch.mockReset().mockImplementation(async (input: { items: Array<Record<string, unknown>> }) => preparePublishedRows(input));
});

describe("POST /api/report/publish", () => {
  it("publishes a multi-issue message in one atomic batch and resolves relative issues together", async () => {
    mocks.plan = makePlan([
      makeIssue({ evidence: "Very icy here" }),
      makeIssue({ kind: "broken_light", evidence: "light is broken", locationIntent: "relative", relativeToIssueIndex: 0 }),
    ]);
    const response = await POST(makeRequest({ text: "Very icy here, and the light is broken next to it." }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ outcome: "posted", postedCount: 2 });
    expect(mocks.moderateReportInput).toHaveBeenCalledTimes(1);
    expect(mocks.interpretReport).toHaveBeenCalledTimes(1);
    expect(mocks.publishHazardBatch).toHaveBeenCalledTimes(1);
    expect(mocks.submittedItems).toHaveLength(2);
    expect(mocks.submittedItems[0]).toMatchObject({ item_index: 0, kind: "ice", action: "new" });
    expect(mocks.submittedItems[1]).toMatchObject({ item_index: 1, kind: "broken_light", action: "new" });
    expect(mocks.submittedItems[1]?.longitude).toBe(mocks.submittedItems[0]?.longitude);
    expect(mocks.submittedItems[1]?.latitude).toBe(mocks.submittedItems[0]?.latitude);
  });

  it("asks for a location instead of pinning a location-missing issue to fresh GPS", async () => {
    mocks.plan = makePlan([makeIssue({ locationIntent: "missing" })], "location");
    const response = await POST(makeRequest({ text: "There is ice somewhere on campus." }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ outcome: "needs_followup" });
    expect(body.question).toMatch(/where on campus|choose|search/i);
    expect(mocks.findDuplicateCandidates).not.toHaveBeenCalled();
    expect(mocks.publishHazardBatch).not.toHaveBeenCalled();
  });

  it("honors a chosen map pin before a conflicting named place", async () => {
    mocks.places = [place];
    mocks.namedPlaces = [place];
    mocks.plan = makePlan([makeIssue({ placeName: "Van Vleck", locationIntent: "named_place" })]);
    const pin = { method: "pin", longitude: -89.401, latitude: 43.073 };
    const response = await POST(makeRequest({ text: "Icy at Van Vleck Hall", location: pin }));
    const body = await response.json();

    expect(body).toMatchObject({ outcome: "posted", postedCount: 1 });
    expect(mocks.submittedItems[0]).toMatchObject({ longitude: pin.longitude, latitude: pin.latitude, location_method: "pin", place_id: null });
  });

  it("uses an explicitly named trusted place instead of unrelated GPS", async () => {
    mocks.places = [place];
    mocks.namedPlaces = [place];
    mocks.plan = makePlan([makeIssue({ placeName: "Van Vleck", locationIntent: "named_place" })]);
    const response = await POST(makeRequest({ text: "I saw ice at Van Vleck Hall." }));
    const body = await response.json();

    expect(body).toMatchObject({ outcome: "posted", postedCount: 1 });
    expect(mocks.submittedItems[0]).toMatchObject({ longitude: place.coordinates[0], latitude: place.coordinates[1], location_method: "place", place_id: place.id });
  });

  it("does not send prohibited person allegations to the model or database", async () => {
    const response = await POST(makeRequest({ text: "Alice stole my phone near the Union." }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({ outcome: "not_published" });
    expect(mocks.moderateReportInput).not.toHaveBeenCalled();
    expect(mocks.interpretReport).not.toHaveBeenCalled();
    expect(mocks.publishHazardBatch).not.toHaveBeenCalled();
  });

  it("returns possible duplicates for an explicit choice without writing early", async () => {
    mocks.candidates = [{ id: "00000000-0000-4000-8000-000000000555", kind: "ice", title: "Icy surface", coordinates: [-89.407, 43.071], placeId: null, locationMethod: "pin", locationAccuracyM: null, lifecycle: "active", observationCount: 1, lastObservedAt: new Date().toISOString() }];
    const response = await POST(makeRequest({ text: "Icy here" }));
    const body = await response.json();

    expect(body).toMatchObject({ outcome: "possible_duplicates" });
    expect(body.issues).toHaveLength(1);
    expect(mocks.publishHazardBatch).not.toHaveBeenCalled();
  });
});
