import "server-only";
import { normalizeEvents, type CampusEvent } from "./events";
import { isValidDate } from "./chicago-date";
import snapshot from "@/data/uw-2026-09-26.json";

export type EventsResult = { events: CampusEvent[]; source: "uw-official"; fetchedAt: string; stale: boolean; fallback: boolean; snapshotCapturedAt?: string };

export async function getEventsForDate(date: string): Promise<EventsResult> {
  if (!isValidDate(date)) throw new Error("Invalid date");
  const url = `https://today.wisc.edu/events/day/${date}.json`;
  try {
    const response = await fetch(url, {
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(10000),
      headers: { Accept: "application/json", "User-Agent": "BadgerLive/1.0 (independent student project)" },
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error(`UW HTTP ${response.status}`);
    const raw: unknown = await response.json();
    const events = normalizeEvents(raw);
    if (Array.isArray(raw) && raw.length > 0 && events.length === 0) throw new Error("UW records could not be normalized");
    return { events, source: "uw-official", fetchedAt: new Date().toISOString(), stale: false, fallback: false };
  } catch (error) {
    console.error("UW calendar fetch failed", error instanceof Error ? error.message : "Unknown error");
    if (date !== "2026-09-26") throw error;
    return { events: normalizeEvents(snapshot.events), source: "uw-official", fetchedAt: new Date().toISOString(), stale: true, fallback: true, snapshotCapturedAt: snapshot.capturedAt };
  }
}
