import { describe, expect, it } from "vitest";
import { hasVisibleMapPoint, type ScreenPoint, type ScreenRect } from "./map-visibility";

const visible: ScreenRect = { left: 0, top: 120, right: 390, bottom: 650 };

describe("filtered map point visibility", () => {
  it("does not move the map when a filtered location is already visible", () => {
    const points: ScreenPoint[] = [{ x: 180, y: 360 }, { x: 340, y: 600 }];
    expect(hasVisibleMapPoint(points, visible)).toBe(true);
  });

  it("requests a reframe when every filtered location is off screen or covered", () => {
    const points: ScreenPoint[] = [{ x: -45, y: 300 }, { x: 200, y: 700 }, { x: 200, y: 80 }];
    expect(hasVisibleMapPoint(points, visible)).toBe(false);
  });

  it("keeps marker clearance inside the usable map area", () => {
    expect(hasVisibleMapPoint([{ x: 12, y: 360 }], visible, 24)).toBe(false);
    expect(hasVisibleMapPoint([{ x: 28, y: 360 }], visible, 24)).toBe(true);
  });
});
