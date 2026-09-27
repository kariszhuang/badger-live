import { describe, expect, it } from "vitest";
import { localCampusPlaceFallback, localCampusPlaceMetadata, searchLocalCampusPlaces } from "./campus-place-catalog";

describe("trusted campus place search", () => {
  it("matches official names and aliases when the database is unavailable", () => {
    const place = searchLocalCampusPlaces("Van Vleck")[0];
    expect(place).toMatchObject({ id: null, name: "Van Vleck Hall", sourcePlaceId: expect.any(String) });
  });

  it("matches descriptions and campus-use keywords", () => {
    const vanVleck = localCampusPlaceMetadata().find((place) => place.name === "Van Vleck Hall");
    expect(vanVleck?.keywords.join(" ")).toMatch(/math|classroom|teaching/i);
    expect(searchLocalCampusPlaces("mathematics").map((place) => place.name)).toContain("Van Vleck Hall");
  });

  it("understands common campus search terms and building numbers", () => {
    expect(searchLocalCampusPlaces("dorm").length).toBeGreaterThan(0);
    expect(searchLocalCampusPlaces("0050").map((place) => place.name)).toContain("Bascom Hall");
  });

  it("returns only compact trusted building records", () => {
    const places = localCampusPlaceFallback();
    expect(places).toHaveLength(219);
    expect(places.every((place) => place.id === null && place.coordinates.every(Number.isFinite))).toBe(true);
  });
});
