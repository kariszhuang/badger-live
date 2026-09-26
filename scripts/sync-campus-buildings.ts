import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const pair = z.array(z.number().finite()).min(2);
const ring = z.array(pair).min(4);
const polygon = z.array(ring).min(1);
const multiPolygon = z.array(polygon).min(1);
const geometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Point"), coordinates: pair }),
  z.object({ type: z.literal("Polygon"), coordinates: polygon }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: multiPolygon }),
]);
const rawBuildingSchema = z.object({
  map_object_id: z.union([z.string(), z.number().int()]),
  name: z.string().trim().min(1),
  object_type: z.enum(["building", "building_partial"]),
  building_number: z.string().nullish(),
  street_address: z.string().nullish(),
  description: z.string().nullish(),
  hours: z.string().nullish(),
  geojson: geometrySchema,
  lnglat: pair.nullish(),
}).passthrough();

const CAMPUS_BOUNDS = { west: -89.455, south: 43.045, east: -89.375, north: 43.095 };
const endpoint = "https://www.map.wisc.edu/api/v1/map_objects.geojson";
const outputPath = resolve("public/data/uw-campus-buildings.geojson");

function plainText(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function centerOf(geometry: z.infer<typeof geometrySchema>, fallback?: number[]): [number, number] {
  if (fallback && Number.isFinite(fallback[0]) && Number.isFinite(fallback[1])) return [fallback[0], fallback[1]];
  const positions: number[][] = [];
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      positions.push(value as number[]);
      return;
    }
    value.forEach(visit);
  };
  visit(geometry.coordinates);
  if (!positions.length) throw new Error("Building geometry had no coordinates");
  return [
    positions.reduce((sum, position) => sum + position[0], 0) / positions.length,
    positions.reduce((sum, position) => sum + position[1], 0) / positions.length,
  ];
}

const response = await fetch(endpoint, {
  headers: { Accept: "application/json", "User-Agent": "BadgerLive/1.0 (independent student project)" },
  signal: AbortSignal.timeout(20_000),
});
if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
  throw new Error(`UW campus map returned HTTP ${response.status}`);
}
const raw: unknown = await response.json();
if (!Array.isArray(raw)) throw new Error("UW campus map response was not an array");

const features = raw.flatMap((entry: unknown) => {
  const parsed = rawBuildingSchema.safeParse(entry);
  if (!parsed.success) return [];
  const building = parsed.data;
  const [longitude, latitude] = centerOf(building.geojson, building.lnglat ?? undefined);
  if (longitude < CAMPUS_BOUNDS.west || longitude > CAMPUS_BOUNDS.east || latitude < CAMPUS_BOUNDS.south || latitude > CAMPUS_BOUNDS.north) return [];
  return [{
    type: "Feature" as const,
    id: String(building.map_object_id),
    geometry: building.geojson,
    properties: {
      mapObjectId: String(building.map_object_id),
      name: plainText(building.name) || `UW campus building ${building.map_object_id}`,
      buildingNumber: plainText(building.building_number),
      streetAddress: plainText(building.street_address),
      description: plainText(building.description),
      hours: plainText(building.hours),
      center: [longitude, latitude],
      footprintStatus: building.object_type === "building_partial" ? "partial" : building.geojson.type === "Point" ? "complex" : "full",
      officialMapUrl: building.building_number?.trim()
        ? `https://map.wisc.edu/?initObj=${encodeURIComponent(building.building_number.trim())}`
        : "https://map.wisc.edu/",
    },
  }];
});

const full = features.filter((feature) => feature.properties.footprintStatus === "full").length;
const partial = features.filter((feature) => feature.properties.footprintStatus === "partial").length;
const complexes = features.filter((feature) => feature.properties.footprintStatus === "complex").length;
if (features.length < 200 || partial < 1 || complexes < 1) {
  throw new Error(`Unexpected UW campus data: ${full} footprints, ${partial} partial, ${complexes} point complexes; refusing to replace snapshot`);
}

const collection = {
  type: "FeatureCollection",
  source: endpoint,
  capturedAt: new Date().toISOString(),
  features,
};
await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(collection)}\n`, "utf8");
await rename(temporaryPath, outputPath);
console.log(`Saved ${features.length} official UW campus map objects (${full} footprints, ${partial} partial, ${complexes} point complexes).`);
