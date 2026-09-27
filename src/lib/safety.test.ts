import { describe, expect, it } from "vitest";
import {
  publicReportDescription,
  publicReportStatus,
  safetyModerationActionSchema,
  safetyReportSubmissionSchema,
} from "./safety";

describe("community safety report policy", () => {
  it("accepts only a structured environmental report tied to a campus building", () => {
    expect(safetyReportSubmissionSchema.safeParse({ category: "lighting", buildingId: "0055", observedWindow: "just-now" }).success).toBe(true);
    expect(safetyReportSubmissionSchema.safeParse({ category: "person", buildingId: "0055", observedWindow: "just-now" }).success).toBe(false);
    expect(safetyReportSubmissionSchema.safeParse({ category: "lighting", buildingId: "off campus", observedWindow: "just-now" }).success).toBe(false);
    expect(safetyReportSubmissionSchema.safeParse({ category: "lighting", buildingId: "0055", observedWindow: "just-now", description: "A named person did this" }).success).toBe(false);
  });

  it("allows confirmation only for the environmental category set", () => {
    expect(safetyModerationActionSchema.safeParse({ category: "blocked-access", buildingId: "0055", action: "confirm-environmental", confirmationReviewed: true }).success).toBe(true);
    expect(safetyModerationActionSchema.safeParse({ category: "crime", buildingId: "0055", action: "confirm-environmental", confirmationReviewed: true }).success).toBe(false);
    expect(safetyModerationActionSchema.safeParse({ category: "lighting", buildingId: "0055", action: "confirm-environmental", confirmationReviewed: true, publicSummary: "free text" }).success).toBe(false);
  });

  it("never treats yesterday's observation, an old report, or a resolved report as current", () => {
    const now = Date.parse("2026-09-26T17:00:00Z");
    expect(publicReportStatus("published", "2026-09-26T16:59:00Z", now, "yesterday")).toBe("outdated-resolved");
    expect(publicReportStatus("published", "2026-09-25T16:00:00Z", now, "today")).toBe("outdated-resolved");
    expect(publicReportStatus("resolved", "2026-09-26T16:59:00Z", now, "just-now")).toBe("outdated-resolved");
    expect(publicReportStatus("published", "2026-09-26T16:59:00Z", now, "just-now")).toBe("unverified-community-report");
  });

  it("makes explicit that community confirmation applies only to an environmental condition", () => {
    const description = publicReportDescription("slippery-surface", "Chamberlin Hall", "community-confirmed-environmental-hazard");
    expect(description).toContain("environmental condition only");
    expect(description).toContain("not a crime");
  });
});
