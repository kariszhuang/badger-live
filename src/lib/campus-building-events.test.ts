import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCampusBuildings } from "./campus-buildings";
import { campusEventsAtBuilding, googleMapsDirectionsUrl } from "./campus-building-events";
import { normalizeEvents, type CampusEvent } from "./events";

const buildingData = JSON.parse(readFileSync(resolve(process.cwd(), "public/data/uw-campus-buildings.geojson"), "utf8")) as unknown;
const calendarSnapshot = JSON.parse(readFileSync(resolve(process.cwd(), "src/data/uw-2026-09-26.json"), "utf8")) as { events: unknown[] };
const buildings = parseCampusBuildings(buildingData);
const events = normalizeEvents(calendarSnapshot.events);

describe("building event association", () => {
  const memorialUnion = buildings.features.find(({ properties }) => properties.name === "Memorial Union")!.properties;

  it("lists every same-day UW event attached to a building's official map object", () => {
    const matching = campusEventsAtBuilding(events, memorialUnion);
    expect(matching).toHaveLength(5);
    expect(matching.map(({ title }) => title)).toEqual(expect.arrayContaining([
      "Kid Disco on the Terrace Stage",
      "Model Magic Pretzels",
      "David Landau on the Terrace Stage",
      "Mural Tour in Stiftskeller",
      "Madison Tuba Band",
    ]));
  });

  it("uses exact venue/location fallback but never groups by coordinates alone", () => {
    const template = events[0];
    const venueNameMatch = { ...template, uwMapUrl: undefined, venueName: "Memorial Union", locationLabel: "Some room" };
    const locationMatch = { ...template, uwMapUrl: undefined, venueName: undefined, locationLabel: "Meet outside Memorial Union" };
    const coordinatesOnly = { ...template, uwMapUrl: undefined, venueName: "Other building", locationLabel: "Other building", coordinates: memorialUnion.center };
    const conflictingMapId = { ...template, venueName: "Memorial Union", uwMapUrl: "https://map.wisc.edu/?initObj=0050" };
    expect(campusEventsAtBuilding([venueNameMatch, locationMatch, coordinatesOnly, conflictingMapId], memorialUnion).map(({ id }) => id)).toEqual([venueNameMatch.id, locationMatch.id]);
  });

  it("reorders GeoJSON longitude/latitude for Google Maps directions", () => {
    expect(googleMapsDirectionsUrl([-89.3999, 43.0764])).toBe("https://www.google.com/maps/dir/?api=1&destination=43.0764%2C-89.3999");
  });

  it("keeps the normalized day data typed as real UW events", () => {
    expect(events.every((event): event is CampusEvent => event.source === "uw-official")).toBe(true);
  });
});
