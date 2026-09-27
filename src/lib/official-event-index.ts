import type { CampusEvent } from "./events";
import type postgres from "postgres";

type PostgresExecutor = postgres.TransactionSql;

/** Keep the normalized Q&A/search index in the same database transaction as the day cache write. */
export async function writeOfficialEventIndex(sql: PostgresExecutor, date: string, events: CampusEvent[], fetchedAt: Date) {
  await sql`
    delete from public.official_events
    where (starts_at at time zone 'America/Chicago')::date = ${date}::date and source_name = 'uw-today'
  `;
  const rows = events.map((event) => ({
    source_event_id: event.officialId,
    starts_at: event.startsAt,
    ends_at: event.endsAt ?? null,
    title: event.title,
    subtitle: event.subtitle ?? null,
    description: event.description,
    organizer_url: event.organizerUrl ?? null,
    location_label: event.venueName || event.locationLabel,
    longitude: event.coordinates?.[0] ?? null,
    latitude: event.coordinates?.[1] ?? null,
    source_url: event.sourceUrl,
  }));
  if (!rows.length) return;
  await sql`
    insert into public.official_events(
      source_name, source_event_id, starts_at, ends_at, title, subtitle, description,
      organizer_url, location_label, point, source_url, fetched_at
    )
    select 'uw-today', record.source_event_id, record.starts_at, record.ends_at,
      record.title, record.subtitle, record.description, record.organizer_url,
      record.location_label,
      case when record.longitude is null or record.latitude is null then null else
        extensions.st_setsrid(extensions.st_makepoint(record.longitude, record.latitude), 4326)::extensions.geography end,
      record.source_url, ${fetchedAt.toISOString()}::timestamptz
    from pg_catalog.jsonb_to_recordset(${sql.json(rows)}) as record(
      source_event_id text, starts_at timestamptz, ends_at timestamptz, title text,
      subtitle text, description text, organizer_url text, location_label text,
      longitude double precision, latitude double precision, source_url text
    )
    on conflict (source_name, source_event_id, starts_at) do update set
      ends_at = excluded.ends_at, title = excluded.title, subtitle = excluded.subtitle,
      description = excluded.description, organizer_url = excluded.organizer_url,
      location_label = excluded.location_label, point = excluded.point,
      source_url = excluded.source_url, fetched_at = excluded.fetched_at
  `;
}
