import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { deriveReportedSeverity, hazardFreshnessMs, reportSubmissionSchema, screenReportText } from "@/lib/report/policy";
import { readBoundedJson, RequestBodyError } from "@/lib/report/body";
import { IntakeServiceError, interpretReport, moderateReportInput } from "@/lib/report/intake";
import { createCapabilityHash, createCapabilityToken, createRequestDigest, createRequestFingerprints, deterministicReportId, FingerprintConfigurationError } from "@/lib/report/visitor-fingerprint";
import { checkRequestRateLimits, jsonResponse, MAX_REPORT_REQUEST_BYTES, reportWritesEnabled, requestHasAllowedOrigin } from "@/lib/report/route-helpers";
import { findDuplicateCandidates, findNamedPlacesInText, getCampusPlaces, getPublishedHazardBatch, publishHazardBatch, ReportStoreError } from "@/lib/report/store";
import { resolveIssueLocation } from "@/lib/report/location-resolution";
import type { HazardKind, ReportLocationMethod, ReportSeverity } from "@/lib/report/types";

export const runtime = "nodejs";

type ResolvedIssue = {
  itemIndex: number;
  kind: HazardKind;
  coordinates: [number, number];
  placeId: string | null;
  locationMethod: ReportLocationMethod;
  locationAccuracyM: number | null;
  severity: ReportSeverity;
  observedAt: string;
  candidates: Awaited<ReturnType<typeof findDuplicateCandidates>>;
};
type ResolvedIssueInput = Omit<ResolvedIssue, "candidates">;

