import { describe, expect, it } from "vitest";
import { groupVenues, normalizeEvent, normalizeEvents, parseLatLon } from "./events";
import snapshot from "@/data/uw-2026-09-26.json";

describe("UW event normalization", () => {
  it("converts UW latitude,longitude to MapLibre longitude,latitude", () => {
    expect(parseLatLon("43.0738,-89.4093")).toEqual([-89.4093, 43.0738]);
    expect(parseLatLon("-89.4093,43.0738")).toBeNull();
    expect(parseLatLon("43.1,wat")).toBeNull();
    expect(parseLatLon("")).toBeNull();
  });
  it("keeps unmapped events and never assumes unknown cost is free", () => {
    const event = normalizeEvent(snapshot.events[0]);
    expect(event?.coordinates).toBeNull();
    expect(event?.priceLabel).toBe("Free!");
    const unknownCost = normalizeEvent({ ...snapshot.events[0], cost: "" });
    expect(unknownCost?.priceLabel).toBeUndefined();
  });
  it("preserves distinct occurrences under one official id", () => {
    const first = snapshot.events[0];
    const second = { ...first, startDate8601: "2026-09-26T07:00:00-05:00" };
    const events = normalizeEvents([first, second, { ...first }, { title: "", id: 22 }]);
    expect(events).toHaveLength(2);
    expect(events[0].id).not.toBe(events[1].id);
  });
  it("maps explicit food tags to their own category while preserving mixed tags", () => {
    const event = normalizeEvent({ ...snapshot.events[0], tags: ["Food", "music"] });
    expect(event?.categories).toEqual(["food", "music"]);
    expect(event?.category).toBe("food");
  });
  it("normalizes all 20 verified September 26 records", () => {
    const events = normalizeEvents(snapshot.events);
    expect(events).toHaveLength(20);
    expect(events.filter((event) => event.coordinates)).toHaveLength(14);
    expect(events.every((event) => event.sourceUrl.startsWith("https://today.wisc.edu/events/view/"))).toBe(true);
  });
  it("groups same official venue while preserving event cards", () => {
    const events = normalizeEvents(snapshot.events);
    const groups = groupVenues(events);
    const union = groups.find((group) => group.name === "Memorial Union");
    expect(union).toBeDefined();
    expect(union!.events.length).toBeGreaterThan(1);
    expect(new Set(union!.events.map((event) => event.id)).size).toBe(union!.events.length);
  });
  it("does not combine unrelated venues at identical coordinates", () => {
    const event = normalizeEvent(snapshot.events.find((row) => row.latlon));
    expect(event).not.toBeNull();
    const other = { ...event!, id: "other", venueName: "Different place", uwMapUrl: undefined };
    expect(groupVenues([event!, other])).toHaveLength(2);
  });
});
