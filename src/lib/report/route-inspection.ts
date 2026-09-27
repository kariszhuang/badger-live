import type { HazardReport } from "./types";
import { CAMPUS_MAP_BOUNDS } from "@/lib/campus-map-bounds";

type Coordinate = [longitude: number, latitude: number];

function project(point: Coordinate, latitudeOrigin: number): [number, number] {
  const radians = Math.PI / 180;
  return [point[0] * radians * 6_371_000 * Math.cos(latitudeOrigin * radians), point[1] * radians * 6_371_000];
}

export function distanceToRouteMeters(point: Coordinate, route: Coordinate[]): number {
  const latitudeOrigin = point[1];
  const target = project(point, latitudeOrigin);
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < route.length - 1; index += 1) {
    const start = project(route[index], latitudeOrigin);
    const end = project(route[index + 1], latitudeOrigin);
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lengthSquared = dx * dx + dy * dy;
    const projection = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((target[0] - start[0]) * dx + (target[1] - start[1]) * dy) / lengthSquared));
    nearest = Math.min(nearest, Math.hypot(target[0] - (start[0] + projection * dx), target[1] - (start[1] + projection * dy)));
  }
  return nearest;
}

export function routeLengthMeters(route: Coordinate[]): number {
  return route.slice(1).reduce((total, point, index) => {
    const previous = route[index];
    const latitudeOrigin = (previous[1] + point[1]) / 2;
    const start = project(previous, latitudeOrigin);
    const end = project(point, latitudeOrigin);
    return total + Math.hypot(end[0] - start[0], end[1] - start[1]);
  }, 0);
}

export function routeBounds(route: Coordinate[]): [west: number, south: number, east: number, north: number] | null {
  if (!route.length) return null;
  const [[campusWest, campusSouth], [campusEast, campusNorth]] = CAMPUS_MAP_BOUNDS;
  const west = Math.max(campusWest, Math.min(...route.map(([longitude]) => longitude)) - 0.002);
  const south = Math.max(campusSouth, Math.min(...route.map(([, latitude]) => latitude)) - 0.002);
  const east = Math.min(campusEast, Math.max(...route.map(([longitude]) => longitude)) + 0.002);
  const north = Math.min(campusNorth, Math.max(...route.map(([, latitude]) => latitude)) + 0.002);
  return west < east && south < north ? [west, south, east, north] : null;
}

export function inspectRouteAgainstHazards(route: Coordinate[], reports: HazardReport[], thresholdMeters = 20) {
  return reports
    .filter((report) => report.lifecycle !== "possibly_cleared" && report.expiresAt > new Date().toISOString())
    .map((report) => ({ report, distanceM: Math.round(distanceToRouteMeters(report.coordinates, route)) }))
    .filter(({ distanceM }) => distanceM <= thresholdMeters)
    .sort((left, right) => left.distanceM - right.distanceM)
    .map(({ report, distanceM }) => ({
      reportId: report.id,
      kind: report.kind,
      title: report.title,
      lifecycle: report.lifecycle,
      observationLabel: "unverified" as const,
      observationCount: report.observationCount,
      lastObservedAt: report.lastObservedAt,
      distanceM,
    }));
}
