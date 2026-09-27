import "server-only";
import postgres from "postgres";
import type { CommunityReportCategory, ObservedWindow, SafetyModerationItem, CommunitySafetyReport, ReportStatus } from "./safety";
import { publicReportDescription, publicReportStatus } from "./safety";
import { databaseConnectionString } from "./database-url";

const REPORT_RETENTION_DAYS = 14;

type ReportRow = {
  id: string;
  category: CommunityReportCategory;
  building_id: string;
  building_name: string;
  coordinates: unknown;
  status: ReportStatus;
  report_count: number | string;
  distinct_reporters?: number | string;
  first_reported_at: Date | string;
  last_reported_at: Date | string;
  last_observed_window: ObservedWindow;
  expires_at: Date | string;
};

let client: ReturnType<typeof postgres> | null = null;
let retryAfter = 0;

function database() {
  const connectionString = databaseConnectionString();
  if (!connectionString || Date.now() < retryAfter) return null;
  client ??= postgres(connectionString, { max: 1, connect_timeout: 2, idle_timeout: 20, prepare: false });
  return client;
}

function unavailable(operation: string) {
  retryAfter = Date.now() + 15_000;
  console.warn(`Supabase Postgres safety queue ${operation} failed; no report content was returned.`);
}

export class SafetyStoreError extends Error {
  constructor(readonly code: "unavailable" | "rate-limited" | "duplicate" | "not-found" | "needs-more-reports" | "invalid-action") {
    super(code);
  }
}

