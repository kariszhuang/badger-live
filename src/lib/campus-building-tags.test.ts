import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCampusBuildings } from "./campus-buildings";
import { matchesCampusBuildingSearch } from "./campus-building-tags";

describe("campus building topics", () => {
  const buildings = parseCampusBuildings(JSON.parse(readFileSync(resolve(process.cwd(), "public/data/uw-campus-buildings.geojson"), "utf8")) as unknown);

  it("assigns readable, searchable topics to every building", () => {
    expect(buildings.features.every(({ properties }) => properties.tags.length > 0)).toBe(true);

    const microbialSciences = buildings.features.find(({ properties }) => properties.name === "Microbial Sciences")!.properties;
    expect(microbialSciences.tags).toContain("Microbiology");
    expect(matchesCampusBuildingSearch(microbialSciences, "microbiology")).toBe(true);
    expect(matchesCampusBuildingSearch(microbialSciences, "bacteriology")).toBe(true);
    expect(matchesCampusBuildingSearch(microbialSciences, "1550 Linden")).toBe(true);
    expect(matchesCampusBuildingSearch(microbialSciences, "this does not exist")).toBe(false);
  });

  it("keeps discipline facets on topic rather than adding generic building labels", () => {
    const building = buildings.features.find(({ properties }) => properties.name === "Memorial Union")!.properties;
    expect(building.tags).toContain("Dining & events");
    expect(building.tags).toContain("Arts & performance");
    expect(building.tags).not.toContain("Building");
  });
});
