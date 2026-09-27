export type ScreenPoint = { x: number; y: number };
export type ScreenRect = { left: number; top: number; right: number; bottom: number };

export function hasVisibleMapPoint(points: ScreenPoint[], viewport: ScreenRect, markerClearance = 24): boolean {
  const left = viewport.left + markerClearance;
  const top = viewport.top + markerClearance;
  const right = viewport.right - markerClearance;
  const bottom = viewport.bottom - markerClearance;
  return points.some(({ x, y }) => x >= left && x <= right && y >= top && y <= bottom);
}
