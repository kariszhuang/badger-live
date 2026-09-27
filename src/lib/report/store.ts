import "server-only";
import postgres from "postgres";
import { databaseConnectionString } from "@/lib/database-url";
import type { CampusPlace, DuplicateCandidate, HazardKind, HazardReport, ReportLocationMethod, ReportSeverity } from "./types";

type Sql = ReturnType<typeof postgres>;
type HazardRow = {
  id: string; kind: HazardKind; public_title: string; longitude: number | string; latitude: number | string;
  place_id: string | null; location_method: ReportLocationMethod; location_accuracy_m: number | null;
  reported_severity: ReportSeverity; observation_label: "unverified"; lifecycle: HazardReport["lifecycle"];
  observation_count: number; observed_at: Date | string; last_observed_at: Date | string;
  expires_at: Date | string; version: number;
};
type PlaceRow = { id: string; source_place_id: string; name: string; aliases: string[]; kind: CampusPlace["kind"]; longitude: number | string; latitude: number | string; official_source_url: string };
type PublishedHazard = HazardReport & { undoAvailable?: boolean; recheckStatus?: string };
type PublishedHazardBatch = { idempotent: boolean; reports: PublishedHazard[] };

let client: Sql | null = null;
let unavailableUntil = 0;
let placeCache: { expiresAt: number; places: CampusPlace[] } | null = null;

function database() {
  const connectionString = databaseConnectionString();
  if (!connectionString || Date.now() < unavailableUntil) return null;
  client ??= postgres(connectionString, { max: 3, connect_timeout: 3, idle_timeout: 20, prepare: false });
  return client;
}

function databaseFailed(operation: string) {
  unavailableUntil = Date.now() + 3000;
  console.warn(`Hazard reporting database ${operation} failed; the request was not accepted.`);
}

export class ReportStoreError extends Error {
  constructor(readonly code: "unavailable" | "idempotency_conflict" | "duplicate_changed" | "invalid" | "not_found") {
    super(code);
  }
}

export type PublishBatchItem = {
  item_index: number;
  report_id: string;
  action: "new" | "still_there";
  kind: HazardKind;
  longitude: number;
  latitude: number;
  place_id: string | null;
  location_method: ReportLocationMethod;
  location_accuracy_m: number | null;
  reported_severity: ReportSeverity;
  observed_at: string;
};

function toHazardReport(row: HazardRow): HazardReport {
  return {
    id: row.id,
    kind: row.kind,
    title: row.public_title,
    coordinates: [Number(row.longitude), Number(row.latitude)],
    placeId: row.place_id,
    locationMethod: row.location_method,
    locationAccuracyM: row.location_accuracy_m === null ? null : Number(row.location_accuracy_m),
    reportedSeverity: row.reported_severity,
    observationLabel: "unverified",
    lifecycle: row.lifecycle,
    observationCount: Number(row.observation_count),
    observedAt: new Date(row.observed_at).toISOString(),
    lastObservedAt: new Date(row.last_observed_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    version: Number(row.version),
  };
}

function decodePublishedHazardBatch(value: unknown, idempotentFallback = false): PublishedHazardBatch {
  const result = typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : value as Record<string, unknown> | null;
  if (!result || typeof result !== "object" || !Array.isArray(result.reports)) throw new Error("Invalid saved report receipt");
  return {
    idempotent: idempotentFallback || result.idempotent === true,
    reports: result.reports.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid saved report row");
      const row = value as Record<string, unknown>;
      return {
        id: String(row.id), kind: row.kind as HazardKind, title: String(row.title),
        coordinates: [Number(row.longitude), Number(row.latitude)], placeId: row.placeId ? String(row.placeId) : null,
        locationMethod: row.locationMethod as ReportLocationMethod,
        locationAccuracyM: row.locationAccuracyM === null ? null : Number(row.locationAccuracyM),
        reportedSeverity: row.reportedSeverity as ReportSeverity, observationLabel: "unverified",
        lifecycle: row.lifecycle as HazardReport["lifecycle"], observationCount: Number(row.observationCount),
        observedAt: new Date(String(row.observedAt)).toISOString(), lastObservedAt: new Date(String(row.lastObservedAt)).toISOString(),
        expiresAt: new Date(String(row.expiresAt)).toISOString(), version: Number(row.version),
        undoAvailable: row.undoAvailable === true, recheckStatus: typeof row.recheckStatus === "string" ? row.recheckStatus : undefined,
      };
    }),
  };
}

