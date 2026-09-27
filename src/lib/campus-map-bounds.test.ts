import { describe, expect, it } from "vitest";
import { CAMPUS_MAP_BOUNDS, isWithinCampusMapBounds } from "./campus-map-bounds";

describe("campus map bounds", () => {
  it("includes a representative central-campus position", () => {
    expect(isWithinCampusMapBounds([-89.405, 43.075])).toBe(true);
  });

  it("includes positions exactly on the map boundary", () => {
    expect(isWithinCampusMapBounds(CAMPUS_MAP_BOUNDS[0])).toBe(true);
    expect(isWithinCampusMapBounds(CAMPUS_MAP_BOUNDS[1])).toBe(true);
  });

  it("rejects positions outside the map and malformed coordinates", () => {
    expect(isWithinCampusMapBounds([-89.46, 43.08])).toBe(false);
    expect(isWithinCampusMapBounds([-89.405, Number.NaN])).toBe(false);
  });
});
