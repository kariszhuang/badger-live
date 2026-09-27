import { afterEach, describe, expect, it, vi } from "vitest";
import { IntakeServiceError, interpretReport, moderateReportInput } from "./intake-model";
import type { CampusPlace } from "./types";

const place: CampusPlace = {
  id: "00000000-0000-4000-8000-000000000010",
  sourcePlaceId: "van-vleck",
  name: "Van Vleck Hall",
  aliases: ["Van Vleck"],
  kind: "building",
  coordinates: [-89.4055, 43.0756],
  officialSourceUrl: "https://map.wisc.edu/",
};

const validOutput = {
  intent: "report",
  issues: [{
    kind: "ice",
    evidence: "I saw ice yesterday.",
    place_name: "Van Vleck",
    observed_at: "2026-09-26T12:00:00-05:00",
    observed_at_basis: "explicit_in_text",
    location_intent: "named_place",
    relative_to_issue_index: null,
  }],
  missing_critical_field: "none",
  followup: null,
  acknowledgment: "Thanks for reporting this.",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("interpretReport", () => {
  it("sends bounded trusted place and selected-location context to the configured model", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_REPORT_MODEL", "gpt-6-luna");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "completed",
      output: [{ content: [{ type: "output_text", text: JSON.stringify(validOutput) }] }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const plan = await interpretReport({
      mode: "report",
      text: "I saw ice at Van Vleck yesterday.",
      places: [place],
      context: {
        selectedLocation: { method: "gps", available: true, accuracyM: 12, ageSeconds: 3 },
        nearbyHazards: [{ kind: "ice", title: "Icy surface", lifecycle: "active", lastObservedAt: "2026-09-26T17:00:00.000Z", approximateDistanceM: 25 }],
      },
    });

    const request = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as {
      model: string;
      store: boolean;
      input: Array<{ content: Array<{ text?: string }> }>;
    };
    const userInput = JSON.parse(request.input[1]!.content[0]!.text!) as Record<string, unknown>;
    expect(request.model).toBe("gpt-6-luna");
    expect(request.store).toBe(false);
    expect(userInput.trusted_campus_places).toEqual([{
      id: "van-vleck", name: "Van Vleck Hall", aliases: ["Van Vleck"], coordinates: [-89.4055, 43.0756],
    }]);
    expect(userInput.selected_location).toEqual({ method: "gps", available: true, accuracyM: 12, ageSeconds: 3 });
    expect(userInput.nearby_unverified_hazards).toHaveLength(1);
    expect(plan.issues[0]?.observedAt).toBe("2026-09-26T12:00:00-05:00");
  });

  it("reports only safe response-shape diagnostics, without echoing model output", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_REPORT_MODEL", "gpt-6-luna");
    const invalidOutput = { ...validOutput, issues: [{ ...validOutput.issues[0], observed_at: "yesterday" }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "completed",
      output: [{ content: [{ type: "output_text", text: JSON.stringify(invalidOutput) }] }],
    }), { status: 200 })));

    await expect(interpretReport({ mode: "report", text: "I saw ice yesterday.", places: [place] }))
      .rejects.toMatchObject({ code: "invalid-response", diagnostic: "schema-issues.0.observed_at" });
  });

  it("does not call the API when credentials or model configuration are missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_REPORT_MODEL", "gpt-6-luna");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(interpretReport({ mode: "ask", text: "Any events?", places: [] }))
      .rejects.toBeInstanceOf(IntakeServiceError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("defaults to the requested GPT-6 Luna model when no override is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_REPORT_MODEL", "");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "completed",
      output: [{ content: [{ type: "output_text", text: JSON.stringify({ ...validOutput, issues: [], missing_critical_field: "issue", followup: "What physical condition did you see?" }) }] }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await interpretReport({ mode: "report", text: "Something is wrong.", places: [] });
    const request = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as { model: string };
    expect(request.model).toBe("gpt-6-luna");
  });

  it("treats moderation outages and malformed results as blocking errors", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ flagged: false }] }), { status: 200 })));
    await expect(moderateReportInput("A light is broken.")).resolves.toEqual({ allowed: true });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 })));
    await expect(moderateReportInput("A light is broken.")).rejects.toMatchObject({ code: "invalid-response" });
  });
});
