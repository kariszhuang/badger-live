import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  events: [] as Array<Record<string, unknown>>,
  hazards: [] as Array<Record<string, unknown>>,
  places: [] as Array<Record<string, unknown>>,
  fetch: vi.fn(),
}));

vi.mock("@/lib/uw-events-api", () => ({
  getEventsForDate: async () => ({ events: mocks.events, fetchedAt: "2026-09-27T18:00:00.000Z" }),
}));
vi.mock("@/lib/uwpd-blotter", () => ({ getUwpdBlotter: vi.fn() }));
vi.mock("@/lib/report/route-helpers", () => ({
  checkRequestRateLimits: async () => ({ allowed: true, retryAfterSeconds: 0 }),
  jsonResponse: async (body: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers }),
  requestHasAllowedOrigin: () => true,
}));
vi.mock("@/lib/report/store", () => ({
  getAssistantHazardRows: async () => mocks.hazards,
  getCampusPlaces: async () => mocks.places,
  ReportStoreError: class ReportStoreError extends Error {},
}));
vi.mock("@/lib/report/visitor-fingerprint", () => ({ FingerprintConfigurationError: class FingerprintConfigurationError extends Error {} }));

import { POST } from "./route";

function makeRequest(query = "What is happening on campus?") {
  return new NextRequest("https://badgerlive.test/api/assistant", {
    method: "POST",
    headers: { origin: "https://badgerlive.test", "content-type": "application/json" },
    body: JSON.stringify({ visitorId: "00000000-0000-4000-8000-000000000001", query, date: "2026-09-27" }),
  });
}

function output(text: string) {
  return new Response(JSON.stringify({ status: "completed", output: [{ content: [{ type: "output_text", text }] }] }), { status: 200 });
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("OPENAI_ASSISTANT_MODEL", "gpt-6-luna");
  vi.stubEnv("OPENAI_REPORT_MODEL", "");
  mocks.events = [{
    title: "Open House",
    subtitle: null,
    startsAt: "2026-09-27T20:00:00.000Z",
    endsAt: null,
    venueName: "Van Vleck Hall",
    locationLabel: "Van Vleck Hall",
    sourceUrl: "https://today.wisc.edu/events/1",
    description: "Student event.",
  }];
  mocks.hazards = [];
  mocks.places = [];
  mocks.fetch = vi.fn();
  vi.stubGlobal("fetch", mocks.fetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/assistant", () => {
  it("returns only source IDs that exist in loaded campus context", async () => {
    mocks.fetch.mockResolvedValue(output(JSON.stringify({
      answer: "Open House is listed for Van Vleck Hall.",
      source_ids: ["E0", "E99"],
      report_action_available: false,
    })));

    const response = await POST(makeRequest());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.sources).toEqual([{ id: "E0", kind: "event", title: "Open House", url: "https://today.wisc.edu/events/1", date: "2026-09-27T20:00:00.000Z" }]);
    expect(JSON.parse(mocks.fetch.mock.calls[0]![1]!.body as string).store).toBe(false);
  });

  it("does not return malformed model content to the user", async () => {
    mocks.fetch.mockResolvedValue(output(JSON.stringify({
      answer: "PRIVATE_MODEL_OUTPUT_TOKEN",
      source_ids: ["X999"],
      report_action_available: false,
      private_extra_field: true,
    })));

    const response = await POST(makeRequest());
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.error).toMatch(/invalid answer/i);
    expect(JSON.stringify(body)).not.toContain("PRIVATE_MODEL_OUTPUT_TOKEN");
  });
});
