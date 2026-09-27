import { readFile } from "node:fs/promises";
import postgres from "postgres";
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

  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10, prepare: false });
  try {
    await sql.begin(async (tx) => {
      for (const { properties } of buildings.features) {
        const aliases = (aliasesById.get(properties.mapObjectId) || [])
          .filter((alias) => aliasCandidates.get(alias.toLocaleLowerCase()) === 1);
        await tx`
          insert into public.campus_places(source_place_id, name, aliases, kind, point, official_source_url, updated_at)
          values (
            ${properties.mapObjectId}, ${properties.name}, ${tx.array(aliases)}, 'building',
            extensions.st_setsrid(extensions.st_makepoint(${properties.center[0]}, ${properties.center[1]}), 4326)::extensions.geography,
            ${properties.officialMapUrl}, now()
          )
          on conflict (source_place_id) do update set
            name = excluded.name, aliases = excluded.aliases, kind = excluded.kind,
            point = excluded.point, official_source_url = excluded.official_source_url, updated_at = now()
        `;
      }
    });
    console.log(`Synced ${buildings.features.length} trusted UW campus places.`);
  } catch {
    console.error("Could not sync the checked-in campus place catalog to the configured database.");
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}
