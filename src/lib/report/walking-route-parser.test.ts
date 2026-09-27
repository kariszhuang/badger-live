import { describe, expect, it } from "vitest";
import { parseWalkingDirections, WalkingDirectionsError } from "./walking-route-parser";
import { routeBounds, routeLengthMeters } from "./route-inspection";

const validResponse = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    geometry: { type: "LineString", coordinates: [[-89.406, 43.075], [-89.404, 43.076]] },
    properties: { summary: { distance: 380.4, duration: 287.2 } },
  }],
};

describe("walking route data", () => {
  it("keeps bounded pedestrian geometry and its summary", () => {
    expect(parseWalkingDirections(validResponse)).toEqual({
      coordinates: [[-89.406, 43.075], [-89.404, 43.076]], distanceM: 380, durationS: 287,
    });
  });

  it("rejects route output that leaves the campus map bounds", () => {
    const invalid = structuredClone(validResponse);
    invalid.features[0].geometry.coordinates[1] = [-89.2, 43.076];
    expect(() => parseWalkingDirections(invalid)).toThrowError(WalkingDirectionsError);
  });

  it("rejects malformed lines and implausible service summaries", () => {
    expect(() => parseWalkingDirections({ features: [{ geometry: { type: "Point", coordinates: [-89.4, 43.07] } }] }))
      .toThrowError(WalkingDirectionsError);
    expect(() => parseWalkingDirections({
      ...validResponse,
      features: [{ ...validResponse.features[0], properties: { summary: { distance: 0, duration: 10 } } }],
    })).toThrowError(WalkingDirectionsError);
  });

  it("measures a candidate line and returns a padded campus-clipped query bound", () => {
    const route: Array<[number, number]> = [[-89.406, 43.075], [-89.404, 43.076]];
    expect(routeLengthMeters(route)).toBeGreaterThan(150);
    expect(routeLengthMeters(route)).toBeLessThan(250);
    expect(routeBounds(route)).toEqual([-89.408, 43.073, -89.402, 43.078]);
  });
});