export async function consumeRateLimit(input: { keyHmac: string; action: string; limit: number; windowSeconds: number }) {
  const sql = database();
  if (!sql) throw new ReportStoreError("unavailable");
  try {
    const rows = await sql<{ allowed: boolean; retry_after_seconds: number }[]>`
      select allowed, retry_after_seconds
      from public.consume_public_rate_limit(${input.keyHmac}, ${input.action}, ${input.limit}, ${input.windowSeconds})
    `;
    unavailableUntil = 0;
    return { allowed: rows[0]?.allowed === true, retryAfterSeconds: Number(rows[0]?.retry_after_seconds || 60) };
  } catch {
    databaseFailed("rate limit");
    throw new ReportStoreError("unavailable");
  }
}

export async function listPublicHazards(bounds: [west: number, south: number, east: number, north: number]): Promise<HazardReport[]> {
  const sql = database();
  if (!sql) throw new ReportStoreError("unavailable");
  try {
    const rows = await sql<HazardRow[]>`
      select r.id, r.kind, r.public_title, extensions.st_x(r.point::extensions.geometry) as longitude,
        extensions.st_y(r.point::extensions.geometry) as latitude, r.place_id, r.location_method,
        r.location_accuracy_m, r.reported_severity, r.observation_label, r.lifecycle,
        r.observation_count, r.observed_at, r.last_observed_at, r.expires_at, r.version
      from public.hazard_reports r
      where r.lifecycle in ('active', 'stale', 'possibly_cleared')
        and r.expires_at > now()
        and extensions.st_intersects(r.point::extensions.geometry,
          extensions.st_makeenvelope(${bounds[0]}, ${bounds[1]}, ${bounds[2]}, ${bounds[3]}, 4326))
      order by r.last_observed_at desc limit 500
    `;
    unavailableUntil = 0;
    return rows.map(toHazardReport);
  } catch {
    databaseFailed("map read");
    throw new ReportStoreError("unavailable");
  }
}

export async function getCampusPlaces(): Promise<CampusPlace[]> {
  if (placeCache && placeCache.expiresAt > Date.now()) return placeCache.places;
  const sql = database();
  if (!sql) throw new ReportStoreError("unavailable");
  try {
    const rows = await sql<PlaceRow[]>`
      select id, source_place_id, name, aliases, kind,
        extensions.st_x(point::extensions.geometry) as longitude,
        extensions.st_y(point::extensions.geometry) as latitude, official_source_url
      from public.campus_places order by name limit 1000
    `;
    const places = rows.map((row) => ({
      id: row.id,
      sourcePlaceId: row.source_place_id,
      name: row.name,
      aliases: row.aliases || [],
      kind: row.kind,
      coordinates: [Number(row.longitude), Number(row.latitude)] as [number, number],
      officialSourceUrl: row.official_source_url,
    }));
    placeCache = { places, expiresAt: Date.now() + 5 * 60_000 };
    unavailableUntil = 0;
    return places;
  } catch {
    databaseFailed("campus place read");
    throw new ReportStoreError("unavailable");
  }
}

export async function searchCampusPlaces(query: string): Promise<CampusPlace[]> {
  const places = await getCampusPlaces();
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return places.filter((place) => [place.name, ...place.aliases].some((name) => name.toLocaleLowerCase().includes(needle))).slice(0, 12);
}

export async function resolveCampusPlace(value: string): Promise<CampusPlace | null> {
  const places = await getCampusPlaces();
  const needle = value.trim().toLocaleLowerCase();
  return places.find((place) => [place.name, ...place.aliases].some((name) => name.trim().toLocaleLowerCase() === needle)) || null;
}

export async function findNamedPlacesInText(text: string): Promise<CampusPlace[]> {
  const places = await getCampusPlaces();
  const needle = ` ${text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
  return places.filter((place) => [place.name, ...place.aliases].some((name) => {
    const phrase = ` ${name.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
    return phrase.length > 2 && needle.includes(phrase);
  })).sort((left, right) => right.name.length - left.name.length);
}

