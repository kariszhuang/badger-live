export const hazardKinds = [
  "ice",
  "snow",
  "flooding",
  "blocked_path",
  "broken_light",
  "accessibility_barrier",
  "construction_obstruction",
  "fallen_branch",
  "other_physical",
] as const;

export type HazardKind = (typeof hazardKinds)[number];
export type ReportSeverity = "unknown" | "low" | "medium" | "high";
export type HazardLifecycle = "active" | "stale" | "possibly_cleared";
export type ReportLocationMethod = "gps" | "pin" | "place";

export type ReportLocation =
  | { method: "gps"; longitude: number; latitude: number; accuracyM: number; capturedAt: number }
  | { method: "pin"; longitude: number; latitude: number }
  | { method: "place"; placeId: string };

export type CampusPlace = {
  id: string;
  sourcePlaceId: string;
  name: string;
  aliases: string[];
  kind: "building" | "entrance" | "campus_area";
  coordinates: [longitude: number, latitude: number];
  officialSourceUrl: string;
};

export type HazardReport = {
  id: string;
  kind: HazardKind;
  title: string;
  coordinates: [longitude: number, latitude: number];
  placeId: string | null;
  locationMethod: ReportLocationMethod;
  locationAccuracyM: number | null;
  reportedSeverity: ReportSeverity;
  observationLabel: "unverified";
  lifecycle: HazardLifecycle;
  observationCount: number;
  observedAt: string;
  lastObservedAt: string;
  expiresAt: string;
  version: number;
};

export type IntakeIssue = {
  kind: HazardKind;
  evidence: string | null;
  placeName: string | null;
  observedAt: string | null;
  observedAtBasis: "submission" | "explicit_in_text" | "unknown";
  locationIntent: "here" | "named_place" | "relative" | "missing";
  relativeToIssueIndex: number | null;
};

export type IntakePlan = {
  intent: "report" | "out_of_scope" | "question";
  issues: IntakeIssue[];
  missingCriticalField: "none" | "location" | "time" | "issue";
  followup: string | null;
  acknowledgment: string;
};

export type DuplicateCandidate = Pick<HazardReport, "id" | "kind" | "title" | "coordinates" | "placeId" | "locationMethod" | "locationAccuracyM" | "lifecycle" | "observationCount" | "lastObservedAt">;
