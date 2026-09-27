import { z } from "zod";
import { hazardKinds, type HazardKind, type ReportSeverity } from "./types";
import { isWithinCampusMapBounds } from "@/lib/campus-map-bounds";

export const reportLocationSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("gps"), longitude: z.number().finite(), latitude: z.number().finite(), accuracyM: z.number().finite().min(0).max(5000), capturedAt: z.number().finite() }).strict(),
  z.object({ method: z.literal("pin"), longitude: z.number().finite(), latitude: z.number().finite() }).strict(),
  z.object({ method: z.literal("place"), placeId: z.string().uuid() }).strict(),
]);

export const reportSubmissionSchema = z.object({
  mode: z.literal("report"),
  submissionId: z.string().uuid(),
  visitorId: z.string().uuid(),
  text: z.string().trim().min(1).max(2000),
  photo: z.string().max(3_000_000).regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/).optional(),
  location: reportLocationSchema.optional(),
  selectedPlaceSourceId: z.string().max(80).optional(),
  duplicateDecisions: z.array(z.object({ itemIndex: z.number().int().min(0).max(7), choice: z.enum(["separate", "same" ]), reportId: z.string().uuid().optional() }).strict()).max(8).optional(),
}).strict();

export type ReportSubmission = z.infer<typeof reportSubmissionSchema>;

export const allowedHazardKinds = new Set<string>(hazardKinds);

const titles: Record<HazardKind, string> = {
  ice: "Icy surface",
  snow: "Snow or ice buildup",
  flooding: "Standing water or flooding",
  blocked_path: "Blocked walkway",
  broken_light: "Broken exterior light",
  accessibility_barrier: "Physical access barrier",
  construction_obstruction: "Construction obstruction",
  fallen_branch: "Fallen branch",
  other_physical: "Physical condition reported",
};

export function publicHazardTitle(kind: HazardKind) {
  return titles[kind];
}

export const hazardFreshnessMs: Record<HazardKind, number> = {
  ice: 6 * 60 * 60_000,
  snow: 12 * 60 * 60_000,
  flooding: 8 * 60 * 60_000,
  blocked_path: 24 * 60 * 60_000,
  broken_light: 30 * 24 * 60 * 60_000,
  accessibility_barrier: 24 * 60 * 60_000,
  construction_obstruction: 48 * 60 * 60_000,
  fallen_branch: 48 * 60 * 60_000,
  other_physical: 7 * 24 * 60 * 60_000,
};

export function validateReportLocation(location: ReportSubmission["location"], now = Date.now()): "missing" | "stale" | "too_imprecise" | "outside_campus" | null {
  if (!location) return "missing";
  if (location.method === "place") return null;
  if (!isWithinCampusMapBounds([location.longitude, location.latitude])) return "outside_campus";
  if (location.method === "gps") {
    if (Math.abs(now - location.capturedAt) > 45_000) return "stale";
    if (location.accuracyM > 80) return "too_imprecise";
  }
  return null;
}

const privateDataPatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:\+?1[ .-]?)?(?:\(?\d{3}\)?[ .-]?)\d{3}[ .-]?\d{4}\b/,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b\d{1,5}\s+[A-Z0-9.'-]+(?:\s+[A-Z0-9.'-]+){0,3}\s+(?:street|st|road|rd|avenue|ave|drive|dr|apartment|apt)\b/i,
  /\b(?:room|suite|unit|apartment|apt|dorm)\s*#?\s*[A-Z]?\d{1,6}\b/i,
];

const allegationTerms = /\b(?:assault(?:ed)?|attack(?:ed)?|stalk(?:ed|ing)?|harass(?:ed|ment)?|rob(?:bed|bery)?|steal|stole|stolen|theft|accus(?:e|ed|ation)|threat(?:en(?:ed)?)?|weapon|kill(?:ed|ing)?|drug(?:s|ged)?|crime|criminal|abuse|sexual|suspicious person)\b/i;
const emergencyTerms = /\b(?:call|calling|need|send)\s+(?:the\s+)?(?:police|ambulance|fire department)|\b(?:911|emergency|actively attacking|someone is hurt|medical emergency|bomb threat|active shooter)\b/i;

export function screenReportText(text: string): { allowed: boolean; reason: "private_data" | "person_or_allegation" | "emergency" | null } {
  if (privateDataPatterns.some((pattern) => pattern.test(text))) return { allowed: false, reason: "private_data" };
  if (emergencyTerms.test(text)) return { allowed: false, reason: "emergency" };
  if (allegationTerms.test(text)) return { allowed: false, reason: "person_or_allegation" };
  return { allowed: true, reason: null };
}

const explicitHigh = /\b(?:completely blocked|fully blocked|impassable|cannot pass|can't pass|no way through|collapsed|dangerous|serious hazard|severe(?:ly)?|completely covered)\b/i;
const explicitMedium = /\b(?:very icy|deep snow|large puddle|substantial|difficult to pass|hard to pass|major)\b/i;
const explicitLow = /\b(?:slightly|small patch|minor|a little|partially blocked)\b/i;

export function deriveReportedSeverity(evidence: string | null, userText: string): ReportSeverity {
  if (!evidence || !userText.toLocaleLowerCase().includes(evidence.toLocaleLowerCase())) return "unknown";
  if (explicitHigh.test(evidence)) return "high";
  if (explicitMedium.test(evidence)) return "medium";
  if (explicitLow.test(evidence)) return "low";
  return "unknown";
}

const kindByPhrase: Array<[RegExp, HazardKind]> = [
  [/\bice\b|\bicy\b|\bslippery\b/i, "ice"],
  [/\bsnow\b/i, "snow"],
  [/\bflood(?:ing|ed)?\b|\bstanding water\b|\bwater (?:is )?covering\b/i, "flooding"],
  [/\b(?:broken|out|flickering) (?:street)?light\b|\b(?:street)?light\b.{0,24}\b(?:is )?(?:broken|out|flickering)\b/i, "broken_light"],
  [/\b(?:tree )?branch (?:is )?(?:down|fallen|blocking)\b|\bfallen branch\b/i, "fallen_branch"],
  [/\b(?:construction|work zone) (?:is )?(?:blocking|obstructing)\b|\bconstruction obstruction\b/i, "construction_obstruction"],
  [/\b(?:ramp|accessible entrance|wheelchair access)\b.{0,50}\b(?:blocked|obstructed|closed|impassable)\b|\b(?:blocked|obstructed|closed|impassable)\b.{0,50}\b(?:ramp|accessible entrance|wheelchair access)\b/i, "accessibility_barrier"],
  [/\b(?:sidewalk|walkway|path|crosswalk|sidewalk ramp)\b.{0,50}\b(?:blocked|obstructed|closed|impassable)\b|\b(?:blocked|obstructed|closed|impassable)\b.{0,50}\b(?:sidewalk|walkway|path|crosswalk)\b/i, "blocked_path"],
];

export function fallbackPhysicalIssueKinds(text: string): HazardKind[] {
  return [...new Set(kindByPhrase.filter(([pattern]) => pattern.test(text)).map(([, kind]) => kind))].slice(0, 8);
}

export function isKnownHazardKind(value: string): value is HazardKind {
  return allowedHazardKinds.has(value);
}
