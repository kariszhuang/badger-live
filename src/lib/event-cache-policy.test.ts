import { describe, expect, it } from "vitest";
import { EVENT_CACHE_TTL_MS, isFreshEventCache } from "./event-cache-policy";

describe("local UW event cache policy", () => {
  it("keeps a saved day fresh for six hours and then refreshes it", () => {
    const fetchedAt = Date.parse("2026-09-26T18:00:00.000Z");
    const expiresAt = new Date(fetchedAt + EVENT_CACHE_TTL_MS).toISOString();
    expect(isFreshEventCache(expiresAt, fetchedAt)).toBe(true);
    expect(isFreshEventCache(expiresAt, fetchedAt + EVENT_CACHE_TTL_MS - 1)).toBe(true);
    expect(isFreshEventCache(expiresAt, fetchedAt + EVENT_CACHE_TTL_MS)).toBe(false);
  });

  it("treats malformed expiry values as stale", () => {
    expect(isFreshEventCache("not-a-date", Date.now())).toBe(false);
  });
});
