import { isWithinCampusMapBounds } from "@/lib/campus-map-bounds";

export type WalkingDirections = {
  coordinates: Array<[longitude: number, latitude: number]>;
  distanceM: number;
  durationS: number;
};

export class WalkingDirectionsError extends Error {
  constructor(readonly code: "not-configured" | "upstream" | "invalid-response") {
    super(code);
  }
}

export function parseWalkingDirections(value: unknown): WalkingDirections {
  if (!value || typeof value !== "object") throw new WalkingDirectionsError("invalid-response");
  const features = (value as { features?: unknown }).features;
  if (!Array.isArray(features) || !features.length) throw new WalkingDirectionsError("invalid-response");
  const feature = features[0] as { geometry?: { type?: unknown; coordinates?: unknown }; properties?: { summary?: { distance?: unknown; duration?: unknown } } };
  const rawCoordinates = feature?.geometry?.coordinates;
  const summary = feature?.properties?.summary;
  if (feature?.geometry?.type !== "LineString" || !Array.isArray(rawCoordinates) || rawCoordinates.length < 2 || rawCoordinates.length > 5000
    || typeof summary?.distance !== "number" || !Number.isFinite(summary.distance)
    || typeof summary?.duration !== "number" || !Number.isFinite(summary.duration)) {
    throw new WalkingDirectionsError("invalid-response");
  }

  const coordinates: WalkingDirections["coordinates"] = [];
  for (const coordinate of rawCoordinates) {
    if (!Array.isArray(coordinate) || coordinate.length < 2
      || typeof coordinate[0] !== "number" || !Number.isFinite(coordinate[0])
      || typeof coordinate[1] !== "number" || !Number.isFinite(coordinate[1])) {
      throw new WalkingDirectionsError("invalid-response");
    }
    const point: [number, number] = [coordinate[0], coordinate[1]];
    if (!isWithinCampusMapBounds(point)) throw new WalkingDirectionsError("invalid-response");
    coordinates.push(point);
  }
  const distanceM = summary.distance;
  const durationS = summary.duration;
  if (distanceM <= 0 || distanceM > 10_000 || durationS <= 0 || durationS > 24 * 60 * 60) {
    throw new WalkingDirectionsError("invalid-response");
  }
  return { coordinates, distanceM: Math.round(distanceM), durationS: Math.round(durationS) };
}