export async function findDuplicateCandidates(input: { kind: HazardKind; longitude: number; latitude: number; placeId: string | null }): Promise<DuplicateCandidate[]> {
  const sql = database();
  if (!sql) throw new ReportStoreError("unavailable");
  try {
    const rows = await sql<HazardRow[]>`
      select r.id, r.kind, r.public_title, extensions.st_x(r.point::extensions.geometry) as longitude,
        extensions.st_y(r.point::extensions.geometry) as latitude, r.place_id, r.location_method,
        r.location_accuracy_m, r.reported_severity, r.observation_label, r.lifecycle,
        r.observation_count, r.observed_at, r.last_observed_at, r.expires_at, r.version
      from public.hazard_reports r
      where r.kind = ${input.kind}
        and r.lifecycle in ('active', 'stale', 'possibly_cleared')
        and r.expires_at > now()
        and r.last_observed_at > now() - interval '7 days'
        and (r.place_id is null or ${input.placeId}::uuid is null or r.place_id = ${input.placeId}::uuid)
        and extensions.st_dwithin(r.point,
          extensions.st_setsrid(extensions.st_makepoint(${input.longitude}, ${input.latitude}), 4326)::extensions.geography,
          25)
      order by extensions.st_distance(r.point,
        extensions.st_setsrid(extensions.st_makepoint(${input.longitude}, ${input.latitude}), 4326)::extensions.geography)
      limit 5
    `;
    unavailableUntil = 0;
    return rows.map((row) => {
      const report = toHazardReport(row);
      return {
        id: report.id, kind: report.kind, title: report.title, coordinates: report.coordinates,
        placeId: report.placeId, locationMethod: report.locationMethod,
        locationAccuracyM: report.locationAccuracyM, lifecycle: report.lifecycle,
        observationCount: report.observationCount, lastObservedAt: report.lastObservedAt,
      };
    });
  } catch {
    databaseFailed("duplicate search");
    throw new ReportStoreError("unavailable");
  }
}

export async function getPublishedHazardBatch(input: { batchId: string; requestDigest: string }): Promise<PublishedHazardBatch | null> {
  const sql = database();
  if (!sql) throw new ReportStoreError("unavailable");
  try {
    const rows = await sql<Array<{ request_digest: string; response_json: unknown }>>`
      select request_digest, response_json from internal.report_submissions where batch_id = ${input.batchId}::uuid
    `;
    const existing = rows[0];
    if (!existing) {
      unavailableUntil = 0;
      return null;
    }
    if (existing.request_digest !== input.requestDigest) throw new ReportStoreError("idempotency_conflict");
    if (existing.response_json === null) throw new ReportStoreError("unavailable");
    const result = decodePublishedHazardBatch(existing.response_json, true);
    unavailableUntil = 0;
    return result;
  } catch (error) {
    if (error instanceof ReportStoreError) throw error;
    databaseFailed("idempotency lookup");
    throw new ReportStoreError("unavailable");
  }
}

export async function publishHazardBatch(input: {
  batchId: string; requestDigest: string; browserHmac: string; items: PublishBatchItem[];
  capabilityHashes: Array<{ item_index: number; secret_sha256: string }>;
}): Promise<PublishedHazardBatch> {
  const sql = database();
  if (!sql) throw new ReportStoreError("unavailable");
  try {
    const rows = await sql<{ result: unknown }[]>`
      select public.publish_report_batch(
        ${input.batchId}::uuid, ${input.requestDigest}, ${input.browserHmac},
        ${sql.json(input.items)}, ${sql.json(input.capabilityHashes)}
      ) as result
    `;
    const result = decodePublishedHazardBatch(rows[0]?.result);
    unavailableUntil = 0;
    return result;
  } catch (error) {
    if (error instanceof Error && /idempotency key reused/.test(error.message)) throw new ReportStoreError("idempotency_conflict");
    if (error instanceof Error && /recheck candidate/.test(error.message)) throw new ReportStoreError("duplicate_changed");
    if (error instanceof Error && /invalid report|missing report capability|invalid report item/.test(error.message)) throw new ReportStoreError("invalid");
    databaseFailed("publish transaction");
    throw new ReportStoreError("unavailable");
  }
}

export async function observeHazard(reportId: string, browserHmac: string, observation: "still_there" | "possibly_cleared") {
  const sql = database();
  if (!sql) throw new ReportStoreError("unavailable");
  try {
    const rows = await sql<{ result: unknown }[]>`select public.observe_report(${reportId}::uuid, ${browserHmac}, ${observation}) as result`;
    unavailableUntil = 0;
    return rows[0]?.result;
  } catch {
    databaseFailed("observation");
    throw new ReportStoreError("unavailable");
  }
}

