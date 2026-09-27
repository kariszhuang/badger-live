import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

type CampusMapData = {
  features?: Array<{
    properties?: { mapObjectId?: string; name?: string; center?: unknown };
  }>;
};

export type VerifiedSafetyLocation = {
  buildingId: string;
  buildingName: string;
  coordinates: [number, number];
};

let locations: Promise<Map<string, VerifiedSafetyLocation>> | undefined;

async function readLocations() {
  const raw = await readFile(join(process.cwd(), "public", "data", "uw-campus-buildings.geojson"), "utf8");
  const data = JSON.parse(raw) as CampusMapData;
  const indexed = new Map<string, VerifiedSafetyLocation>();

  for (const feature of data.features || []) {
    const properties = feature.properties;
    const center = properties?.center;
    if (!properties?.mapObjectId || !properties.name || !Array.isArray(center) || center.length < 2) continue;
    const [longitude, latitude] = center;
    if (typeof longitude !== "number" || typeof latitude !== "number" || !Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    indexed.set(properties.mapObjectId, {
      buildingId: properties.mapObjectId,
      buildingName: properties.name,
      coordinates: [longitude, latitude],
    });
  }

  return indexed;
}
export async function getVerifiedSafetyLocation(buildingId: string) {
  locations ??= readLocations().catch((error: unknown) => {
    locations = undefined;
    throw error;
  });
  return (await locations).get(buildingId) || null;
}
