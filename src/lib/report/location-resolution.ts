import { validateReportLocation, type ReportSubmission } from "./policy";
import type { CampusPlace, IntakeIssue, ReportLocationMethod } from "./types";

export type ResolvedReportLocation = {
  coordinates: [number, number];
  placeId: string | null;
  locationMethod: ReportLocationMethod;
  accuracy: number | null;
};

export type LocationResolutionReason = "missing" | "stale" | "too_imprecise" | "outside_campus";
export type LocationResolution = { reason: LocationResolutionReason | null; value: ResolvedReportLocation | null };

type PreviousLocation = Pick<ResolvedReportLocation, "coordinates" | "placeId" | "locationMethod" | "accuracy">;

function asPlaceLocation(place: CampusPlace): ResolvedReportLocation {
  return { coordinates: place.coordinates, placeId: place.id, locationMethod: "place", accuracy: null };
}

export function resolveIssueLocation(input: {
  issue: IntakeIssue;
  previous: PreviousLocation[];
  selectedLocation: ReportSubmission["location"];
  places: CampusPlace[];
  namedPlaces: CampusPlace[];
  now: number;
}): LocationResolution {
  const { issue, previous, selectedLocation, places, namedPlaces, now } = input;

  // A pin chosen for this report is the strongest location signal and applies
  // to every extracted issue unless the user submits them separately.
  if (selectedLocation?.method === "pin") {
    const reason = validateReportLocation(selectedLocation, now);
    return reason ? { reason, value: null } : {
      reason: null,
      value: { coordinates: [selectedLocation.longitude, selectedLocation.latitude], placeId: null, locationMethod: "pin", accuracy: null },
    };
  }

  const explicitPlace = issue.placeName
    ? namedPlaces.find((place) => place.name.trim().toLocaleLowerCase() === issue.placeName?.trim().toLocaleLowerCase()
      || place.aliases.some((alias) => alias.trim().toLocaleLowerCase() === issue.placeName?.trim().toLocaleLowerCase()))
    : namedPlaces.length === 1 ? namedPlaces[0] : null;
  if (explicitPlace) return { reason: null, value: asPlaceLocation(explicitPlace) };

  if (issue.locationIntent === "relative") {
    const target = issue.relativeToIssueIndex === null ? undefined : previous[issue.relativeToIssueIndex];
    return target
      ? { reason: null, value: { ...target } }
      : { reason: "missing", value: null };
  }
  if (issue.locationIntent === "named_place") return { reason: "missing", value: null };

  if (selectedLocation?.method === "place") {
    const selectedPlace = places.find((place) => place.id === selectedLocation.placeId);
    return selectedPlace
      ? { reason: null, value: asPlaceLocation(selectedPlace) }
      : { reason: "missing", value: null };
  }

  // Never turn a generic or unresolved location into the reporter's current
  // position. GPS is appropriate only when the text describes this place.
  if (issue.locationIntent !== "here" || selectedLocation?.method !== "gps") return { reason: "missing", value: null };
  const reason = validateReportLocation(selectedLocation, now);
  return reason ? { reason, value: null } : {
    reason: null,
    value: {
      coordinates: [selectedLocation.longitude, selectedLocation.latitude],
      placeId: null,
      locationMethod: "gps",
      accuracy: Math.round(selectedLocation.accuracyM),
    },
  };
}
