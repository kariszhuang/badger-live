import { describe, expect, it } from "vitest";
import { deriveReportedSeverity, fallbackPhysicalIssueKinds, hazardFreshnessMs, screenReportText, validateReportLocation } from "./policy";

describe("report publication policy", () => {
  it("recognizes multiple visible physical conditions without promoting out-of-scope claims", () => {
    expect(fallbackPhysicalIssueKinds("Very icy here, wheelchair ramp completely blocked and the streetlight next to it is broken"))
      .toEqual(["ice", "broken_light", "accessibility_barrier"]);
  });

  it("keeps severity tied to an exact excerpt from the user's text", () => {
    const text = "The ramp is completely blocked, and the path has a small patch of ice.";
    expect(deriveReportedSeverity("The ramp is completely blocked", text)).toBe("high");
    expect(deriveReportedSeverity("completely blocked", "A little snow" )).toBe("unknown");
    expect(deriveReportedSeverity("small patch of ice", text)).toBe("low");
  });

  it("blocks contact details and person-directed allegations while allowing ordinary observations", () => {
    expect(screenReportText("I see ice near the east entrance.").allowed).toBe(true);
    expect(screenReportText("My roommate stole my phone at the Union.").reason).toBe("person_or_allegation");
    expect(screenReportText("Call 911; someone is actively attacking a student.").reason).toBe("emergency");
    expect(screenReportText("Email me at student@example.edu about the broken light.").reason).toBe("private_data");
    expect(screenReportText("Alice assaulted a student near the walkway.").reason).toBe("person_or_allegation");
    expect(screenReportText("My bike was stolen near the library.").reason).toBe("person_or_allegation");
    expect(screenReportText("Room 712 in Sellery has an icy doorway.").reason).toBe("private_data");
  });

  it("asks for a map point when GPS is stale, outside campus, or too imprecise", () => {
    const now = 1_800_000_000_000;
    expect(validateReportLocation({ method: "gps", longitude: -89.4, latitude: 43.075, accuracyM: 20, capturedAt: now }, now)).toBeNull();
    expect(validateReportLocation({ method: "gps", longitude: -89.4, latitude: 43.075, accuracyM: 20, capturedAt: now - 50_000 }, now)).toBe("stale");
    expect(validateReportLocation({ method: "gps", longitude: -89.4, latitude: 43.075, accuracyM: 200, capturedAt: now }, now)).toBe("too_imprecise");
    expect(validateReportLocation({ method: "pin", longitude: -87.0, latitude: 40.0 }, now)).toBe("outside_campus");
  });

  it("uses shorter active windows for ice and flooding than for broken lights", () => {
    expect(hazardFreshnessMs.ice).toBe(6 * 60 * 60_000);
    expect(hazardFreshnessMs.flooding).toBe(8 * 60 * 60_000);
    expect(hazardFreshnessMs.broken_light).toBe(30 * 24 * 60 * 60_000);
  });
});
