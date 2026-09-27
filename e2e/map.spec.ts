import { expect, test } from "@playwright/test";

async function clickMapPoint(page: import("@playwright/test").Page, coordinates: [number, number], center: [number, number] = [-89.405, 43.075], zoom = 14.25) {
  const canvas = await page.locator(".maplibregl-canvas").boundingBox();
  expect(canvas).not.toBeNull();
  const scale = 512 * 2 ** zoom;
  const mercatorY = (latitude: number) => (1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) / 2 * scale;
  const project = ([longitude, latitude]: [number, number]) => ({ x: (longitude + 180) / 360 * scale, y: mercatorY(latitude) });
  const point = project(coordinates);
  const origin = project(center);
  await page.mouse.click(canvas!.x + canvas!.width / 2 + point.x - origin.x, canvas!.y + canvas!.height / 2 + point.y - origin.y);
}

test("official blotter mode groups exact campus places and keeps generic residence locations off-map", async ({ page }, testInfo) => {
  const fixture = {
    fetchedAt: "2026-09-26T17:00:00.000Z",
    windowDays: 30,
    windowStart: "2026-08-28",
    windowEnd: "2026-09-26",
    latestArticleDate: "2026-09-24",
    partial: false,
    incidents: [
      { id: "2026-09-20:2", incidentDate: "2026-09-19", occurredAt: "2026-09-19T17:43:00.000Z", timeLabel: "12:43 pm", incidentType: "Theft/Larceny", category: "theft", locationLabel: "Nicholas Recreation Center", buildingId: "0564", buildingName: "Nicholas Recreation Center", coordinates: [-89.4045, 43.071], summary: "A theft or larceny report was logged.", source: "uwpd-official", sourceUrl: "https://uwpd.wisc.edu/daily-blotter/2026-09-20/" },
      { id: "2026-09-20:1", incidentDate: "2026-09-19", occurredAt: "2026-09-19T16:11:00.000Z", timeLabel: "11:11 am", incidentType: "Fraud", category: "fraud", locationLabel: "Residence Hall", buildingId: null, buildingName: null, coordinates: null, summary: "Personal details omitted.", source: "uwpd-official", sourceUrl: "https://uwpd.wisc.edu/daily-blotter/2026-09-20/" },
      { id: "2026-09-20:3", incidentDate: "2026-09-19", occurredAt: "2026-09-19T19:00:00.000Z", timeLabel: "2:00 pm", incidentType: "Fraud", category: "fraud", locationLabel: "Nicholas Recreation Center", buildingId: "0564", buildingName: "Nicholas Recreation Center", coordinates: [-89.4045, 43.071], summary: "Personal details omitted.", source: "uwpd-official", sourceUrl: "https://uwpd.wisc.edu/daily-blotter/2026-09-20/" },
    ],
  };
  await page.route("**/api/safety/crimes?days=*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) }));
  await page.goto("/?date=2026-09-26&mode=crime");

  await expect(page.getByRole("button", { name: "Theft / larceny" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fraud", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Property damage" })).toHaveCount(0);
  await expect(page.locator(".crime-map-marker-symbol svg").first()).toBeVisible();

  const marker = page.getByRole("button", { name: /2 official police blotter entries at Nicholas Recreation Center/i });
  await expect(marker).toBeVisible();
  await expect(page.locator(".crime-filter-theft .thief-icon[data-icon='theft']")).toBeVisible();
  if (testInfo.project.name === "mobile") {
    await expect(page.locator(".mobile-sheet")).toHaveClass(/sheet-closed/);
    const count = marker.locator(".crime-map-marker-count");
    await expect(count).toBeVisible();
    await expect(count).toHaveCSS("position", "absolute");
    await expect.poll(async () => {
      const markerBox = await marker.locator(".crime-map-marker").boundingBox();
      const countBox = await count.boundingBox();
      return markerBox && countBox ? Math.abs(countBox.x + countBox.width / 2 - markerBox.x - markerBox.width / 2) : 99;
    }).toBeLessThan(1);
    await page.getByRole("button", { name: "Show 3 reports" }).click();
    await expect(page.locator(".crime-sheet-location").filter({ hasText: "Residence Hall" })).toBeVisible();
    await page.getByRole("button", { name: "Close report list" }).click();
    await expect(page.locator(".mobile-sheet")).toHaveClass(/sheet-closed/);
  }
  else await expect(page.locator(".crime-unmapped-location").filter({ hasText: "Residence Hall" })).toBeVisible();
  await expect(page.getByText("Underage Alcohol Violation", { exact: true })).toHaveCount(0);
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Show 3 reports" }).click();
  await expect(page.getByRole("link", { name: "Read original entry" }).first()).toHaveAttribute("href", "https://uwpd.wisc.edu/daily-blotter/2026-09-20/");
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Close report list" }).click();
  await marker.click();
  const surface = testInfo.project.name === "mobile" ? page.locator(".mobile-sheet") : page.locator(".discovery-panel");
  if (testInfo.project.name === "mobile") {
    await expect(surface.locator(".crime-sheet-topline")).toContainText("2 separate entries");
    await expect.poll(async () => {
      const markerBox = await marker.boundingBox();
      const sheetBox = await surface.boundingBox();
      const toolbarBox = await page.locator(".discovery-header").boundingBox();
      if (!markerBox || !sheetBox || !toolbarBox) return false;
      const markerCenter = markerBox.y + markerBox.height / 2;
      const mapCenter = (toolbarBox.y + toolbarBox.height + sheetBox.y) / 2;
      return Math.abs(markerCenter - mapCenter) < 48 && markerBox.y + markerBox.height < sheetBox.y;
    }).toBe(true);
  }
  else await expect(surface.locator(".crime-venue-banner")).toContainText("2 separate blotter entries");
  await expect(surface.getByText("Theft/Larceny", { exact: true })).toBeVisible();
  await expect(surface.getByText("Fraud", { exact: true }).first()).toBeVisible();
  await expect(surface).toContainText(/not live alerts or findings of guilt|not a live alert feed or findings of guilt/i);
  await expect(page).toHaveURL(/mode=crime/);
});

test("mobile location sheet sizes to its content and keeps the selected marker visible", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  const fixture = {
    fetchedAt: "2026-09-26T17:00:00.000Z",
    windowDays: 14,
    windowStart: "2026-09-13",
    windowEnd: "2026-09-26",
    latestArticleDate: "2026-09-24",
    partial: false,
    incidents: [
      { id: "single:1", incidentDate: "2026-09-24", occurredAt: "2026-09-24T17:00:00.000Z", timeLabel: "12:00 pm", incidentType: "Theft/Larceny", category: "theft", locationLabel: "Nicholas Recreation Center", buildingId: "0564", buildingName: "Nicholas Recreation Center", coordinates: [-89.4045, 43.071], summary: "A theft or larceny report was logged.", source: "uwpd-official", sourceUrl: "https://uwpd.wisc.edu/daily-blotter/2026-09-24/" },
    ],
  };
  await page.route("**/api/safety/crimes?days=*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) }));
  await page.goto("/?date=2026-09-26&mode=crime");

  const marker = page.getByRole("button", { name: /1 official police blotter entry at Nicholas Recreation Center/i });
  const sheet = page.locator(".mobile-sheet");
  await expect(marker).toBeVisible();
  await expect(sheet).toHaveClass(/sheet-closed/);
  await marker.click();
  await expect(sheet).toHaveClass(/sheet-half/);
  await expect.poll(async () => sheet.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(0.56 * 844);
  await expect.poll(async () => {
    const markerBox = await marker.boundingBox();
    const sheetBox = await sheet.boundingBox();
    const toolbarBox = await page.locator(".discovery-header").boundingBox();
    if (!markerBox || !sheetBox || !toolbarBox) return 999;
    const markerCenter = markerBox.y + markerBox.height / 2;
    const mapCenter = (toolbarBox.y + toolbarBox.height + sheetBox.y) / 2;
    return Math.max(Math.abs(markerCenter - mapCenter), Math.max(0, markerBox.y + markerBox.height - sheetBox.y));
  }).toBeLessThan(48);
});

test("real calendar, filters, source and date navigation", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?date=2026-09-26");
  if (testInfo.project.name === "desktop") {
    await expect(page.getByRole("group", { name: "Choose map mode" })).toBeVisible();
    await expect(page.getByText(/20 events · 14 on map · 6 without map locations/)).toBeVisible();
  }
  const list = testInfo.project.name === "mobile" ? page.locator(".mobile-sheet") : page.locator(".discovery-panel");
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Show 20 events" }).click();
  await expect(list.getByText("Bioblitz at the Lakeshore Nature Preserve")).toBeVisible();
  await page.getByRole("button", { name: "Music", exact: true }).click();
  await expect(page.getByRole("button", { name: "Music", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page).toHaveURL(/date=2026-09-27/);
  await expect(page.locator(".count-line")).toContainText("10 events");
  expect(errors).toEqual([]);
});

test("map and official event detail", async ({ page }, testInfo) => {
  let vectorTiles = 0;
  const errors: string[] = [];
  page.on("response", (response) => { if (new URL(response.url()).pathname.endsWith(".pbf") && response.status() === 200) vectorTiles++; });
  page.on("console", (message) => { if (message.type() === "error" && message.text().includes("Worker failed")) errors.push(message.text()); });
  await page.goto("/?date=2026-09-26");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect.poll(() => vectorTiles, { timeout: 15000 }).toBeGreaterThan(0);
  expect(errors).toEqual([]);
  await expect(page.getByRole("button", { name: /events at Memorial Union/i }).first()).toBeVisible();
  await page.getByRole("button", { name: /events at Memorial Union/i }).first().click();
  if (testInfo.project.name === "mobile") await expect(page.locator(".mobile-sheet")).toHaveClass(/sheet-half/);
  else await expect(page.locator(".venue-banner")).toContainText("Memorial Union");
  const card = (testInfo.project.name === "mobile" ? page.locator(".mobile-sheet") : page.locator(".discovery-panel")).locator(".event-card").first();
  await card.locator(".event-card-main").click();
  await expect(card.getByRole("link", { name: /Official event/ })).toHaveAttribute("href", /today\.wisc\.edu\/events\/view\/\d+/);
});

test("search, date picker and geolocation denial remain usable", async ({ page }, testInfo) => {
  await page.goto("/?date=2026-09-26");
  await page.getByPlaceholder("What's happening, Badgers?").fill("roundnet");
  const list = testInfo.project.name === "mobile" ? page.locator(".mobile-sheet") : page.locator(".discovery-panel");
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Show 1 events" }).click();
  await expect(list.getByText("Great Lakes Fall Roundnet Sectional 2026")).toBeVisible();
  await expect(list.getByText("20 things happening")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByLabel("Choose date").fill("2026-09-27");
  await expect(page).toHaveURL(/date=2026-09-27/);
  await expect(page.locator(".count-line")).toContainText("10 events");
  await page.getByRole("button", { name: "Locate me" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Location permission/ })).toBeVisible();
});

test("mobile sheet expands from its accessible handle", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.goto("/?date=2026-09-26");
  await page.getByRole("button", { name: "Show 20 events" }).click();
  await page.getByRole("button", { name: "Expand event list" }).click();
  await expect(page.locator(".mobile-sheet")).toHaveClass(/sheet-full/);
  await page.locator(".mobile-sheet").press("Escape");
  await expect(page.locator(".mobile-sheet")).toHaveClass(/sheet-closed/);
});

test("mobile discovery controls leave the map dominant in events and crime modes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.route("**/api/safety/crimes?days=*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ fetchedAt: "2026-09-26T17:00:00.000Z", windowDays: 30, windowStart: "2026-08-28", windowEnd: "2026-09-26", latestArticleDate: "2026-09-24", partial: false, incidents: [{ id: "mobile:1", incidentDate: "2026-09-24", occurredAt: "2026-09-24T17:00:00.000Z", timeLabel: "12:00 pm", incidentType: "Theft/Larceny", category: "theft", locationLabel: "Memorial Library", buildingId: "0500", buildingName: "Memorial Library", coordinates: [-89.4004, 43.0757], summary: "A theft or larceny report was logged.", source: "uwpd-official", sourceUrl: "https://uwpd.wisc.edu/daily-blotter/2026-09-24/" }] }),
  }));
  await page.goto("/?date=2026-09-26");

  const visibleMapGap = async () => page.evaluate(() => {
    const toolbar = document.querySelector(".discovery-header")?.getBoundingClientRect();
    const sheet = document.querySelector(".mobile-sheet")?.getBoundingClientRect();
    const map = document.querySelector(".maplibregl-canvas")?.getBoundingClientRect();
    if (!toolbar || !sheet || !map) return 0;
    return Math.min(sheet.top, map.bottom) - toolbar.bottom;
  });
  await expect.poll(visibleMapGap).toBeGreaterThan(400);
  await expect(page.getByRole("button", { name: /Explore campus buildings/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Crime" }).click();
  await expect(page.getByRole("button", { name: "Theft / larceny" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fraud" })).toHaveCount(0);
  await expect.poll(visibleMapGap).toBeGreaterThan(400);
});

test("tapping a venue does not move unrelated map markers", async ({ page }) => {
  await page.goto("/?date=2026-09-26");
  const stationary = page.getByRole("button", { name: /event at Medical Sciences Center/i });
  const selected = page.getByRole("button", { name: /events at Memorial Union/i });
  await expect(stationary).toBeVisible();
  const before = await stationary.boundingBox();
  await selected.click();
  await page.waitForTimeout(1100);
  const after = await stationary.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(3);
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(3);
});

test("event markers stay centered on their venue coordinates while zooming", async ({ page }) => {
  let vectorTiles = 0;
  page.on("response", (response) => { if (new URL(response.url()).pathname.endsWith(".pbf") && response.status() === 200) vectorTiles++; });
  await page.goto("/?date=2026-09-26");
  await expect.poll(() => vectorTiles, { timeout: 15000 }).toBeGreaterThan(0);
  const marker = page.getByRole("button", { name: /events at Memorial Union/i }).first();
  await expect(marker).toHaveClass(/maplibregl-marker-anchor-center/);

  const readMarker = () => marker.evaluate((element) => {
    const transform = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return {
      groupId: (element as HTMLButtonElement).dataset.groupId,
      longitude: (element as HTMLButtonElement).dataset.longitude,
      latitude: (element as HTMLButtonElement).dataset.latitude,
      screenX: transform.e,
      screenY: transform.f,
      scaleX: transform.a,
      scaleY: transform.d,
      transform: element.style.transform,
    };
  });

  const canvas = await page.locator(".maplibregl-canvas").boundingBox();
  expect(canvas).not.toBeNull();
  await page.mouse.move(canvas!.x + canvas!.width * 0.6, canvas!.y + canvas!.height * 0.58);
  await page.waitForTimeout(500);
  const original = await readMarker();

  await page.mouse.wheel(0, -500);
  await expect.poll(async () => (await readMarker()).transform, { timeout: 5000 }).not.toBe(original.transform);
  await page.waitForTimeout(500);
  const zoomedIn = await readMarker();
  await page.mouse.wheel(0, 650);
  await expect.poll(async () => (await readMarker()).transform, { timeout: 5000 }).not.toBe(zoomedIn.transform);
  await page.waitForTimeout(500);
  const zoomedOut = await readMarker();

  for (const position of [original, zoomedIn, zoomedOut]) {
    expect(position.groupId).toBe(original.groupId);
    expect(position.longitude).toBe(original.longitude);
    expect(position.latitude).toBe(original.latitude);
    expect(position.scaleX).toBeCloseTo(1, 4);
    expect(position.scaleY).toBeCloseTo(1, 4);
    expect(position.transform).toContain("translate(-50%, -50%)");
  }
  expect(zoomedIn.transform).not.toBe(original.transform);
  expect(zoomedOut.transform).not.toBe(zoomedIn.transform);
});

test("uses basemap labels instead of floating shortcut pills for campus landmarks", async ({ page }) => {
  await page.goto("/?date=2026-09-26");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".landmark-marker")).toHaveCount(0);
});

test("location access shows a private on-map position only after interaction", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 43.075, longitude: -89.405 });
  await page.addInitScript(() => {
    const geolocation = navigator.geolocation;
    const getCurrentPosition = geolocation.getCurrentPosition.bind(geolocation);
    const requests: number[] = [];
    Object.defineProperty(window, "__badgerLocationRequests", { value: requests, configurable: false });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success: PositionCallback, error?: PositionErrorCallback | null, options?: PositionOptions) {
          requests.push(options?.maximumAge ?? -1);
          return getCurrentPosition(success, error, options);
        },
        watchPosition: geolocation.watchPosition.bind(geolocation),
        clearWatch: geolocation.clearWatch.bind(geolocation),
      },
    });
  });
  await page.goto("/?date=2026-09-26");
  await expect(page.getByRole("img", { name: "Your current location" })).toHaveCount(0);
  await page.getByRole("button", { name: "Locate me" }).click();
  await expect(page.getByRole("img", { name: "Your current location" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __badgerLocationRequests: number[] }).__badgerLocationRequests)).toEqual([0]);
  await page.getByRole("button", { name: "Locate me" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __badgerLocationRequests: number[] }).__badgerLocationRequests)).toEqual([0, 0]);
});

