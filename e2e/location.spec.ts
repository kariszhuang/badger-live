import { expect, test } from "@playwright/test";

type LocationHarness = Window & {
  __badgerGeoRequests?: Array<{
    success: (position: GeolocationPosition) => void;
    error: PositionErrorCallback | null;
    options: PositionOptions;
  }>;
};

async function installGeolocationHarness(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const state = window as LocationHarness;
    state.__badgerGeoRequests = [];
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success: PositionCallback, error: PositionErrorCallback | null, options: PositionOptions = {}) {
          state.__badgerGeoRequests!.push({ success, error, options: { ...options } });
        },
      },
    });
  });
}

async function resolveLocation(page: import("@playwright/test").Page, index: number, longitude: number, latitude: number) {
  await page.evaluate(({ index, longitude, latitude }) => {
    const state = window as LocationHarness;
    state.__badgerGeoRequests?.[index]?.success({
      coords: { longitude, latitude, accuracy: 18, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
      timestamp: Date.now(),
    } as GeolocationPosition);
  }, { index, longitude, latitude });
}

test("locate announces a successful fix and requests a fresh position on each tap", async ({ page }) => {
  await installGeolocationHarness(page);
  await page.goto("/?date=2026-09-26");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();

  const locate = page.getByRole("button", { name: "Locate me" });
  await locate.click();
  await expect(page.getByRole("status").filter({ hasText: /finding your location/i })).toBeVisible();
  await resolveLocation(page, 0, -89.405, 43.075);

  await expect(page.locator(".user-location-marker")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /location found/i })).toBeVisible();
  await page.getByRole("button", { name: "Dismiss location message" }).click();
  await expect(page.locator(".map-notice")).toHaveCount(0);
});

test("keeps the last known location visible while requesting a fresh fix", async ({ page }) => {
  await installGeolocationHarness(page);
  await page.goto("/?date=2026-09-26");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();

  const locate = page.getByRole("button", { name: "Locate me" });
  await locate.click();
  await resolveLocation(page, 0, -89.405, 43.075);
  const userMarker = page.locator(".user-location-marker");
  await expect(userMarker).toBeVisible();

  await locate.click();
  await expect(userMarker).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /updating location/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as LocationHarness).__badgerGeoRequests?.length ?? 0)).toBe(2);
});

test("a location failure is actionable and a later tap can recover", async ({ page }) => {
  await installGeolocationHarness(page);
  await page.goto("/?date=2026-09-26");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();

  const locate = page.getByRole("button", { name: "Locate me" });
  await locate.click();
  await page.evaluate(() => {
    const state = window as LocationHarness;
    state.__badgerGeoRequests?.[0]?.error?.({ code: 1, message: "Permission denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
  });
  await expect(page.getByRole("alert").filter({ hasText: /location access is off/i })).toBeVisible();
  await expect(locate).toBeEnabled();

  await locate.click();
  await expect.poll(() => page.evaluate(() => (window as LocationHarness).__badgerGeoRequests?.length ?? 0)).toBe(2);
  await resolveLocation(page, 1, -89.404, 43.076);
  await expect(page.locator(".user-location-marker")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /location found/i })).toBeVisible();
});

test("slow GPS falls back once to a quicker approximate fix", async ({ page }) => {
  await installGeolocationHarness(page);
  await page.goto("/?date=2026-09-26");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();

  await page.getByRole("button", { name: "Locate me" }).click();
  await page.evaluate(() => {
    const state = window as LocationHarness;
    state.__badgerGeoRequests?.[0]?.error?.({ code: 3, message: "Timed out", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
  });
  await expect(page.getByRole("status").filter({ hasText: /still looking for your location/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as LocationHarness).__badgerGeoRequests?.length ?? 0), { timeout: 10_000 }).toBe(2);
  const requestOptions = await page.evaluate(() => (window as LocationHarness).__badgerGeoRequests?.map(({ options }) => options));
  expect(requestOptions?.[0]).toMatchObject({ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
  expect(requestOptions?.[1]).toMatchObject({ enableHighAccuracy: false, timeout: 10000, maximumAge: 15000 });

  await resolveLocation(page, 1, -89.405, 43.075);
  await expect(page.getByRole("status").filter({ hasText: /location found/i })).toBeVisible();
});

test("location errors stay in a compact mobile notice", async ({ page }) => {
  await installGeolocationHarness(page);
  await page.goto("/?date=2026-09-26");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();

  await page.getByRole("button", { name: "Locate me" }).click();
  const failWithTimeout = async (index: number) => page.evaluate((requestIndex) => {
    const state = window as LocationHarness;
    state.__badgerGeoRequests?.[requestIndex]?.error?.({
      code: 3,
      message: "Timed out",
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    } as GeolocationPositionError);
  }, index);

  await failWithTimeout(0);
  await expect.poll(() => page.evaluate(() => (window as LocationHarness).__badgerGeoRequests?.length ?? 0), { timeout: 10_000 }).toBe(2);
  await failWithTimeout(1);
  await expect(page.getByRole("alert").filter({ hasText: /couldn't get your location/i })).toBeVisible();

  if ((page.viewportSize()?.width ?? 0) <= 767) {
    const notice = await page.locator(".map-notice").boundingBox();
    expect(notice).not.toBeNull();
    expect(notice!.width).toBeLessThan(page.viewportSize()!.width);
    expect(notice!.height).toBeLessThan(160);
  }
});

test("explains when the device is outside the campus map bounds", async ({ page }) => {
  await installGeolocationHarness(page);
  await page.goto("/?date=2026-09-26");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();

  await page.getByRole("button", { name: "Locate me" }).click();
  await resolveLocation(page, 0, -89.46, 43.08);

  await expect(page.locator(".user-location-marker")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: /outside the campus map/i })).toBeVisible();
});

test("explains that browsers block location on insecure LAN addresses", async ({ page }) => {
  await installGeolocationHarness(page);
  await page.addInitScript(() => Object.defineProperty(window, "isSecureContext", { configurable: true, value: false }));
  await page.goto("/?date=2026-09-26");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();

  await page.getByRole("button", { name: "Locate me" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /location needs HTTPS/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as LocationHarness).__badgerGeoRequests?.length ?? 0)).toBe(0);

  if ((page.viewportSize()?.width ?? 0) <= 767) {
    const notice = await page.locator(".map-notice").boundingBox();
    const filters = await page.locator(".filter-row").boundingBox();
    expect(notice).not.toBeNull();
    expect(filters).not.toBeNull();
    expect(notice!.y).toBeGreaterThanOrEqual(filters!.y + filters!.height);
  }
});
