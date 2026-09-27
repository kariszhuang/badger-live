import { z } from "zod";
import { campusBuildingDescriptions } from "./campus-building-descriptions";
import { campusBuildingTags } from "./campus-building-tags";

const positionSchema = z.array(z.number().finite()).min(2);
const ringSchema = z.array(positionSchema).min(4);
const polygonSchema = z.array(ringSchema).min(1);
const multiPolygonSchema = z.array(polygonSchema).min(1);
const campusPhotoUrlSchema = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "mapcdn.wisc.cloud" && url.pathname.startsWith("/rails/active_storage/blobs/proxy/");
}, "Expected an official UW campus-map photo URL");

export const campusGeometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Point"), coordinates: positionSchema }),
  z.object({ type: z.literal("Polygon"), coordinates: polygonSchema }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: multiPolygonSchema }),
]);

export const campusBuildingPropertiesSchema = z.object({
  mapObjectId: z.string(),
  name: z.string().min(1),
  shortDescription: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)),
  buildingNumber: z.string().nullish(),
  streetAddress: z.string().nullish(),
  description: z.string().nullish(),
  hours: z.string().nullish(),
  photoUrl: campusPhotoUrlSchema.nullish(),
  center: z.tuple([z.number(), z.number()]),
  footprintStatus: z.enum(["full", "partial", "complex"]),
  officialMapUrl: z.string().url(),
});

export const campusBuildingFeatureSchema = z.object({
  type: z.literal("Feature"),
  id: z.string(),
  geometry: campusGeometrySchema,
  properties: campusBuildingPropertiesSchema,
});

export const campusBuildingsSchema = z.object({
  type: z.literal("FeatureCollection"),
  source: z.string().url(),
  capturedAt: z.string().datetime(),
  features: z.array(campusBuildingFeatureSchema),
});

const campusBuildingsInputSchema = z.object({
  type: z.literal("FeatureCollection"),
  source: z.string().url(),
  capturedAt: z.string().datetime(),
  features: z.array(campusBuildingFeatureSchema.extend({
    properties: campusBuildingPropertiesSchema.extend({
      shortDescription: z.string().trim().min(1).optional(),
      tags: z.array(z.string().trim().min(1)).optional(),
    }),
  })),
});

export type CampusBuilding = z.infer<typeof campusBuildingPropertiesSchema>;
export type CampusBuildingFeature = z.infer<typeof campusBuildingFeatureSchema>;
export type CampusBuildings = z.infer<typeof campusBuildingsSchema>;

export function parseCampusBuildings(input: unknown): CampusBuildings {
  const parsed = campusBuildingsInputSchema.parse(input);
  const enriched = {
    ...parsed,
    features: parsed.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        shortDescription: feature.properties.shortDescription ?? campusBuildingDescriptions[feature.properties.mapObjectId],
        tags: campusBuildingTags(
          feature.properties.shortDescription ?? campusBuildingDescriptions[feature.properties.mapObjectId] ?? "",
          feature.properties.mapObjectId,
        ),
      },
    })),
  };
  return campusBuildingsSchema.parse(enriched);
}

export function findCampusBuildingAt(collection: CampusBuildings | null, coordinates: [number, number]) {
  if (!collection) return undefined;
  return collection.features.find(({ geometry }) => {
    if (geometry.type === "Polygon") return pointInPolygon(geometry.coordinates, coordinates);
    if (geometry.type === "MultiPolygon") return geometry.coordinates.some((polygon) => pointInPolygon(polygon, coordinates));
    return false;
  });
}

export function describeCampusMapPoint(collection: CampusBuildings | null, coordinates: [number, number]) {
  if (!collection?.features.length) return "Selected map point · approximate";
  const containing = findCampusBuildingAt(collection, coordinates);
  if (containing) return `Near ${containing.properties.name}`;

  const nearest = collection.features.map((feature) => ({
    feature,
    distance: distanceMeters(coordinates, feature.properties.center),
  })).sort((left, right) => left.distance - right.distance)[0];
  if (!nearest) return "Selected map point · approximate";
  if (nearest.distance <= 120) return `Near ${nearest.feature.properties.name}`;
  const street = streetName(nearest.feature.properties.streetAddress || "");
  return street ? `Near ${street}` : "Selected map point · approximate";
}

function streetName(address: string) {
  const match = address.match(/\b(?:N|S|E|W|North|South|East|West)?\s*[\p{L}.'’-]+(?:\s+[\p{L}.'’-]+){0,3}\s+(?:Street|St\.?|Avenue|Ave\.?|Drive|Dr\.?|Road|Rd\.?|Boulevard|Blvd\.?|Mall|Way|Lane|Ln\.?|Place|Pl\.?|Circle|Cir\.?)\b/iu);
  return match?.[0]?.replace(/\s+/g, " ").trim() || "";
}

function distanceMeters(left: [number, number], right: [number, number]) {
  const radians = (value: number) => value * Math.PI / 180;
  const deltaLatitude = radians(right[1] - left[1]);
  const deltaLongitude = radians(right[0] - left[0]);
  const a = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(radians(left[1])) * Math.cos(radians(right[1])) * Math.sin(deltaLongitude / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointInPolygon(rings: number[][][], [longitude, latitude]: [number, number]) {
  const [outer, ...holes] = rings;
  return Boolean(outer && pointInRing(outer, longitude, latitude) && !holes.some((ring) => pointInRing(ring, longitude, latitude)));
}

function pointInRing(ring: number[][], longitude: number, latitude: number) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const [currentLongitude, currentLatitude] = ring[current];
    const [previousLongitude, previousLatitude] = ring[previous];
    const cross = (longitude - previousLongitude) * (currentLatitude - previousLatitude) - (latitude - previousLatitude) * (currentLongitude - previousLongitude);
    const dot = (longitude - previousLongitude) * (longitude - currentLongitude) + (latitude - previousLatitude) * (latitude - currentLatitude);
    if (Math.abs(cross) < 1e-12 && dot <= 0) return true;
    if ((currentLatitude > latitude) !== (previousLatitude > latitude) && longitude < (previousLongitude - currentLongitude) * (latitude - currentLatitude) / (previousLatitude - currentLatitude) + currentLongitude) inside = !inside;
  }
  return inside;
}
