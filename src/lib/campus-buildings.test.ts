import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { campusBuildingPropertiesSchema, parseCampusBuildings } from "./campus-buildings";

describe("UW campus building data", () => {
  const collection = parseCampusBuildings(JSON.parse(readFileSync(resolve(process.cwd(), "public/data/uw-campus-buildings.geojson"), "utf8")) as unknown);

  it("keeps real UW footprint, partial-footprint, and point-complex distinctions", () => {
    expect(collection.features).toHaveLength(219);
    expect(collection.features.filter(({ properties }) => properties.footprintStatus === "full")).toHaveLength(212);
    expect(collection.features.filter(({ properties }) => properties.footprintStatus === "partial")).toHaveLength(3);
    expect(collection.features.filter(({ properties }) => properties.footprintStatus === "complex")).toHaveLength(4);
    expect(collection.features.filter(({ geometry }) => geometry.type === "Point")).toHaveLength(4);
  });

  it("preserves official campus coordinates and uses UW building-number detail links", () => {
    const bascom = collection.features.find(({ properties }) => properties.name === "Bascom Hall");
    expect(bascom?.properties.buildingNumber).toBe("0050");
    expect(bascom?.properties.streetAddress).toBe("500 Lincoln Dr.");
    expect(bascom?.properties.officialMapUrl).toBe("https://map.wisc.edu/?initObj=0050");
    expect(bascom?.properties.center[0]).toBeCloseTo(-89.4043, 3);
    expect(bascom?.properties.center[1]).toBeCloseTo(43.0753, 3);

    const campRandall = collection.features.find(({ properties }) => properties.name === "Camp Randall Stadium");
    expect(campRandall?.properties.officialMapUrl).toBe("https://map.wisc.edu/?initObj=0022");

    const eagleHeights = collection.features.find(({ properties }) => properties.name === "Eagle Heights");
    expect(eagleHeights?.properties.officialMapUrl).toBe("https://map.wisc.edu/");
  });

  it("rejects malformed geometry rather than drawing invented outlines", () => {
    expect(() => parseCampusBuildings({ type: "FeatureCollection", source: "https://map.wisc.edu/", capturedAt: new Date().toISOString(), features: [{ type: "Feature", id: "x", geometry: { type: "Polygon", coordinates: [] }, properties: {} }] })).toThrow();
  });

  it("accepts MapLibre feature properties that omit null optional building details", () => {
    const bascom = collection.features.find(({ properties }) => properties.name === "Bascom Hall");
    expect(bascom).toBeDefined();
    const properties = { ...bascom!.properties };
    delete properties.description;
    delete properties.hours;
    expect(campusBuildingPropertiesSchema.safeParse(properties).success).toBe(true);
  });
});
