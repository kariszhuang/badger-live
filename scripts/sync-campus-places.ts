import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { parseCampusBuildings } from "../src/lib/campus-buildings";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Set DATABASE_URL explicitly before syncing campus places; the script will not guess which database to write to.");
  process.exitCode = 1;
} else {
  const raw = await readFile(new URL("../public/data/uw-campus-buildings.geojson", import.meta.url), "utf8");
  const buildings = parseCampusBuildings(JSON.parse(raw));
  const aliasCandidates = new Map<string, number>();
  const aliasesById = new Map<string, string[]>();
  for (const { properties } of buildings.features) {
    const shortName = properties.name.replace(/\b(?:Hall|Building|Center|Centre|Memorial|Laboratory)\b/gi, " ").replace(/\s+/g, " ").trim();
    const candidates = [properties.buildingNumber, shortName].filter((value): value is string => Boolean(value && value.length > 1 && value.toLocaleLowerCase() !== properties.name.toLocaleLowerCase()));
    aliasesById.set(properties.mapObjectId, candidates);
    for (const alias of candidates) aliasCandidates.set(alias.toLocaleLowerCase(), (aliasCandidates.get(alias.toLocaleLowerCase()) || 0) + 1);
  }

  const poolerUrl = new URL(databaseUrl);
  const isSupabasePooler = poolerUrl.hostname.endsWith(".pooler.supabase.com");
  if (isSupabasePooler) {
    poolerUrl.port = "6543";
    poolerUrl.searchParams.delete("sslmode");
  }
  const client = new Client({
    connectionString: poolerUrl.toString(),
    connectionTimeoutMillis: 10_000,
    ...(isSupabasePooler ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  try {
    await client.connect();
    await client.query("BEGIN");
    try {
      for (const { properties } of buildings.features) {
        const aliases = (aliasesById.get(properties.mapObjectId) || [])
          .filter((alias) => aliasCandidates.get(alias.toLocaleLowerCase()) === 1);
        await client.query(`
          insert into public.campus_places(source_place_id, name, aliases, kind, point, official_source_url, updated_at)
          values (
            $1, $2, $3, 'building',
            extensions.st_setsrid(extensions.st_makepoint($4, $5), 4326)::extensions.geography,
            $6, now()
          )
          on conflict (source_place_id) do update set
            name = excluded.name, aliases = excluded.aliases, kind = excluded.kind,
            point = excluded.point, official_source_url = excluded.official_source_url, updated_at = now()
        `, [properties.mapObjectId, properties.name, aliases, properties.center[0], properties.center[1], properties.officialMapUrl]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    console.log(`Synced ${buildings.features.length} trusted UW campus places.`);
  } catch {
    console.error("Could not sync the checked-in campus place catalog to the configured database.");
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
