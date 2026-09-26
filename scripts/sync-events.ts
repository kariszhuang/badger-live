import postgres from "postgres";
import { chicagoDate, isValidDate } from "../src/lib/chicago-date";
import { normalizeEvents } from "../src/lib/events";
import { EVENT_CACHE_TTL_MS } from "../src/lib/event-cache-policy";

const date = process.argv[2] || chicagoDate();
if (!isValidDate(date)) {
  console.error("Usage: bun run sync:events [YYYY-MM-DD]");
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(`https://today.wisc.edu/events/day/${date}.json`, {
      headers: { Accept: "application/json", "User-Agent": "BadgerLive/1.0 (independent student project)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("UW calendar response was not JSON");
    const raw: unknown = await response.json();
    const events = normalizeEvents(raw);
    if (!Array.isArray(raw) || (raw.length > 0 && events.length === 0)) throw new Error("UW calendar records were invalid");

    const sql = postgres(process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 1, connect_timeout: 2, prepare: false });
    const fetchedAt = new Date();
    const expiresAt = new Date(fetchedAt.valueOf() + EVENT_CACHE_TTL_MS);
    try {
      await sql`
        insert into public.uw_event_days (event_date, events, fetched_at, expires_at, source)
        values (${date}::date, ${sql.json(events)}, ${fetchedAt.toISOString()}::timestamptz, ${expiresAt.toISOString()}::timestamptz, 'uw-official')
        on conflict (event_date) do update
        set events = excluded.events, fetched_at = excluded.fetched_at,
            expires_at = excluded.expires_at, source = excluded.source
      `;
    } finally {
      await sql.end();
    }
    console.log(`Cached ${events.length} verified UW calendar events for ${date} in local Supabase.`);
  } catch {
    console.error(`Could not refresh UW events for ${date}. Check the UW API and local Supabase status.`);
    process.exitCode = 1;
  }
}