export async function submitSafetyReport(input: {
  category: CommunityReportCategory;
  buildingId: string;
  buildingName: string;
  coordinates: [number, number];
  observedWindow: ObservedWindow;
  reporterHash: string;
}) {
  const sql = database();
  if (!sql) throw new SafetyStoreError("unavailable");
  try {
    const id = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${input.reporterHash}, 0))`;
      await tx`delete from public.safety_reports where expires_at < now()`;

      const recent = await tx<{ count: number | string }[]>`
        select count(*) as count from public.safety_reports
        where reporter_hash = ${input.reporterHash} and created_at > now() - interval '24 hours'
      `;
      if (Number(recent[0]?.count || 0) >= 4) throw new SafetyStoreError("rate-limited");

      const duplicate = await tx<{ id: string }[]>`
        select id from public.safety_reports
        where reporter_hash = ${input.reporterHash}
          and category = ${input.category}
          and building_id = ${input.buildingId}
          and created_at > now() - interval '6 hours'
        limit 1
      `;
      if (duplicate.length) throw new SafetyStoreError("duplicate");

      const inserted = await tx<{ id: string }[]>`
        insert into public.safety_reports
          (category, building_id, building_name, coordinates, observed_window, reporter_hash, status, expires_at)
        values
          (${input.category}, ${input.buildingId}, ${input.buildingName}, ${tx.json(input.coordinates)}, ${input.observedWindow}, ${input.reporterHash}, 'pending', now() + ${REPORT_RETENTION_DAYS} * interval '1 day')
        returning id
      `;
      return inserted[0]?.id;
    });
    if (!id) throw new SafetyStoreError("unavailable");
    retryAfter = 0;
    return { id };
  } catch (error) {
    if (error instanceof SafetyStoreError) throw error;
    unavailable("write");
    throw new SafetyStoreError("unavailable");
  }
}

export async function readPublicSafetyReports(): Promise<CommunitySafetyReport[]> {
  const sql = database();
  if (!sql) throw new SafetyStoreError("unavailable");
  try {
    await sql`delete from public.safety_reports where expires_at < now()`;
    await sql`delete from public.safety_moderation_events where created_at < now() - interval '90 days'`;
    const rows = await sql<ReportRow[]>`
      select
        min(id::text)::uuid::text as id,
        category,
        building_id,
        building_name,
        coordinates,
        (array_agg(status order by created_at desc))[1] as status,
        count(*) as report_count,
        min(created_at) as first_reported_at,
        max(created_at) as last_reported_at,
        (array_agg(observed_window order by created_at desc))[1] as last_observed_window,
        max(expires_at) as expires_at
      from public.safety_reports
      where status in ('published', 'confirmed', 'resolved') and expires_at > now()
      group by category, building_id, building_name, coordinates
      order by max(created_at) desc
      limit 200
    `;
    retryAfter = 0;
    return rows.map((row) => {
      const coordinates = Array.isArray(row.coordinates) ? row.coordinates : JSON.parse(String(row.coordinates));
      const [longitude, latitude] = coordinates as [number, number];
      const observedWindow = row.last_observed_window;
      const status = publicReportStatus(row.status, new Date(row.last_reported_at).toISOString(), Date.now(), observedWindow);
      return {
        id: `${row.category}:${row.building_id}`,
        category: row.category,
        buildingId: row.building_id,
        buildingName: row.building_name,
        coordinates: [longitude, latitude],
        status,
        reportCount: Number(row.report_count),
        reportedAt: new Date(row.last_reported_at).toISOString(),
        observedWindow,
        expiresAt: new Date(row.expires_at).toISOString(),
        source: "community",
        description: publicReportDescription(row.category, row.building_name, status),
      };
    });
  } catch {
    unavailable("read");
    throw new SafetyStoreError("unavailable");
  }
}

export async function readSafetyModerationQueue(): Promise<SafetyModerationItem[]> {
  const sql = database();
  if (!sql) throw new SafetyStoreError("unavailable");
  try {
    await sql`delete from public.safety_reports where expires_at < now()`;
    await sql`delete from public.safety_moderation_events where created_at < now() - interval '90 days'`;
    const rows = await sql<ReportRow[]>`
      select
        category,
        building_id,
        building_name,
        case when bool_or(status = 'pending') then 'pending'
             when bool_or(status = 'confirmed') then 'confirmed'
             else 'published' end as status,
        count(*) as report_count,
        count(distinct reporter_hash) as distinct_reporters,
        min(created_at) as first_reported_at,
        max(created_at) as last_reported_at,
        (array_agg(observed_window order by created_at desc))[1] as last_observed_window,
        max(expires_at) as expires_at
      from public.safety_reports
      where status in ('pending', 'published', 'confirmed') and expires_at > now()
      group by category, building_id, building_name
      order by case when bool_or(status = 'pending') then 0 else 1 end, max(created_at) desc
      limit 200
    `;
    retryAfter = 0;
    return rows.map((row) => ({
      category: row.category,
      buildingId: row.building_id,
      buildingName: row.building_name,
      status: row.status as SafetyModerationItem["status"],
      reportCount: Number(row.report_count),
      distinctReporters: Number(row.distinct_reporters || 0),
      firstReportedAt: new Date(row.first_reported_at).toISOString(),
      lastReportedAt: new Date(row.last_reported_at).toISOString(),
      lastObservedWindow: row.last_observed_window,
    }));
  } catch {
    unavailable("moderation read");
    throw new SafetyStoreError("unavailable");
  }
}

export async function moderateSafetyReports(input: {
  category: CommunityReportCategory;
  buildingId: string;
  action: "publish-unverified" | "confirm-environmental" | "resolve" | "reject";
  confirmationReviewed?: boolean;
  reviewerEmail: string;
}) {
  const sql = database();
  if (!sql) throw new SafetyStoreError("unavailable");
  try {
    const changed = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${input.category}), hashtext(${input.buildingId}))`;
      const eligibleStatuses = input.action === "resolve" ? ["published", "confirmed"]
        : input.action === "confirm-environmental" ? ["pending", "published", "confirmed"]
          : ["pending"];
      const existing = await tx<{ count: number | string; reporters: number | string }[]>`
        select count(*) as count, count(distinct reporter_hash) as reporters
        from public.safety_reports
        where category = ${input.category} and building_id = ${input.buildingId}
          and status = any(${tx.array(eligibleStatuses)}) and expires_at > now()
          and (not ${input.action === "confirm-environmental"} or created_at > now() - interval '24 hours')
      `;
      const count = Number(existing[0]?.count || 0);
      const reporterCount = Number(existing[0]?.reporters || 0);
      if (!count) throw new SafetyStoreError("not-found");

      if (input.action === "confirm-environmental") {
        if (!input.confirmationReviewed || reporterCount < 2) throw new SafetyStoreError("needs-more-reports");
      }

      const nextStatus = input.action === "publish-unverified" ? "published"
        : input.action === "confirm-environmental" ? "confirmed"
          : input.action === "resolve" ? "resolved" : "rejected";
      const allowedCurrent = eligibleStatuses;
      const rows = await tx<{ id: string }[]>`
        update public.safety_reports
        set status = ${nextStatus}, reviewed_at = now(), reviewer_email = ${input.reviewerEmail}
        where category = ${input.category} and building_id = ${input.buildingId}
          and status = any(${tx.array(allowedCurrent)}) and expires_at > now()
          and (not ${input.action === "confirm-environmental"} or created_at > now() - interval '24 hours')
        returning id
      `;
      if (!rows.length) throw new SafetyStoreError("not-found");
      await tx`
        insert into public.safety_moderation_events (category, building_id, action, report_count, distinct_reporters, reviewer_email)
        values (${input.category}, ${input.buildingId}, ${input.action}, ${rows.length}, ${reporterCount}, ${input.reviewerEmail})
      `;
      return rows.length;
    });
    retryAfter = 0;
    return { changed };
  } catch (error) {
    if (error instanceof SafetyStoreError) throw error;
    unavailable("moderation update");
    throw new SafetyStoreError("unavailable");
  }
}
