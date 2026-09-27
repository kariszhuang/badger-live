import { describe, expect, it } from "vitest";
import {
  parseBlotterDocument,
  parseBlotterFeed,
  resolveBlotterBuilding,
} from "./crime-log";
import { filterCrimeIncidents, groupCrimeLocations, groupUnmappedCrimeLocations, type BlotterBuilding } from "./crime-model";

const buildings: BlotterBuilding[] = [
  { mapObjectId: "0055", name: "Chamberlin Hall", center: [-89.4093, 43.0738] },
  { mapObjectId: "0564", name: "Nicholas Recreation Center", center: [-89.4045, 43.071] },
  { mapObjectId: "0145", name: "Memorial Library", center: [-89.4001, 43.0753] },
];

function page(rows: string[]) {
  return `<main><article><h1>Daily Blotter for September 20th 2026</h1></article><ul>${rows.map((row) => `<li>${row}</li>`).join("")}</ul></main>`;
}

describe("UWPD blotter normalization", () => {
  it("uses UWPD's 6 a.m. reporting-window boundary and converts Chicago time to an unambiguous instant", () => {
    const { incidents } = parseBlotterDocument(page([
      "9:55 am, Damage to Property, Chamberlin Hall. Anonymous details omitted.",
      "1:06 am, Fraud, Chamberlin Hall. Anonymous details omitted.",
    ]), "https://uwpd.wisc.edu/daily-blotter/2026-09-20/", buildings);

    expect(incidents.map(({ incidentDate, occurredAt }) => [incidentDate, occurredAt])).toEqual([
      ["2026-09-19", "2026-09-19T14:55:00.000Z"],
      ["2026-09-20", "2026-09-20T06:06:00.000Z"],
    ]);
    expect(incidents.every(({ details }) => details === undefined)).toBe(true);
  });

  it("uses the Chicago winter offset as well as the summer offset", () => {
    const { incidents } = parseBlotterDocument(
      "<main><article><h1>Daily Blotter for January 2nd 2026</h1></article><ul><li>7:00 pm, Fraud, Chamberlin Hall. Details omitted.</li></ul></main>",
      "https://uwpd.wisc.edu/daily-blotter/2026-01-02/",
      buildings,
    );
    expect(incidents[0].incidentDate).toBe("2026-01-01");
    expect(incidents[0].occurredAt).toBe("2026-01-02T01:00:00.000Z");
  });

  it("maps only exact named campus buildings and leaves generic or redacted locations unmapped", () => {
    expect(resolveBlotterBuilding("Memorial Library", buildings)?.mapObjectId).toBe("0145");
    expect(resolveBlotterBuilding("Nick Rec Center", buildings)?.mapObjectId).toBe("0564");
    expect(resolveBlotterBuilding("Residence Hall", buildings)).toBeNull();
    expect(resolveBlotterBuilding("Location Redacted", buildings)).toBeNull();
    expect(resolveBlotterBuilding("Memorial Library, west entrance", buildings)).toBeNull();
  });

  it("keeps only allowlisted report types and omits an entry whose source narrative says it was not a theft", () => {
    const { incidents } = parseBlotterDocument(page([
      "12:43 pm, Theft/Larceny, Nicholas Recreation Center. An e-scooter was reported stolen from the western bike racks.",
      "11:11 am, Fraud, Residence Hall. A person reported being scammed out of money for football tickets; payment through Venmo is under investigation.",
      "7:34 pm, Theft/Larceny, Memorial Library. Investigation found the person was picking the bike up for another person.",
      "10:51 pm, Underage Alcohol Violation, Residence Hall. Medical details omitted.",
      "3:00 pm, Battery, Chamberlin Hall. Domestic violence details omitted.",
      "2:18 pm, Other, Monroe Street. No details.",
    ]), "https://uwpd.wisc.edu/daily-blotter/2026-09-20/", buildings);

    expect(incidents.map((incident) => [incident.incidentType, incident.locationLabel, incident.buildingId])).toEqual([
      ["Theft/Larceny", "Nicholas Recreation Center", "0564"],
      ["Fraud", "Residence Hall", null],
    ]);
    expect(incidents[0].details).toBe("An e-scooter was reported stolen from the western bike racks.");
    expect(incidents[1].details).toContain("payment through Venmo is under investigation");
    expect(incidents[1].coordinates).toBeNull();
  });

  it("groups multiple reports at one building without merging their incident records", () => {
    const { incidents } = parseBlotterDocument(page([
      "12:43 pm, Theft/Larceny, Nicholas Recreation Center. An e-scooter was reported stolen.",
      "2:00 pm, Fraud, Nicholas Recreation Center. A fraud report was filed.",
      "11:11 am, Fraud, Residence Hall. A scam was reported.",
    ]), "https://uwpd.wisc.edu/daily-blotter/2026-09-20/", buildings);

    const groups = groupCrimeLocations(incidents);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Nicholas Recreation Center");
    expect(groups[0].incidents.map((incident) => incident.incidentType)).toEqual(["Fraud", "Theft/Larceny"]);
    expect(incidents).toHaveLength(3);
  });

  it("groups repeated generalized Residence Hall entries in the list without assigning a map point", () => {
    const { incidents } = parseBlotterDocument(page([
      "11:11 am, Fraud, Residence Hall. A scam was reported.",
      "1:11 am, Fraud, Residence Hall. A different scam was reported.",
      "12:43 pm, Theft/Larceny, Nicholas Recreation Center. Details omitted.",
    ]), "https://uwpd.wisc.edu/daily-blotter/2026-09-20/", buildings);
    const groups = groupUnmappedCrimeLocations(incidents);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Residence Hall");
    expect(groups[0].incidents).toHaveLength(2);
    expect(groups[0].incidents.every((incident) => incident.coordinates === null)).toBe(true);
  });

  it("filters on category and public location/type fields without searching narratives", () => {
    const { incidents } = parseBlotterDocument(page([
      "12:43 pm, Theft/Larceny, Nicholas Recreation Center. A private narrative phrase.",
      "2:00 pm, Fraud, Chamberlin Hall. Another private narrative phrase.",
    ]), "https://uwpd.wisc.edu/daily-blotter/2026-09-20/", buildings);
    expect(filterCrimeIncidents(incidents, "theft", "nicholas")).toHaveLength(1);
    expect(filterCrimeIncidents(incidents, "all", "private narrative")).toHaveLength(0);
  });

  it("accepts only dated UWPD daily-blotter RSS records", () => {
    const items = parseBlotterFeed(`<rss><channel>
      <item><title>Daily Blotter for September 20th 2026</title><link>https://uwpd.wisc.edu/daily-blotter/2026-09-20/</link></item>
      <item><title>Other UWPD news</title><link>https://uwpd.wisc.edu/news/2026/</link></item>
      <item><title>Daily Blotter for September 20th 2026</title><link>https://evil.example/daily-blotter/2026-09-20/</link></item>
    </channel></rss>`);
    expect(items).toEqual([{
      title: "Daily Blotter for September 20th 2026",
      url: "https://uwpd.wisc.edu/daily-blotter/2026-09-20/",
      date: "2026-09-20",
    }]);
  });
});
