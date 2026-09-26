import { z } from "zod";

const positionSchema = z.array(z.number().finite()).min(2);
const ringSchema = z.array(positionSchema).min(4);
const polygonSchema = z.array(ringSchema).min(1);
const multiPolygonSchema = z.array(polygonSchema).min(1);

export const campusGeometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Point"), coordinates: positionSchema }),
  z.object({ type: z.literal("Polygon"), coordinates: polygonSchema }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: multiPolygonSchema }),
]);

export const campusBuildingPropertiesSchema = z.object({
  mapObjectId: z.string(),
  name: z.string().min(1),
  buildingNumber: z.string().nullish(),
  streetAddress: z.string().nullish(),
  description: z.string().nullish(),
  hours: z.string().nullish(),
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

export type CampusBuilding = z.infer<typeof campusBuildingPropertiesSchema>;
export type CampusBuildingFeature = z.infer<typeof campusBuildingFeatureSchema>;
export type CampusBuildings = z.infer<typeof campusBuildingsSchema>;

export function parseCampusBuildings(input: unknown): CampusBuildings {
  return campusBuildingsSchema.parse(input);
}
