import { z } from "zod";

export const communityReportCategories = ["lighting", "blocked-access", "slippery-surface", "facility-hazard"] as const;
export type CommunityReportCategory = (typeof communityReportCategories)[number];

export const observedWindows = ["just-now", "past-hour", "today", "yesterday"] as const;
export type ObservedWindow = (typeof observedWindows)[number];

export const reportStatuses = ["pending", "published", "confirmed", "resolved", "rejected"] as const;
export type ReportStatus = (typeof reportStatuses)[number];
export type PublicReportStatus = "unverified-community-report" | "community-confirmed-environmental-hazard" | "outdated-resolved";
export type SafetyVerificationStatus = PublicReportStatus | "official-police-information";

export const communityReportCategoryInfo: Record<CommunityReportCategory, { label: string; issue: string; symbol: string }> = {
  lighting: { label: "Broken or unreliable light", issue: "a lighting problem", symbol: "☼" },
  "blocked-access": { label: "Blocked exit or path", issue: "an exit or path obstruction", symbol: "↗" },
  "slippery-surface": { label: "Ice or slippery surface", issue: "a slippery surface", symbol: "✳" },
  "facility-hazard": { label: "Other facility condition", issue: "a facility condition", symbol: "!" },
};

export const observedWindowLabels: Record<ObservedWindow, string> = {
  "just-now": "Just now",
  "past-hour": "Within the past hour",
  today: "Earlier today",
  yesterday: "Yesterday",
};

export const safetyReportSubmissionSchema = z.object({
  category: z.enum(communityReportCategories),
  buildingId: z.string().trim().regex(/^\d{1,8}$/),
  observedWindow: z.enum(observedWindows),
}).strict();

export const safetyModerationActionSchema = z.object({
  category: z.enum(communityReportCategories),
  buildingId: z.string().trim().regex(/^\d{1,8}$/),
  action: z.enum(["publish-unverified", "confirm-environmental", "resolve", "reject"]),
  confirmationReviewed: z.boolean().optional(),
}).strict();

export type CommunitySafetyReport = {
  id: string;
  category: CommunityReportCategory;
  buildingId: string;
  buildingName: string;
  coordinates: [longitude: number, latitude: number];
  status: PublicReportStatus;
  reportCount: number;
  reportedAt: string;
  observedWindow: ObservedWindow;
  expiresAt: string;
  source: "community";
  description: string;
};

export type SafetyModerationItem = {
  category: CommunityReportCategory;
  buildingId: string;
  buildingName: string;
  status: "pending" | "published" | "confirmed";
  reportCount: number;
  distinctReporters: number;
  firstReportedAt: string;
  lastReportedAt: string;
  lastObservedWindow: ObservedWindow;
};

export function publicReportStatus(status: ReportStatus, lastReportedAt: string, now = Date.now(), observedWindow?: ObservedWindow): PublicReportStatus {
  if (status === "resolved" || observedWindow === "yesterday" || now - new Date(lastReportedAt).valueOf() > 24 * 60 * 60 * 1000) return "outdated-resolved";
  return status === "confirmed" ? "community-confirmed-environmental-hazard" : "unverified-community-report";
}

export function publicReportDescription(category: CommunityReportCategory, buildingName: string, status: PublicReportStatus): string {
  const issue = communityReportCategoryInfo[category].issue;
  if (status === "community-confirmed-environmental-hazard") {
    return `Community confirmation of ${issue} near ${buildingName}. This confirms an environmental condition only—not a crime or wrongdoing.`;
  }
  if (status === "outdated-resolved") return `An earlier community report noted ${issue} near ${buildingName}. Its current status is unknown.`;
  return `A community member reported ${issue} near ${buildingName}. This is unverified and is not an official campus alert.`;
}
