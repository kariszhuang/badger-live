import { describe, expect, it } from "vitest";
import { CAMPUS_BUILDING_FILL_PAINT, campusBuildingLayerInsertionPoints } from "./campus-building-map-style";

describe("campus building map fill", () => {
  it("renders every mapped building as a consistent, fully opaque Wisconsin red", () => {
    expect(CAMPUS_BUILDING_FILL_PAINT).toEqual({
      "fill-color": "#c5050c",
      "fill-opacity": 1,
    });
  });

  it("paints campus footprints above basemap buildings but below labels", () => {
    const layers = [
      { id: "road_one_way_arrow", type: "symbol" },
      { id: "building", type: "fill" },
      { id: "building-3d", type: "fill-extrusion" },
      { id: "waterway_line_label", type: "symbol" },
    ];

    expect(campusBuildingLayerInsertionPoints(layers)).toEqual({
      footprintsBeforeId: "waterway_line_label",
      labelsBeforeId: "waterway_line_label",
    });
  });

  it("falls back to the first symbol layer when the basemap has no building fill", () => {
    expect(campusBuildingLayerInsertionPoints([
      { id: "background", type: "background" },
      { id: "first-label", type: "symbol" },
    ])).toEqual({ footprintsBeforeId: "first-label", labelsBeforeId: "first-label" });
  });
});