test("location explains that a secure connection is required on LAN devices", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
  });
  await page.goto("/?date=2026-09-26");
  await page.getByRole("button", { name: "Locate me" }).click();
  await expect(page.getByRole("status")).toContainText(/HTTPS.*local network/i);
});

test("the angled campus view toggles cleanly back to 2D without landmark pills", async ({ page }) => {
  await page.goto("/?date=2026-09-26");
  const angledView = page.getByRole("button", { name: "Switch to angled 3D view" });
  await angledView.click();
  const flatView = page.getByRole("button", { name: "Switch to 2D view" });
  await expect(flatView).toHaveAttribute("aria-pressed", "true");
  await flatView.click();
  await expect(page.getByRole("button", { name: "Switch to angled 3D view" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".landmark-marker")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back to campus" })).toBeVisible();
});

test("campus safety toolbox prioritizes official help and keeps community reporting private", async ({ page }) => {
  await page.goto("/?date=2026-09-26");
  await page.getByRole("button", { name: "Safety alerts and resources" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Get help. Stay informed." })).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Immediate danger\? Call 911/ })).toHaveAttribute("href", "tel:911");
  await expect(dialog.getByRole("link", { name: "UW Campus Alerts" })).toHaveAttribute("href", "https://alerts.wisc.edu/");
  await expect(dialog.getByRole("link", { name: "Manage WiscAlerts" })).toHaveAttribute("href", "https://go.wisc.edu/wiscalerts");

  await dialog.getByRole("button", { name: /Community reports/ }).click();
  await expect(dialog.getByText("No reviewed community conditions are shared right now.")).toBeVisible();

  await dialog.getByRole("button", { name: "Report a condition" }).click();
  await expect(dialog.getByText(/No human reviewers are assigned yet/)).toBeVisible();
  await expect(dialog.getByLabel("Campus building or place")).toBeVisible();
  await expect(dialog.getByText(/not monitored or sent to UW/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Submit private report" })).toBeDisabled();

  const reportResponse = await page.request.get("/api/safety/reports");
  expect(reportResponse.status()).toBe(200);
  expect((await reportResponse.json()).reports).toEqual([]);
  const unsafeReport = await page.request.post("/api/safety/reports", { data: { category: "crime", buildingId: "0055", observedWindow: "just-now", description: "named allegation" } });
  expect(unsafeReport.status()).toBe(400);
  const reviewerStatus = await page.request.get("/api/safety/moderation/status");
  expect((await reviewerStatus.json()).reason).toBe("reviewer-unassigned");
});

test("campus building footprints load and open details directly from the map", async ({ page }) => {
  const buildingsResponse = page.waitForResponse((response) => response.url().endsWith("/data/uw-campus-buildings.geojson") && response.ok());
  await page.goto("/?date=2026-09-26");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await buildingsResponse;
  await expect(page.getByRole("button", { name: /Explore campus buildings/ })).toHaveCount(0);

  const canvas = await page.locator(".maplibregl-canvas").boundingBox();
  expect(canvas).not.toBeNull();
  const project = ([longitude, latitude]: [number, number]) => {
    const scale = 512 * 2 ** 14.25;
    const mercatorY = (value: number) => (1 - Math.asinh(Math.tan(value * Math.PI / 180)) / Math.PI) / 2 * scale;
    return { x: (longitude + 180) / 360 * scale, y: mercatorY(latitude) };
  };
  // Click a verified point inside Van Vleck Hall's footprint, not its derived
  // centroid (the outline is irregular and the centroid may fall outside it).
  const target = project([-89.4051295, 43.0748355]);
  const center = project([-89.405, 43.075]);
  const x = canvas!.x + canvas!.width / 2 + target.x - center.x;
  const y = canvas!.y + canvas!.height / 2 + target.y - center.y;
  const dialog = page.getByRole("dialog");
  await expect(async () => {
    await page.mouse.click(x, y);
    await expect(dialog.getByRole("heading", { name: "Van Vleck Hall" })).toBeVisible({ timeout: 700 });
  }).toPass({ timeout: 12000 });
  await expect(dialog.getByRole("link", { name: /Directions in Google Maps/ })).toHaveAttribute("href", "https://www.google.com/maps/dir/?api=1&destination=43.07480652279825%2C-89.40493702344519");

  await page.evaluate(() => {
    const scope = window as unknown as { __badgerBuildingFocus: string[] };
    scope.__badgerBuildingFocus = [];
    document.addEventListener("focusin", (event) => {
      if (event.target instanceof HTMLInputElement && event.target.matches(".building-search input")) scope.__badgerBuildingFocus.push("building-search");
    });
  });
  await page.mouse.click(12, 12);
  await expect(dialog).toHaveAttribute("data-state", "closed");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __badgerBuildingFocus: string[] }).__badgerBuildingFocus)).toEqual([]);
});

test("map-only building details remain available without the campus directory", async ({ page }) => {
  await page.goto("/?date=2026-09-26");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: /Explore campus buildings/ })).toHaveCount(0);
  await clickMapPoint(page, [-89.4042, 43.07577]);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Bascom Hall" })).toBeVisible();
  await expect(dialog.getByText("500 Lincoln Dr.")).toBeVisible();
  await expect(dialog.getByText(/FP&M #0050/)).toHaveCount(0);
  await expect(dialog.locator(".building-description")).toHaveText("Campus leadership and central administration, including the Chancellor and Provost offices.");
  await expect(dialog.getByRole("link", { name: /Directions in Google Maps/ })).toHaveAttribute("href", "https://www.google.com/maps/dir/?api=1&destination=43.07534639770641%2C-89.40433580443906");
  await expect(dialog.locator(".building-topic-tags")).toContainText("Campus operations");
  await dialog.getByRole("button", { name: /Back to map/ }).click();
  await expect(dialog).toHaveAttribute("data-state", "closed");
});

test("building details list all calendar events for the selected date", async ({ page }) => {
  await page.goto("/?date=2026-09-26");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await clickMapPoint(page, [-89.40045, 43.0763]);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Memorial Union" })).toBeVisible();

  await expect(dialog.getByRole("heading", { name: "Events on Saturday, September 26" })).toBeVisible();
  const eventList = dialog.locator(".building-event-list");
  await expect(eventList.locator(".event-card")).toHaveCount(5);
  for (const title of ["Kid Disco on the Terrace Stage", "Model Magic Pretzels", "David Landau on the Terrace Stage", "Mural Tour in Stiftskeller", "Madison Tuba Band"]) {
    await expect(eventList.getByText(title, { exact: true })).toBeVisible();
  }
  await expect(dialog.getByRole("link", { name: /Directions in Google Maps/ })).toHaveAttribute("href", "https://www.google.com/maps/dir/?api=1&destination=43.076421006278224%2C-89.39991444943722");
  await eventList.locator(".event-card-main").first().click();
  await expect(eventList.getByRole("link", { name: /Official event/ })).toHaveAttribute("href", /today\.wisc\.edu\/events\/view\/\d+/);
});

test("building details show an official photo when available and a clear fallback otherwise", async ({ page }) => {
  await page.goto("/?date=2026-09-26");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await clickMapPoint(page, [-89.40544068768608, 43.073874885388314]);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Chamberlin Hall" })).toBeVisible();
  const photo = dialog.getByRole("img", { name: "Exterior photo of Chamberlin Hall" });
  await expect(photo).toBeVisible();
  await expect.poll(() => dialog.locator(".building-photo img").evaluate((image) => (image as HTMLImageElement).naturalWidth), { timeout: 15000 }).toBeGreaterThan(0);

  await dialog.getByRole("button", { name: /Back to map/ }).click();
  await clickMapPoint(page, [-89.41129383474136, 43.076517275447486]);
  await expect(dialog.getByRole("img", { name: "No photo available for Soils Building" })).toBeVisible();
});
