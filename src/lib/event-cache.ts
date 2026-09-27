import "server-only";
import postgres from "postgres";
import { campusEventSchema, type CampusEvent } from "./events";
import { EVENT_CACHE_TTL_MS } from "./event-cache-policy";
import { databaseConnectionString } from "./database-url";

const eventListSchema = campusEventSchema.array();

type CacheRow = { events: unknown; fetched_at: Date | string; expires_at: Date | string };
export type CachedEventDay = { events: CampusEvent[]; fetchedAt: string; expiresAt: string };

let client: ReturnType<typeof postgres> | null = null;
let retryAfter = 0;

function database() {
  const connectionString = databaseConnectionString();
  if (!connectionString || Date.now() < retryAfter) return null;
  client ??= postgres(connectionString, { max: 1, connect_timeout: 2, idle_timeout: 20, prepare: false });
  return client;
}

function markAvailable() { retryAfter = 0; }
function markUnavailable(operation: string) {
  retryAfter = Date.now() + 15_000;
  console.warn(`Local Supabase event cache ${operation} failed; continuing with UW Today.`);
}

export async function readCachedEventDay(date: string): Promise<CachedEventDay | null> {
  const sql = database();
  if (!sql) return null;
  try {
    const rows = await sql<CacheRow[]>`
      select events, fetched_at, expires_at
      from public.uw_event_days
      where event_date = ${date}::date
      limit 1
    `;
    markAvailable();
    if (!rows[0]) return null;
    const parsedEvents = eventListSchema.safeParse(rows[0].events);
    if (!parsedEvents.success) {
      console.warn("Local Supabase event cache contained an invalid event record; refreshing from UW Today.");
      return null;
    }
    return {
      events: parsedEvents.data,
      fetchedAt: new Date(rows[0].fetched_at).toISOString(),
      expiresAt: new Date(rows[0].expires_at).toISOString(),
    };
  } catch {
    markUnavailable("read");
    return null;
  }
}

export async function writeCachedEventDay(date: string, events: CampusEvent[], fetchedAt = new Date()): Promise<boolean> {
  const sql = database();
  if (!sql) return false;
  const expiresAt = new Date(fetchedAt.valueOf() + EVENT_CACHE_TTL_MS);
  try {
    await sql`
      insert into public.uw_event_days (event_date, events, fetched_at, expires_at, source)
      values (${date}::date, ${sql.json(events)}, ${fetchedAt.toISOString()}::timestamptz, ${expiresAt.toISOString()}::timestamptz, 'uw-official')
      on conflict (event_date) do update
      set events = excluded.events,
          fetched_at = excluded.fetched_at,
          expires_at = excluded.expires_at,
          source = excluded.source
    `;
    markAvailable();
    return true;
  } catch {
    markUnavailable("write");
    return false;
  }
}
