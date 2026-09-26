import "server-only";
import { normalizeEvents, type CampusEvent } from "./events";
import { isValidDate } from "./chicago-date";
import { readCachedEventDay, writeCachedEventDay } from "./event-cache";
import { isFreshEventCache } from "./event-cache-policy";
import snapshot from "@/data/uw-2026-09-26.json";

export type EventsResult = { events: CampusEvent[]; source: "uw-official"; fetchedAt: string; stale: boolean; fallback: boolean; cacheStatus: "supabase" | "live" | "snapshot"; snapshotCapturedAt?: string };

export async function fetchOfficialEvents(date: string): Promise<CampusEvent[]> {
  if (!isValidDate(date)) throw new Error("Invalid date");
  const url = `https://today.wisc.edu/events/day/${date}.json`;
  const response = await fetch(url, {
    next: { revalidate: 900 },
    signal: AbortSignal.timeout(10000),
    headers: { Accept: "application/json", "User-Agent": "BadgerLive/1.0 (independent student project)" },
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error(`UW HTTP ${response.status}`);
  const raw: unknown = await response.json();
  const events = normalizeEvents(raw);
  if (Array.isArray(raw) && raw.length > 0 && events.length === 0) throw new Error("UW records could not be normalized");
  return events;
}

export async function getEventsForDate(date: string): Promise<EventsResult> {
  if (!isValidDate(date)) throw new Error("Invalid date");
  const cached = await readCachedEventDay(date);
  const now = Date.now();
  if (cached && isFreshEventCache(cached.expiresAt, now)) {
    return { events: cached.events, source: "uw-official", fetchedAt: cached.fetchedAt, stale: false, fallback: false, cacheStatus: "supabase" };
  }

  try {
    const events = await fetchOfficialEvents(date);
    const fetchedAt = new Date();
    const stored = await writeCachedEventDay(date, events, fetchedAt);
    return { events, source: "uw-official", fetchedAt: fetchedAt.toISOString(), stale: false, fallback: false, cacheStatus: stored ? "supabase" : "live" };
  } catch (error) {
    console.error("UW calendar fetch failed", error instanceof Error ? error.message : "Unknown error");
    if (cached) return { events: cached.events, source: "uw-official", fetchedAt: cached.fetchedAt, stale: true, fallback: true, cacheStatus: "supabase" };
    if (date !== "2026-09-26") throw error;
    return { events: normalizeEvents(snapshot.events), source: "uw-official", fetchedAt: new Date().toISOString(), stale: true, fallback: true, cacheStatus: "snapshot", snapshotCapturedAt: snapshot.capturedAt };
  }
}
