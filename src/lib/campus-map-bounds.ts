export const CAMPUS_MAP_BOUNDS: [[number, number], [number, number]] = [
  [-89.455, 43.045],
  [-89.375, 43.095],
];

export function isWithinCampusMapBounds([longitude, latitude]: [number, number]): boolean {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false;
  const [[west, south], [east, north]] = CAMPUS_MAP_BOUNDS;
  return longitude >= west && longitude <= east && latitude >= south && latitude <= north;
}
