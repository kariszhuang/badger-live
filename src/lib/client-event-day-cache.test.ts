import { describe, expect, it } from "vitest";
import {
  CLIENT_EVENT_DAY_CACHE_MAX_ENTRIES,
  CLIENT_EVENT_DAY_CACHE_TTL_MS,
  readClientEventDay,
  writeClientEventDay,
  type ClientEventDayCache,
} from "./client-event-day-cache";

describe("client event day cache", () => {
  it("returns a fresh day and refreshes its least-recently-used position", () => {
    const cache: ClientEventDayCache<string> = new Map();
    writeClientEventDay(cache, "2026-09-25", "yesterday", 100);
    writeClientEventDay(cache, "2026-09-26", "today", 100);

    expect(readClientEventDay(cache, "2026-09-25", 101)).toBe("yesterday");
    expect([...cache.keys()]).toEqual(["2026-09-26", "2026-09-25"]);
  });

  it("expires a day after five minutes", () => {
    const cache: ClientEventDayCache<string> = new Map();
    writeClientEventDay(cache, "2026-09-26", "today", 100);

    expect(readClientEventDay(cache, "2026-09-26", 100 + CLIENT_EVENT_DAY_CACHE_TTL_MS - 1)).toBe("today");
    expect(readClientEventDay(cache, "2026-09-26", 100 + CLIENT_EVENT_DAY_CACHE_TTL_MS)).toBeNull();
    expect(cache.has("2026-09-26")).toBe(false);
  });

  it("bounds retained days and evicts the least recently used entry", () => {
    const cache: ClientEventDayCache<number> = new Map();
    for (let day = 1; day <= CLIENT_EVENT_DAY_CACHE_MAX_ENTRIES; day += 1) {
      writeClientEventDay(cache, `2026-09-${String(day).padStart(2, "0")}`, day, day);
    }
    readClientEventDay(cache, "2026-09-01", 20);
    writeClientEventDay(cache, "2026-09-08", 8, 21);

    expect(cache.size).toBe(CLIENT_EVENT_DAY_CACHE_MAX_ENTRIES);
    expect(cache.has("2026-09-02")).toBe(false);
    expect(cache.has("2026-09-01")).toBe(true);
  });
});