function haversineMeters(left: [number, number], right: [number, number]) {
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitude = toRadians(right[1] - left[1]);
  const longitude = toRadians(right[0] - left[0]);
  const a = Math.sin(latitude / 2) ** 2
    + Math.cos(toRadians(left[1])) * Math.cos(toRadians(right[1])) * Math.sin(longitude / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function explicitPastReference(text: string) {
  return /\b(?:yesterday|last night|last week|earlier this week|earlier today|this morning|this afternoon|this evening|\d+\s+(?:minutes?|hours?|days?)\s+ago|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i.test(text);
}

function titleFor(kind: HazardKind) {
  return ({
    ice: "Icy surface", snow: "Snow or ice buildup", flooding: "Standing water or flooding",
    blocked_path: "Blocked walkway", broken_light: "Broken exterior light",
    accessibility_barrier: "Physical access barrier", construction_obstruction: "Construction obstruction",
    fallen_branch: "Fallen branch", other_physical: "Physical condition reported",
  } satisfies Record<HazardKind, string>)[kind];
}

function responseForLocationIssue(reason: string | null, followup: string | null) {
  if (reason === "stale") return "Your location check is out of date. Tap Report here again or choose a map point.";
  if (reason === "too_imprecise") return "Your GPS estimate is too broad for a campus report. Choose a map point or search for the building.";
  if (reason === "outside_campus") return "Choose a point within the UW–Madison campus map.";
  return followup || "Where on campus is this? Choose a map point or search for the building.";
}

export async function POST(request: NextRequest) {
  if (!requestHasAllowedOrigin(request)) return jsonResponse({ error: "This report request did not come from this site." }, 403);
  if (!reportWritesEnabled()) return jsonResponse({ error: "Community reporting is temporarily in read-only mode." }, 503);

  let rawBody: unknown;
  try { rawBody = await readBoundedJson(request, MAX_REPORT_REQUEST_BYTES); }
  catch (error) {
    return jsonResponse({ error: error instanceof RequestBodyError && error.code === "too_large" ? "This report is too large to send." : "Use a valid report request." }, error instanceof RequestBodyError && error.code === "too_large" ? 413 : 400);
  }
  const parsed = reportSubmissionSchema.safeParse(rawBody);
  if (!parsed.success) return jsonResponse({ error: "Add a short description and try again." }, 400);
  const input = parsed.data;
  if (input.photo) {
    const imageBytes = Buffer.from(input.photo.slice(input.photo.indexOf(",") + 1), "base64").byteLength;
    if (imageBytes > 2 * 1024 * 1024) return jsonResponse({ error: "Choose an image under 2 MB." }, 413);
  }

  const deterministicScreen = screenReportText(input.text);
  if (!deterministicScreen.allowed) {
    const message = deterministicScreen.reason === "emergency"
      ? "This looks like an immediate emergency. Call 911 or use a verified official emergency channel. This message was not posted."
      : deterministicScreen.reason === "private_data"
        ? "Remove personal contact details or a private address before reporting a campus condition. This message was not posted."
        : "Reports about a person or suspected wrongdoing are not published here. Use a verified official reporting channel instead.";
    return jsonResponse({ outcome: "not_published", message }, 422);
  }

  let fingerprints: ReturnType<typeof createRequestFingerprints>;
  try {
    const limits = await checkRequestRateLimits(request, input.visitorId, {
      network: { action: "report_network", limit: 4, windowSeconds: 3600 },
      visitor: { action: "report_browser", limit: 6, windowSeconds: 86400 },
    });
    if (!limits.allowed) return jsonResponse({ error: "You’ve sent several reports recently. Keep this draft and try again later." }, 429, { "Retry-After": String(limits.retryAfterSeconds) });
    fingerprints = { networkHmac: limits.networkHmac, visitorHmac: limits.visitorHmac };
  } catch (error) {
    if (error instanceof FingerprintConfigurationError || error instanceof ReportStoreError) return jsonResponse({ error: "Reporting is not configured on this server yet." }, 503);
    return jsonResponse({ error: "The report could not be checked. Please try again shortly." }, 503);
  }

  try {
    const digest = createRequestDigest({
      mode: input.mode,
      submissionId: input.submissionId,
      text: input.text,
      photoDigest: input.photo ? createHash("sha256").update(input.photo).digest("hex") : null,
      location: input.location || null,
      duplicateDecisions: input.duplicateDecisions || [],
      browserHmac: fingerprints.visitorHmac,
    });
    const previousReceipt = await getPublishedHazardBatch({ batchId: input.submissionId, requestDigest: digest });
    if (previousReceipt) {
      const capabilities = previousReceipt.reports
        .filter((report) => report.undoAvailable)
        .map((report) => ({ reportId: report.id, token: createCapabilityToken(report.id) }));
      return jsonResponse({
        outcome: "posted",
        postedCount: previousReceipt.reports.filter((report) => report.undoAvailable).length,
        recheckedCount: previousReceipt.reports.filter((report) => report.recheckStatus === "counted").length,
        reports: previousReceipt.reports,
        capabilities,
        idempotent: true,
      }, 200);
    }

    const moderation = await moderateReportInput(input.text, input.photo);
    if (!moderation.allowed) return jsonResponse({ outcome: "not_published", message: "This message could not be shared as a campus condition report." }, 422);

    const places = await getCampusPlaces();
    const namedPlaces = await findNamedPlacesInText(input.text);
    const selectedPlaceId = input.location?.method === "place" ? input.location.placeId : null;
    const selectedPlace = selectedPlaceId ? places.find((place) => place.id === selectedPlaceId) : undefined;
    const modelPlaces = [...new Map([...namedPlaces, ...(selectedPlace ? [selectedPlace] : [])].map((place) => [place.id, place])).values()].slice(0, 20);
    const plan = await interpretReport({ mode: "report", text: input.text, photo: input.photo, places: modelPlaces });
    if (plan.intent !== "report") {
      if (plan.intent === "out_of_scope") return jsonResponse({ outcome: "not_published", message: "This app publishes only non-identifying physical campus conditions. Immediate emergencies should go to 911 or verified official channels." }, 422);
      return jsonResponse({ outcome: "not_published", message: "Describe an observable physical campus condition to publish a report." }, 422);
    }
    if (plan.missingCriticalField === "issue") {
      return jsonResponse({ outcome: "needs_followup", itemIndex: 0, question: "What physical condition did you see?" }, 200);
    }
    if (!plan.issues.length) return jsonResponse({ outcome: "not_published", message: "I couldn’t identify an eligible physical campus condition in that message." }, 422);
    if (plan.missingCriticalField === "time") {
      const unknownTimeIndex = plan.issues.findIndex((issue) => issue.observedAtBasis === "unknown");
      const itemIndex = unknownTimeIndex >= 0 ? unknownTimeIndex : Math.max(0, plan.issues.findIndex((issue) => issue.observedAtBasis !== "explicit_in_text"));
      return jsonResponse({ outcome: "needs_followup", itemIndex, question: "When did you see this condition?" }, 200);
    }

    const now = Date.now();
    const messageHasPastReference = explicitPastReference(input.text);
    const resolvedIssues: ResolvedIssueInput[] = [];
    for (const [itemIndex, issue] of plan.issues.entries()) {
      const issueHasPastReference = explicitPastReference(issue.evidence || "")
        || (plan.issues.length === 1 && messageHasPastReference);
      if ((issueHasPastReference || issue.observedAtBasis === "unknown") && (!issue.observedAt || issue.observedAtBasis !== "explicit_in_text")) {
        return jsonResponse({ outcome: "needs_followup", itemIndex, question: "When did you see this condition?" }, 200);
      }
      const location = resolveIssueLocation({
        issue,
        previous: resolvedIssues.map((previousIssue) => ({ coordinates: previousIssue.coordinates, placeId: previousIssue.placeId, locationMethod: previousIssue.locationMethod, accuracy: previousIssue.locationAccuracyM })),
        selectedLocation: input.location,
        places,
        namedPlaces,
        now,
      });
      if (!location.value) return jsonResponse({ outcome: "needs_followup", itemIndex, question: responseForLocationIssue(location.reason, plan.followup) }, 200);
      const observedAt = issue.observedAtBasis === "explicit_in_text" && issue.observedAt
        ? new Date(issue.observedAt)
        : new Date(now);
      if (Number.isNaN(observedAt.valueOf()) || observedAt.valueOf() > now + 5 * 60_000 || observedAt.valueOf() < now - 365 * 24 * 60 * 60_000) {
        return jsonResponse({ outcome: "needs_followup", itemIndex, question: "When did you see this condition?" }, 200);
      }
      if (now - observedAt.valueOf() > hazardFreshnessMs[issue.kind]) {
        return jsonResponse({ outcome: "not_published", message: "That observation is outside the current reporting window for this condition. If it is still present, start a new report based on what you see now." }, 422);
      }
      resolvedIssues.push({
        itemIndex,
        kind: issue.kind,
        coordinates: location.value.coordinates,
        placeId: location.value.placeId,
        locationMethod: location.value.locationMethod,
        locationAccuracyM: location.value.accuracy,
        severity: deriveReportedSeverity(issue.evidence, input.text),
        observedAt: observedAt.toISOString(),
      });
    }

    // Location resolution is ordered because relative issues inherit earlier items;
    // duplicate searches are independent reads and can run together afterward.
    const issues: ResolvedIssue[] = await Promise.all(resolvedIssues.map(async (issue) => ({
      ...issue,
      candidates: await findDuplicateCandidates({
        kind: issue.kind,
        longitude: issue.coordinates[0],
        latitude: issue.coordinates[1],
        placeId: issue.placeId,
      }),
    })));

    const decisions = new Map((input.duplicateDecisions || []).map((decision) => [decision.itemIndex, decision]));
    const unresolvedDuplicates: Array<{ itemIndex: number; title: string; candidates: ResolvedIssue["candidates"] }> = [];
    const actions = new Map<number, { action: "new" | "still_there"; reportId?: string }>();
    for (const issue of issues) {
      if (!issue.candidates.length) { actions.set(issue.itemIndex, { action: "new" }); continue; }
      const decision = decisions.get(issue.itemIndex);
      if (decision?.choice === "separate") { actions.set(issue.itemIndex, { action: "new" }); continue; }
      if (decision?.choice === "same" && decision.reportId && issue.candidates.some((candidate) => candidate.id === decision.reportId)) {
        actions.set(issue.itemIndex, { action: "still_there", reportId: decision.reportId });
        continue;
      }
      const exactPinRepeat = issue.locationMethod === "pin" && issue.placeId === null && issue.candidates.length === 1
        && issue.candidates[0].locationMethod === "pin" && issue.candidates[0].placeId === null
        && haversineMeters(issue.coordinates, issue.candidates[0].coordinates) <= 5;
      if (exactPinRepeat) { actions.set(issue.itemIndex, { action: "still_there", reportId: issue.candidates[0].id }); continue; }
      unresolvedDuplicates.push({ itemIndex: issue.itemIndex, title: titleFor(issue.kind), candidates: issue.candidates });
    }
    if (unresolvedDuplicates.length) return jsonResponse({ outcome: "possible_duplicates", issues: unresolvedDuplicates }, 200);

    const reportIds = new Map(issues.map((issue) => [issue.itemIndex, deterministicReportId(input.submissionId, issue.itemIndex)]));
    const newIssueTokens = issues
      .filter((issue) => actions.get(issue.itemIndex)?.action === "new")
      .map((issue) => ({ id: reportIds.get(issue.itemIndex)!, token: createCapabilityToken(reportIds.get(issue.itemIndex)!) }));
    const reportItems = issues.map((issue) => {
      const action = actions.get(issue.itemIndex)!;
      const reportId = action.action === "still_there" ? action.reportId! : reportIds.get(issue.itemIndex)!;
      return {
        item_index: issue.itemIndex,
        report_id: reportId,
        action: action.action,
        kind: issue.kind,
        longitude: issue.coordinates[0],
        latitude: issue.coordinates[1],
        place_id: issue.placeId,
        location_method: issue.locationMethod,
        location_accuracy_m: issue.locationAccuracyM,
        reported_severity: issue.severity,
        observed_at: issue.observedAt,
      };
    });
    const published = await publishHazardBatch({
      batchId: input.submissionId,
      requestDigest: digest,
      browserHmac: fingerprints.visitorHmac,
      items: reportItems,
      capabilityHashes: newIssueTokens.map(({ id, token }) => ({ item_index: issues.find((issue) => reportIds.get(issue.itemIndex) === id)!.itemIndex, secret_sha256: createCapabilityHash(token) })),
      originalText: input.text,
      originalPhoto: input.photo || null,
    });
    const capabilities = published.reports
      .filter((report) => report.undoAvailable)
      .map((report) => ({ reportId: report.id, token: createCapabilityToken(report.id) }));
    return jsonResponse({
      outcome: "posted",
      postedCount: issues.filter((issue) => actions.get(issue.itemIndex)?.action === "new").length,
      recheckedCount: published.reports.filter((report) => report.recheckStatus === "counted").length,
      reports: published.reports,
      capabilities,
      idempotent: published.idempotent,
    }, 200);
  } catch (error) {
    if (error instanceof IntakeServiceError) {
      const message = error.code === "not-configured" ? "The reporting AI is not configured for this deployment yet."
        : error.code === "invalid-response" ? "The report could not be safely interpreted. Please rephrase it and try again."
          : "The reporting service is temporarily unavailable. Your draft has not been posted.";
      return jsonResponse({ error: message }, error.code === "not-configured" ? 503 : 502);
    }
    if (error instanceof FingerprintConfigurationError) return jsonResponse({ error: "Reporting security keys are not configured on this server yet." }, 503);
    if (error instanceof ReportStoreError) {
      if (error.code === "idempotency_conflict") return jsonResponse({ error: "This draft changed while a previous submission was still being checked. Start a new submission and try again." }, 409);
      if (error.code === "duplicate_changed") return jsonResponse({ error: "A nearby report changed while this one was being sent. Refresh the map and review the possible match." }, 409);
    }
    console.error("Campus report transaction failed; the message was not stored or returned.");
    return jsonResponse({ error: "The report could not be saved. Your draft is still here; try again shortly." }, 503);
  }
}