export async function undoHazard(reportId: string, capabilityHash: string) {
  const sql = database();
  if (!sql) throw new ReportStoreError("unavailable");
  try {
    const rows = await sql<{ undone: boolean }[]>`select public.undo_report(${reportId}::uuid, ${capabilityHash}) as undone`;
    unavailableUntil = 0;
    return rows[0]?.undone === true;
  } catch {
    databaseFailed("undo");
    throw new ReportStoreError("unavailable");
  }
}

export async function flagHazard(reportId: string, browserHmac: string, reason: "inaccurate" | "outdated" | "misplaced") {
  const sql = database();
  if (!sql) throw new ReportStoreError("unavailable");
  try {
    const rows = await sql<{ result: unknown }[]>`select public.flag_report(${reportId}::uuid, ${browserHmac}, ${reason}) as result`;
    unavailableUntil = 0;
    return rows[0]?.result;
  } catch {
    databaseFailed("inaccurate report flag");
    throw new ReportStoreError("unavailable");
  }
}

export async function expireHazards() {
  const sql = database();
  if (!sql) throw new ReportStoreError("unavailable");
  try {
    const rows = await sql<{ expired: number }[]>`select public.expire_hazard_reports() as expired`;
    unavailableUntil = 0;
    return Number(rows[0]?.expired || 0);
  } catch {
    databaseFailed("expiry job");
    throw new ReportStoreError("unavailable");
  }
}

export async function listHazardsForRoute(bounds: [number, number, number, number]): Promise<HazardReport[]> {
  return listPublicHazards(bounds);
}

export async function beginImportRun(sourceName: string) {
  const sql = database();
  if (!sql) throw new ReportStoreError("unavailable");
  try {
    const rows = await sql<{ id: number }[]>`
      insert into internal.import_runs(source_name, outcome) values (${sourceName}, 'running') returning id
    `;
    unavailableUntil = 0;
    return Number(rows[0]?.id);
  } catch {
    databaseFailed("import log start");
    throw new ReportStoreError("unavailable");
  }
}

export async function finishImportRun(id: number, outcome: "succeeded" | "failed", details?: string) {
  const sql = database();
  if (!sql) throw new ReportStoreError("unavailable");
  try {
    await sql`
      update internal.import_runs set outcome = ${outcome}, finished_at = now(), details = ${details?.slice(0, 500) || null}
      where id = ${id}
    `;
    unavailableUntil = 0;
  } catch {
    databaseFailed("import log finish");
    throw new ReportStoreError("unavailable");
  }
}

export async function inspectReportedRoute(coordinates: Array<[number, number]>) {
  const sql = database();
  if (!sql) throw new ReportStoreError("unavailable");
  const geojson = JSON.stringify({ type: "LineString", coordinates });
  try {
    const rows = await sql<HazardRow[]>`
      with route as (
        select extensions.st_setsrid(extensions.st_geomfromgeojson(${geojson}), 4326)::extensions.geography as path
      )
      select r.id, r.kind, r.public_title, extensions.st_x(r.point::extensions.geometry) as longitude,
        extensions.st_y(r.point::extensions.geometry) as latitude, r.place_id, r.location_method,
        r.location_accuracy_m, r.reported_severity, r.observation_label, r.lifecycle,
        r.observation_count, r.observed_at, r.last_observed_at, r.expires_at, r.version
      from public.hazard_reports r cross join route
      where r.lifecycle in ('active', 'stale', 'possibly_cleared') and r.expires_at > now()
        and extensions.st_dwithin(r.point, route.path, 15)
      order by r.last_observed_at desc limit 100
    `;
    unavailableUntil = 0;
    return rows.map(toHazardReport);
  } catch {
    databaseFailed("route inspection");
    throw new ReportStoreError("unavailable");
  }
}

export async function getAssistantEventRows(from: string, to: string) {
  const sql = database();
  if (!sql) return [];
  try {
    const rows = await sql<Array<{ source_event_id: string; title: string; starts_at: Date | string; ends_at: Date | string | null; location_label: string; source_url: string }>>`
      select source_event_id, title, starts_at, ends_at, location_label, source_url
      from public.official_events where starts_at >= ${from}::timestamptz and starts_at < ${to}::timestamptz
      order by starts_at asc limit 50
    `;
    unavailableUntil = 0;
    return rows.map((row) => ({ ...row, starts_at: new Date(row.starts_at).toISOString(), ends_at: row.ends_at ? new Date(row.ends_at).toISOString() : null }));
  } catch {
    databaseFailed("assistant event lookup");
    return [];
  }
}

export async function getAssistantHazardRows(bounds: [number, number, number, number]) {
  return listPublicHazards(bounds);
}
