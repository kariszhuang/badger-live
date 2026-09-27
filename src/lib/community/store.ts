import "server-only";
import postgres from "postgres";
import { databaseConnectionString } from "@/lib/database-url";
import type { CommunityKind, CommunityUpdate } from "./types";

type Row = {
  id: string; kind: CommunityKind; title: string; description: string; place_name: string;
  longitude: number | string; latitude: number | string; starts_at: Date | string | null; ends_at: Date | string | null;
  source_url: string | null; is_demo: boolean; created_at: Date | string; up_votes: number; down_votes: number;
};

let client: ReturnType<typeof postgres> | null = null;
function db() {
  const url = databaseConnectionString();
  if (!url) throw new Error("Community database unavailable");
  client ??= postgres(url, { max: 3, connect_timeout: 3, idle_timeout: 20, prepare: false });
  return client;
}

function toUpdate(row: Row): CommunityUpdate {
  return {
    id: row.id, kind: row.kind, title: row.title, description: row.description, placeName: row.place_name,
    coordinates: [Number(row.longitude), Number(row.latitude)],
    startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : null,
    endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null,
    sourceUrl: row.source_url, isDemo: row.is_demo, createdAt: new Date(row.created_at).toISOString(),
    upVotes: Number(row.up_votes), downVotes: Number(row.down_votes),
  };
}

const columns = `id, kind, title, description, place_name,
  extensions.st_x(point::extensions.geometry) as longitude,
  extensions.st_y(point::extensions.geometry) as latitude,
  starts_at, ends_at, source_url, is_demo, created_at, up_votes, down_votes`;

export async function listCommunityUpdates(): Promise<CommunityUpdate[]> {
  const sql = db();
  const rows = await sql.unsafe<Row[]>(`select ${columns} from public.community_updates where hidden_at is null order by is_demo asc, created_at desc limit 200`);
  return rows.map(toUpdate);
}

export async function createCommunityUpdate(input: {
  id: string; kind: CommunityKind; title: string; description: string; placeName: string;
  coordinates: [number, number]; startsAt: string | null; endsAt: string | null;
}): Promise<CommunityUpdate> {
  const sql = db();
  const rows = await sql<Row[]>`
    insert into public.community_updates(id, kind, title, description, place_name, point, starts_at, ends_at)
    values (${input.id}::uuid, ${input.kind}, ${input.title}, ${input.description}, ${input.placeName},
      extensions.st_setsrid(extensions.st_makepoint(${input.coordinates[0]}, ${input.coordinates[1]}), 4326)::extensions.geography,
      ${input.startsAt}::timestamptz, ${input.endsAt}::timestamptz)
    returning id, kind, title, description, place_name,
      extensions.st_x(point::extensions.geometry) as longitude,
      extensions.st_y(point::extensions.geometry) as latitude,
      starts_at, ends_at, source_url, is_demo, created_at, up_votes, down_votes
  `;
  return toUpdate(rows[0]);
}

export async function voteCommunityUpdate(id: string, browserHmac: string, vote: -1 | 1) {
  const sql = db();
  const rows = await sql<{ result: { found: boolean; upVotes?: number; downVotes?: number; hidden?: boolean } }[]>`
    select public.vote_community_update(${id}::uuid, ${browserHmac}, ${vote}::smallint) as result
  `;
  return rows[0]?.result;
}
