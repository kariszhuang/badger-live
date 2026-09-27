import { describe, expect, it } from "vitest";
import { resolveIssueLocation } from "./location-resolution";
import type { CampusPlace, IntakeIssue } from "./types";

const vanVleck: CampusPlace = {
  id: "00000000-0000-4000-8000-000000000001", sourcePlaceId: "van-vleck", name: "Van Vleck Hall",
  aliases: ["Van Vleck"], kind: "building", coordinates: [-89.4055, 43.0756], officialSourceUrl: "https://map.wisc.edu/",
};
const unionSouth: CampusPlace = {
  id: "00000000-0000-4000-8000-000000000002", sourcePlaceId: "union-south", name: "Union South",
  aliases: [], kind: "building", coordinates: [-89.407, 43.071], officialSourceUrl: "https://map.wisc.edu/",
};
const gps = { method: "gps" as const, longitude: -89.407, latitude: 43.071, accuracyM: 18, capturedAt: 1_800_000_000_000 };
const now = gps.capturedAt + 1000;

function issue(overrides: Partial<IntakeIssue> = {}): IntakeIssue {
  return {
    kind: "ice", evidence: "ice", placeName: null, observedAt: null, observedAtBasis: "submission",
    locationIntent: "here", relativeToIssueIndex: null, ...overrides,
  };
}

describe("issue location resolution", () => {
  it("uses an explicitly chosen map pin before a named place or GPS", () => {
    const result = resolveIssueLocation({
      issue: issue({ placeName: "Van Vleck", locationIntent: "named_place" }), previous: [],
      selectedLocation: { method: "pin", longitude: -89.401, latitude: 43.073 },
      places: [vanVleck], namedPlaces: [vanVleck], now,
    });
    expect(result).toEqual({ reason: null, value: {
      coordinates: [-89.401, 43.073], placeId: null, locationMethod: "pin", accuracy: null,
    } });
  });

  it("uses a named campus place instead of unrelated GPS or a selected place", () => {
    const result = resolveIssueLocation({
      issue: issue({ placeName: "Van Vleck", locationIntent: "named_place" }), previous: [],
      selectedLocation: { method: "place", placeId: unionSouth.id },
      places: [vanVleck, unionSouth], namedPlaces: [vanVleck], now,
    });
    expect(result.value).toMatchObject({ coordinates: vanVleck.coordinates, placeId: vanVleck.id, locationMethod: "place" });
  });

  it("asks for a location instead of falling back to GPS when the issue has no location intent", () => {
    const result = resolveIssueLocation({
      issue: issue({ locationIntent: "missing" }), previous: [], selectedLocation: gps,
      places: [], namedPlaces: [], now,
    });
    expect(result).toEqual({ reason: "missing", value: null });
  });

  it("uses fresh GPS only for an issue explicitly referring to here", () => {
    const result = resolveIssueLocation({
      issue: issue({ locationIntent: "here" }), previous: [], selectedLocation: gps,
      places: [], namedPlaces: [], now,
    });
    expect(result.value).toMatchObject({ coordinates: [gps.longitude, gps.latitude], locationMethod: "gps", accuracy: 18 });
  });

  it("inherits an earlier issue's resolved place for an explicit relative location", () => {
    const result = resolveIssueLocation({
      issue: issue({ kind: "broken_light", locationIntent: "relative", relativeToIssueIndex: 0 }),
      previous: [{ coordinates: vanVleck.coordinates, placeId: vanVleck.id, locationMethod: "place", accuracy: null }],
      selectedLocation: gps, places: [vanVleck], namedPlaces: [], now,
    });
    expect(result.value).toMatchObject({ coordinates: vanVleck.coordinates, placeId: vanVleck.id, locationMethod: "place" });
  });

  it("does not use GPS when a relative issue points to a missing prior item", () => {
    const result = resolveIssueLocation({
      issue: issue({ locationIntent: "relative", relativeToIssueIndex: 7 }), previous: [], selectedLocation: gps,
      places: [], namedPlaces: [], now,
    });
    expect(result).toEqual({ reason: "missing", value: null });
  });
});
