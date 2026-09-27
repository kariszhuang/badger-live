import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { campusBuildingPropertiesSchema, describeCampusMapPoint, findCampusBuildingAt, parseCampusBuildings } from "./campus-buildings";
import { campusBuildingDescriptions } from "./campus-building-descriptions";

describe("UW campus building data", () => {
  const collection = parseCampusBuildings(JSON.parse(readFileSync(resolve(process.cwd(), "public/data/uw-campus-buildings.geojson"), "utf8")) as unknown);

  it("keeps real UW footprint, partial-footprint, and point-complex distinctions", () => {
    expect(collection.features).toHaveLength(219);
    expect(collection.features.filter(({ properties }) => properties.footprintStatus === "full")).toHaveLength(212);
    expect(collection.features.filter(({ properties }) => properties.footprintStatus === "partial")).toHaveLength(3);
    expect(collection.features.filter(({ properties }) => properties.footprintStatus === "complex")).toHaveLength(4);
    expect(collection.features.filter(({ geometry }) => geometry.type === "Point")).toHaveLength(4);
  });

  it("has a concise summary for every mapped campus building and complex", () => {
    const featureIds = collection.features.map(({ properties }) => properties.mapObjectId).sort();
    expect(Object.keys(campusBuildingDescriptions).sort()).toEqual(featureIds);
    for (const { properties } of collection.features) {
      expect(properties.shortDescription.length).toBeGreaterThan(30);
      expect(properties.shortDescription.length).toBeLessThanOrEqual(180);
      expect(properties.shortDescription).not.toMatch(/building information and geometry|\bUW building\b/i);
    }
  });

  it("uses real official building photos when available and accepts buildings without one", () => {
    const chamberlin = collection.features.find(({ properties }) => properties.mapObjectId === "361");
    const soils = collection.features.find(({ properties }) => properties.name === "Soils Building");
    expect(chamberlin?.properties.photoUrl).toMatch(/^https:\/\/mapcdn\.wisc\.cloud\/rails\/active_storage\/blobs\/proxy\//);
    expect(collection.features.filter(({ properties }) => properties.photoUrl).length).toBeGreaterThanOrEqual(190);
    expect(soils?.properties.photoUrl).toBeNull();
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

  it("resolves direct map clicks against building outlines without selecting nearby buildings", () => {
    const vanVleck = findCampusBuildingAt(collection, [-89.405, 43.075]);
    expect(vanVleck?.properties.name).toBe("Van Vleck Hall");
    expect(findCampusBuildingAt(collection, [0, 0])).toBeUndefined();
  });

  it("labels a map preview with the trusted building under the pin", () => {
    expect(describeCampusMapPoint(collection, [-89.405, 43.075])).toMatch(/^Near .+/);
    expect(describeCampusMapPoint(null, [-89.405, 43.075])).toBe("Selected map point · approximate");
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

  it("rejects photo URLs from untrusted hosts", () => {
    const chamberlin = collection.features.find(({ properties }) => properties.mapObjectId === "361");
    expect(campusBuildingPropertiesSchema.safeParse({ ...chamberlin!.properties, photoUrl: "https://example.com/photo.jpg" }).success).toBe(false);
  });
});
