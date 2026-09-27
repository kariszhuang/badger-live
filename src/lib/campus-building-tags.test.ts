import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCampusBuildings } from "./campus-buildings";
import { campusBuildingTags, matchesCampusBuildingSearch } from "./campus-building-tags";

describe("campus building topics", () => {
  const buildings = parseCampusBuildings(JSON.parse(readFileSync(resolve(process.cwd(), "public/data/uw-campus-buildings.geojson"), "utf8")) as unknown);

  it("derives useful searchable topics from building-use descriptions", () => {
    const microbialSciences = buildings.features.find(({ properties }) => properties.name === "Microbial Sciences")!.properties;
    expect(microbialSciences.tags).toContain("Microbiology");
    expect(microbialSciences.tags).toContain("Food & dairy science");
    expect(matchesCampusBuildingSearch(microbialSciences, "microbiology")).toBe(true);
    expect(matchesCampusBuildingSearch(microbialSciences, "bacteriology")).toBe(true);
    expect(matchesCampusBuildingSearch(microbialSciences, "1550 Linden")).toBe(true);
    expect(matchesCampusBuildingSearch(microbialSciences, "this does not exist")).toBe(false);
  });

  it("never turns a building's name into a tag", () => {
    const memorialUnion = buildings.features.find(({ properties }) => properties.name === "Memorial Union")!.properties;
    expect(memorialUnion.tags).toContain("Dining");
    expect(memorialUnion.tags).toContain("Music & performance");
    expect(memorialUnion.tags).not.toContain("Memorial");
    expect(memorialUnion.tags).not.toContain("Union");

    const bascomHall = buildings.features.find(({ properties }) => properties.name === "Bascom Hall")!.properties;
    expect(bascomHall.tags).toContain("Campus administration");
    expect(bascomHall.tags).not.toContain("Bascom");
    expect(bascomHall.tags).not.toContain("Campus facilities & utilities");

    for (const { properties } of buildings.features) {
      expect(properties.tags).not.toContain(properties.name);
    }
  });

  it("leaves tagless facilities unclassified when their descriptions do not identify a use", () => {
    expect(campusBuildingTags("A university facility near the central campus.")).toEqual([]);
    expect(campusBuildingTags("A university campus facility on Bernard Court.")).toEqual([]);
  });

  it("uses precise facilities instead of nearby-place wording to infer athletics", () => {
    const schumanShelter = buildings.features.find(({ properties }) => properties.name === "Carl Schuman Shelter")!.properties;
    expect(schumanShelter.tags).not.toContain("Athletics & recreation");
    expect(schumanShelter.tags).toContain("Outdoor shelter");

    const chamberlin = buildings.features.find(({ properties }) => properties.name === "Chamberlin Hall")!.properties;
    expect(chamberlin.tags).toContain("Physics & astronomy");
    expect(chamberlin.tags).toContain("Research & laboratories");

    const childrenHospital = buildings.features.find(({ properties }) => properties.name === "American Family Children's Hospital")!.properties;
    expect(childrenHospital.tags).toContain("Health & clinical care");
    expect(childrenHospital.tags).not.toContain("Child care & early learning");
  });

  it("keeps building services distinct from the buildings they serve", () => {
    const apartmentOffice = buildings.features.find(({ properties }) => properties.name === "Apartment Facilities Office")!.properties;
    expect(apartmentOffice.tags).toEqual(["University housing services"]);

    const studentApartments = buildings.features.find(({ properties }) => properties.name === "Harvey Street Apartments")!.properties;
    expect(studentApartments.tags).toContain("Student housing");

    const pyleCenter = buildings.features.find(({ properties }) => properties.name === "Pyle Center")!.properties;
    expect(pyleCenter.tags).toContain("Events & meeting spaces");
    expect(pyleCenter.tags).toContain("Student support");
  });

  it("does not infer adjacent or overly broad disciplines", () => {
    const animalScience = buildings.features.find(({ properties }) => properties.name === "Animal Science Building")!.properties;
    expect(animalScience.tags).toContain("Animal science");

    const engineering = buildings.features.find(({ properties }) => properties.name === "Agricultural Engineering Building")!.properties;
    expect(engineering.tags).toContain("Engineering");
    expect(engineering.tags).not.toContain("Biology & life sciences");

    const humanEcology = buildings.features.find(({ properties }) => properties.name === "Nancy Nicholas Hall")!.properties;
    expect(humanEcology.tags).toContain("Human ecology");
    expect(humanEcology.tags).not.toContain("Environment & ecology");

    expect(campusBuildingTags("Wisconsin Alumni Research Foundation offices.")).not.toContain("Alumni relations & advancement");
    expect(campusBuildingTags("A university facility near the Lakeshore athletic fields.")).not.toContain("Athletics & recreation");
  });

  it("searches descriptive synonyms without turning every phrase into a visible tag", () => {
    const microbialSciences = buildings.features.find(({ properties }) => properties.name === "Microbial Sciences")!.properties;
    expect(microbialSciences.tags).not.toContain("Medical microbiology");
    expect(matchesCampusBuildingSearch(microbialSciences, "medical microbiology")).toBe(true);
  });

  it("uses an audited purpose tag when a description's affiliation would mislead", () => {
    const deanResidence = buildings.features.find(({ properties }) => properties.name === "Agricultural Dean’s Residence")!.properties;
    expect(deanResidence.tags).toEqual(["Faculty residence"]);
  });
});
