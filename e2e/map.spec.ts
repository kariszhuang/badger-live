import { expect, test } from "@playwright/test";

type CrimeMarkerAuditWindow = Window & { __crimeMarkerAudit?: string[]; __crimeMarkerObserver?: MutationObserver; __crimeMarkerCanvas?: HTMLCanvasElement | null };

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

async function waitForBuildingMap(page: import("@playwright/test").Page) {
  await expect(page.locator(".map-canvas")).toHaveAttribute("data-buildings-ready", "true", { timeout: 15000 });
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
      return marker.evaluate((element) => {
        const markerBox = element.querySelector(".crime-map-marker")?.getBoundingClientRect();
        const countBox = element.querySelector(".crime-map-marker-count")?.getBoundingClientRect();
        return markerBox && countBox ? Math.abs(countBox.x + countBox.width / 2 - markerBox.x - markerBox.width / 2) : 99;
      });
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
    windowDays: 30,
    windowStart: "2026-08-28",
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
  await expect.poll(async () => sheet.evaluate((element) => element.getBoundingClientRect().height <= 0.56 * window.innerHeight + 2)).toBe(true);
  // Let MapLibre finish its focus flight before checking marker placement.
  await page.waitForTimeout(800);
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
    await expect(page.getByRole("group", { name: "Choose official information layer" })).toBeVisible();
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

test("returning to the initially loaded date clears the calendar loading state", async ({ page }) => {
  const requestedEventDates: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/events") requestedEventDates.push(url.searchParams.get("date") ?? "");
  });
  await page.goto("/?date=2026-09-26");
  const countLine = page.locator(".count-line");
  await expect(countLine).toContainText("20 events");

  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(page).toHaveURL(/date=2026-09-25/);
  await expect(countLine).not.toHaveText("Loading official calendar…");
  expect(requestedEventDates).toEqual(["2026-09-25"]);

  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page).toHaveURL(/date=2026-09-26/);
  expect(requestedEventDates).toEqual(["2026-09-25"]);
  await expect(countLine).not.toHaveText("Loading official calendar…");
  await expect(countLine).toContainText("20 events");
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

test("search and date picker remain usable", async ({ page }, testInfo) => {
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
});

test("mobile sheet expands from its accessible handle", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.goto("/?date=2026-09-26");
  await page.getByRole("button", { name: "Show 20 events" }).click();
  const sheet = page.locator(".mobile-sheet");
  await expect(sheet.getByRole("button", { name: "Close event list" })).toBeVisible();
  await sheet.getByRole("button", { name: "Close event list" }).click();
  await expect(sheet).toHaveClass(/sheet-closed/);
  await page.getByRole("button", { name: "Show 20 events" }).click();
  await page.getByRole("button", { name: "Expand event list" }).click();
  await expect(page.locator(".mobile-sheet")).toHaveClass(/sheet-full/);
  await page.locator(".mobile-sheet").press("Escape");
  await expect(page.locator(".mobile-sheet")).toHaveClass(/sheet-closed/);
});

test("mobile discovery controls leave the map dominant in events and official info modes", async ({ page }, testInfo) => {
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
    const sheetTop = getComputedStyle(document.querySelector(".mobile-sheet")!).display === "none" ? map.bottom : sheet.top;
    return Math.min(sheetTop, map.bottom) - toolbar.bottom;
  });
  await expect.poll(visibleMapGap).toBeGreaterThan(400);
  await expect(page.getByRole("button", { name: /Explore campus buildings/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Official info" }).click();
  await expect(page.getByRole("button", { name: "Theft / larceny" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fraud" })).toHaveCount(0);
  await expect.poll(visibleMapGap).toBeGreaterThan(400);
});

test("historical blotter markers mount once when switching to official info", async ({ page }) => {
  let crimeRequests = 0;
  const fixture = {
    fetchedAt: "2026-09-26T17:00:00.000Z",
    windowDays: 30,
    windowStart: "2026-08-28",
    windowEnd: "2026-09-26",
    latestArticleDate: "2026-09-24",
    partial: false,
    incidents: [{ id: "switch:1", incidentDate: "2026-09-24", occurredAt: "2026-09-24T17:00:00.000Z", timeLabel: "12:00 pm", incidentType: "Theft/Larceny", category: "theft", locationLabel: "Memorial Library", buildingId: "0500", buildingName: "Memorial Library", coordinates: [-89.4004, 43.0757], summary: "A theft or larceny report was logged.", source: "uwpd-official", sourceUrl: "https://uwpd.wisc.edu/daily-blotter/2026-09-24/" }],
  };
  await page.route("**/api/safety/crimes?days=*", (route) => { crimeRequests += 1; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) }); });
  await page.goto("/?date=2026-09-26");
  await expect(page.locator(".venue-marker-anchor").first()).toBeVisible();
  await page.evaluate(() => {
    const panel = document.querySelector(".map-panel");
    if (!panel) throw new Error("Map panel is missing");
    const auditWindow = window as CrimeMarkerAuditWindow;
    auditWindow.__crimeMarkerAudit = [];
    auditWindow.__crimeMarkerCanvas = panel.querySelector(".maplibregl-canvas");
    const containsCrimeMarker = (node: Node) => node instanceof Element && (node.matches(".crime-map-marker-anchor") || Boolean(node.querySelector(".crime-map-marker-anchor")));
    auditWindow.__crimeMarkerObserver = new MutationObserver((records) => {
      for (const record of records) {
        if ([...record.addedNodes].some(containsCrimeMarker)) auditWindow.__crimeMarkerAudit?.push("added");
        if ([...record.removedNodes].some(containsCrimeMarker)) auditWindow.__crimeMarkerAudit?.push("removed");
      }
    });
    auditWindow.__crimeMarkerObserver.observe(panel, { childList: true, subtree: true });
  });

  await page.getByRole("button", { name: "Official info" }).click();
  await expect(page.getByRole("button", { name: "1 official police blotter entry at Memorial Library" })).toBeVisible();
  await page.waitForTimeout(350);
  const audit = await page.evaluate(() => ({
    markerMutations: (window as CrimeMarkerAuditWindow).__crimeMarkerAudit || [],
    mapCanvasStable: (window as CrimeMarkerAuditWindow).__crimeMarkerCanvas === document.querySelector(".maplibregl-canvas"),
  }));
  await page.evaluate(() => (window as CrimeMarkerAuditWindow).__crimeMarkerObserver?.disconnect());
  expect({ ...audit, crimeRequests }).toEqual({ markerMutations: ["added"], mapCanvasStable: true, crimeRequests: 1 });
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
  await expect(page.getByRole("region", { name: "Campus map" }).getByRole("alert")).toContainText(/location needs HTTPS/i);
});

test("map controls stay minimal, 2D, and at the bottom", async ({ page }) => {
  await page.goto("/?date=2026-09-26");
  await expect(page.locator(".map-tools button")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Locate me" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to campus" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check walking route" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Safety alerts and resources" })).toBeVisible();
  await expect(page.getByRole("button", { name: /fit|3d view|2d view/i })).toHaveCount(0);

  const controls = await page.locator(".map-tools").boundingBox();
  const map = await page.getByRole("region", { name: "Campus map" }).boundingBox();
  expect(controls).not.toBeNull();
  expect(map).not.toBeNull();
  const controlsBottomGap = map!.y + map!.height - (controls!.y + controls!.height);
  expect(controlsBottomGap).toBeGreaterThanOrEqual(0);
  expect(controlsBottomGap).toBeLessThan(90);
});

test("verified help stays separate from the anonymous physical-condition report flow", async ({ page }) => {
  await page.route("**/api/places/search?*", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query === "Van Vleck") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places: [{ id: "van-vleck", sourcePlaceId: "van-vleck", name: "Van Vleck Hall", aliases: ["Van Vleck"], kind: "building", coordinates: [-89.407, 43.0748], officialSourceUrl: "https://map.wisc.edu/" }] }) });
    } else {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Campus place search is temporarily unavailable." }) });
    }
  });
  await page.goto("/?date=2026-09-26");
  await page.getByRole("button", { name: "Safety alerts and resources" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Get help. Stay informed." })).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Immediate danger\? Call 911/ })).toHaveAttribute("href", "tel:911");
  await expect(dialog.getByRole("link", { name: "UW Campus Alerts" })).toHaveAttribute("href", "https://alerts.wisc.edu/");
  await expect(dialog.getByRole("link", { name: "Manage WiscAlerts" })).toHaveAttribute("href", "https://go.wisc.edu/wiscalerts");
  await expect(dialog.getByText(/Badger Live is independent and is not an emergency service/)).toBeVisible();
  await expect(dialog.getByText(/reviewer|moderation|sign in/i)).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close" }).click();

  await expect(page.getByRole("button", { name: /Report here/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Ask Badger/ })).toBeVisible();
  await page.getByRole("button", { name: /Report here/ }).click();
  const report = page.getByRole("dialog");
  await expect(report.getByRole("heading", { name: "Report a campus condition" })).toBeVisible();
  await expect(report.getByLabel("What did you see?")).toBeVisible();
  await expect(report.getByRole("button", { name: /Choose on map/ })).toBeVisible();
  await expect(report.getByText(/original message and photo are not published or saved/)).toBeVisible();
  await expect.poll(async () => report.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.left >= -1 && box.top >= -1 && box.right <= window.innerWidth + 1 && box.bottom <= window.innerHeight + 1;
  })).toBe(true);
  await report.getByLabel("Search a campus place").fill("Van Vleck");
  await expect(report.getByRole("option", { name: /Van Vleck Hall/ })).toBeVisible();
  await expect(report.getByRole("status").filter({ hasText: /Searching campus places/ })).toHaveCount(0);
  await report.getByRole("option", { name: /Van Vleck Hall/ }).click();
  await expect(report.locator(".report-selected-place")).toContainText("Van Vleck Hall");
  await report.getByLabel("Search a campus place").fill("Missing place");
  await expect(report.getByRole("status").filter({ hasText: /search is unavailable/i })).toBeVisible();
  await report.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: /Ask Badger/ }).click();
  const assistant = page.getByRole("dialog");
  await expect(assistant.getByRole("heading", { name: "What would help today?" })).toBeVisible();
  await expect(assistant.getByText(/Asking never posts a report/)).toBeVisible();
  await expect.poll(async () => assistant.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.left >= -1 && box.top >= -1 && box.right <= window.innerWidth + 1 && box.bottom <= window.innerHeight + 1;
  })).toBe(true);
  await expect(assistant.getByRole("button", { name: /Post this as a report/ })).toHaveCount(0);
  await page.route("**/api/assistant", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "The campus assistant AI is not configured for this deployment yet." }) }));
  await assistant.getByLabel("Ask a campus question").fill("Is it icy near Van Vleck?");
  await assistant.getByRole("button", { name: "Ask" }).click();
  await expect(assistant.getByRole("alert")).toContainText(/not configured/);
  await expect(assistant.getByRole("button", { name: /Post this as a report/ })).toHaveCount(0);

  expect((await page.request.get("/api/safety/reports")).status()).toBe(404);
  expect((await page.request.get("/api/safety/moderation/status")).status()).toBe(404);
});

test("report composer can use a map pin without granting GPS access", async ({ page }) => {
  await page.goto("/?date=2026-09-26");
  await waitForBuildingMap(page);
  await page.getByRole("button", { name: "Report here" }).click();
  const report = page.getByRole("dialog");
  await expect(report.getByRole("heading", { name: "Report a campus condition" })).toBeVisible();
  if ((await report.getAttribute("class"))?.includes("is-collapsed")) await report.getByRole("button", { name: "Change location" }).click();
  await expect(report).toHaveClass(/is-expanded/);
  await report.getByRole("button", { name: "Choose on map" }).click();
  await expect(report).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Campus map" }).getByRole("status").filter({ hasText: "Tap the map where you saw the condition" })).toBeVisible();
  await clickMapPoint(page, [-89.407, 43.0748]);
  const pinnedReport = page.getByRole("dialog");
  await expect(pinnedReport.getByText("Map point selected · approximate")).toBeVisible();
  await expect(pinnedReport).toHaveClass(/is-expanded/);
  await expect(pinnedReport.getByRole("button", { name: "Clear map point" })).toBeVisible();
  await expect(pinnedReport.locator(".report-footer-actions")).toBeVisible();
  await pinnedReport.getByRole("button", { name: "Cancel" }).click();
});

test("mobile report composer opens compactly and expands on text focus", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 43.075, longitude: -89.405, accuracy: 18 });
  await page.goto("/?date=2026-09-26");
  await waitForBuildingMap(page);
  await page.getByRole("button", { name: "Report here" }).click();

  const report = page.getByRole("dialog");
  await expect(report).toHaveClass(/is-collapsed/);
  const compactRatio = await report.evaluate((element) => element.getBoundingClientRect().height / window.innerHeight);
  expect(compactRatio).toBeGreaterThan(0.42);
  expect(compactRatio).toBeLessThan(0.52);
  const description = report.getByLabel("What did you see?");
  await expect(description).toHaveCSS("font-size", "16px");
  await expect(report.getByLabel("Search a campus place")).toHaveCSS("font-size", "16px");
  const visibleDescriptionHeight = await description.evaluate((element) => {
    const input = element.getBoundingClientRect();
    const sheet = element.closest("[role=dialog]")!.getBoundingClientRect();
    return Math.min(input.bottom, sheet.bottom) - Math.max(input.top, sheet.top);
  });
  expect(visibleDescriptionHeight).toBeGreaterThanOrEqual(60);

  await description.click();
  await expect(report).toHaveClass(/is-expanded/);
  await expect.poll(async () => report.evaluate((element) => element.getBoundingClientRect().height / window.innerHeight)).toBeGreaterThan(0.8);
  await expect(report.locator(".report-footer-actions")).toBeVisible();
  await expect(report.getByRole("button", { name: "Send report" })).toBeVisible();
  const widths = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
  await expect(page.locator(".map-panel")).toBeVisible();
});

test("GPS denial expands the composer and exposes manual location choices", async ({ page }) => {
  await page.addInitScript(() => {
    const deniedGeolocation = {
      getCurrentPosition(_success: PositionCallback, error?: PositionErrorCallback | null) {
        const denial = { code: 1, message: "Permission denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
        window.setTimeout(() => error?.(denial), 0);
      },
    };
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: deniedGeolocation });
  });
  await page.goto("/?date=2026-09-26");
  await page.getByRole("button", { name: "Report here" }).click();

  const report = page.getByRole("dialog");
  await expect(report.locator(".report-location-heading strong")).toContainText("Location access is off");
  await expect(report).toHaveClass(/is-expanded/);
  await expect(report.getByRole("button", { name: "Choose on map" })).toBeVisible();
  await expect(report.getByLabel("Search a campus place")).toBeVisible();
  await expect(report.locator(".report-footer-actions")).toBeVisible();
  await expect(report).not.toContainText("GPS is requested only after you open this form");
  await expect(report.getByRole("button", { name: "Send report" })).toBeDisabled();
});

test("voice dictation is opt-in and sends transcript text only after Send", async ({ page }) => {
  const submissions: Array<Record<string, unknown>> = [];
  await page.addInitScript(() => {
    class FakeSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        window.setTimeout(() => {
          this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "Icy near Van Vleck." } }] });
          this.onend?.();
        }, 0);
      }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    }
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: FakeSpeechRecognition });
  });
  await page.route("**/api/report/publish", async (route) => {
    submissions.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ outcome: "not_published", message: "Fixture stopped before publication." }) });
  });

  await page.goto("/?date=2026-09-26");
  await page.getByRole("button", { name: "Report here" }).click();
  const report = page.getByRole("dialog");
  const dictate = report.getByRole("button", { name: "Start voice dictation" });
  await expect(dictate).toBeVisible();
  await expect(report.getByText(/browser's speech service may process microphone audio/i)).toBeVisible();
  expect(submissions).toHaveLength(0);

  await dictate.click();
  const description = report.getByLabel("What did you see?");
  await expect(description).toHaveValue("Icy near Van Vleck.");
  await expect(report.getByRole("button", { name: "Send report" })).toBeEnabled();
  expect(submissions).toHaveLength(0);

  await report.getByRole("button", { name: "Send report" }).click();
  await expect(report.getByRole("alert")).toContainText("Fixture stopped before publication.");
  expect(submissions).toHaveLength(1);
  expect(submissions[0].text).toBe("Icy near Van Vleck.");
  expect(submissions[0]).not.toHaveProperty("audio");
});

test("unsupported browsers keep the report composer usable with a dictation fallback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: undefined });
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: undefined });
  });
  await page.goto("/?date=2026-09-26");
  await page.getByRole("button", { name: "Report here" }).click();

  const report = page.getByRole("dialog");
  await expect(report.getByText(/Voice dictation isn.t available in this browser/)).toBeVisible();
  await expect(report.getByRole("button", { name: /dictation/i })).toHaveCount(0);
  await report.getByLabel("What did you see?").fill("Icy near Van Vleck.");
  await expect(report.getByRole("button", { name: "Send report" })).toBeEnabled();
});

test("report time follow-up keeps the draft and requires an answer before retry", async ({ page }) => {
  const submissions: Array<Record<string, unknown>> = [];
  await page.route("**/api/report/publish", async (route) => {
    const submission = route.request().postDataJSON() as Record<string, unknown>;
    submissions.push(submission);
    const result = submissions.length === 1
      ? { outcome: "needs_followup", itemIndex: 0, question: "When did you see this condition?" }
      : { outcome: "not_published", message: "Fixture stopped before publication." };
    await route.fulfill({ status: submissions.length === 1 ? 200 : 422, contentType: "application/json", body: JSON.stringify(result) });
  });

  await page.goto("/?date=2026-09-26");
  await page.getByRole("button", { name: "Report here" }).click();
  const report = page.getByRole("dialog");
  const description = "The sidewalk was icy near Van Vleck.";
  await report.getByLabel("What did you see?").fill(description);
  const send = report.getByRole("button", { name: "Send report" });
  await send.click();

  await expect(report.getByText("When did you see this condition?")).toBeVisible();
  await expect(report.getByLabel("What did you see?")).toHaveValue(description);
  const timeAnswer = report.getByPlaceholder("For example: about 20 minutes ago");
  await expect(timeAnswer).toBeVisible();
  await expect(send).toBeDisabled();
  await timeAnswer.fill("about 20 minutes ago");
  await expect(send).toBeEnabled();
  await send.click();
  await expect(report.getByRole("alert")).toContainText("Fixture stopped before publication.");
  await expect(report.getByLabel("What did you see?")).toHaveValue(`${description}\nabout 20 minutes ago`);
  expect(submissions).toHaveLength(2);
  expect(submissions[0].text).toBe(description);
  expect(submissions[1].text).toBe(`${description}\nabout 20 minutes ago`);
});

test("same-issue receipt reports the added observation instead of zero reports", async ({ page }) => {
  const candidateId = "00000000-0000-4000-8000-000000000555";
  const publishTime = "2026-09-27T12:00:00.000Z";
  const submissions: Array<Record<string, unknown>> = [];
  await page.route("**/api/report/publish", async (route) => {
    const submission = route.request().postDataJSON() as Record<string, unknown>;
    submissions.push(submission);
    const result = submissions.length === 1
      ? { outcome: "possible_duplicates", issues: [{ itemIndex: 0, title: "Icy surface", candidates: [{ id: candidateId, kind: "ice", title: "Icy surface", coordinates: [-89.407, 43.071], placeId: null, locationMethod: "pin", locationAccuracyM: null, lifecycle: "active", observationCount: 1, lastObservedAt: publishTime }] }] }
      : { outcome: "posted", postedCount: 0, recheckedCount: 1, idempotent: false, reports: [{ id: candidateId, kind: "ice", title: "Icy surface", coordinates: [-89.407, 43.071], placeId: null, locationMethod: "pin", locationAccuracyM: null, reportedSeverity: "unknown", observationLabel: "unverified", lifecycle: "active", observationCount: 2, observedAt: publishTime, lastObservedAt: publishTime, expiresAt: "2026-09-27T13:00:00.000Z", version: 2, recheckStatus: "counted" }], capabilities: [] };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result) });
  });

  await page.goto("/?date=2026-09-27");
  await waitForBuildingMap(page);
  await page.getByRole("button", { name: "Report here" }).click();
  const report = page.getByRole("dialog");
  await report.getByLabel("What did you see?").fill("Icy here");
  await report.getByRole("button", { name: "Send report" }).click();
  await expect(report.getByText("POSSIBLE NEARBY MATCH")).toBeVisible();
  await report.getByRole("button", { name: /Same issue/ }).click();
  await report.getByRole("button", { name: "Confirm choices & send" }).click();

  await expect(report.getByRole("heading", { name: "Observation added" })).toBeVisible();
  await expect(report.getByText("1 observation added", { exact: true })).toBeVisible();
  await expect(report.locator(".report-receipt-card small")).toContainText("Observation added");
  await expect(report.getByText(/0 reports posted/)).toHaveCount(0);
  expect(submissions).toHaveLength(2);
  expect(submissions[1].duplicateDecisions).toEqual([{ itemIndex: 0, choice: "same", reportId: candidateId }]);
});

test("a fresh report receipt can correct only its safe category using the local capability", async ({ page }) => {
  const reportId = "00000000-0000-4000-8000-000000000556";
  const token = `${reportId}.local-capability-token-with-enough-entropy`;
  const createdAt = "2026-09-27T12:00:00.000Z";
  const initialReport = {
    id: reportId, kind: "ice", title: "Icy surface", coordinates: [-89.407, 43.071], placeId: null,
    locationMethod: "pin", locationAccuracyM: null, reportedSeverity: "unknown", observationLabel: "unverified",
    lifecycle: "active", observationCount: 1, observedAt: createdAt, lastObservedAt: createdAt,
    expiresAt: "2026-09-27T18:00:00.000Z", version: 1,
  };
  const editedReport = { ...initialReport, kind: "broken_light", title: "Broken exterior light", version: 2 };
  let editBody: Record<string, unknown> | null = null;
  await page.route("**/api/map/reports?bbox=*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reports: [] }) }));
  await page.route("**/api/report/publish", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ outcome: "posted", postedCount: 1, recheckedCount: 0, idempotent: false, reports: [initialReport], capabilities: [{ reportId, token }] }) }));
  await page.route(`**/api/report/${reportId}/edit`, async (route) => {
    editBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ updated: true, report: editedReport }) });
  });

  await page.goto("/?date=2026-09-27");
  await page.getByRole("button", { name: "Report here" }).click();
  const receipt = page.getByRole("dialog");
  await receipt.getByLabel("What did you see?").fill("Ice near the ramp");
  await receipt.getByRole("button", { name: "Send report" }).click();
  await expect(receipt.getByRole("heading", { name: "Report posted" })).toBeVisible();
  await expect(receipt.getByRole("button", { name: /Edit category/ })).toBeVisible();

  await receipt.getByRole("button", { name: /Edit category/ }).click();
  const cardFitsViewport = await receipt.locator(".report-receipt-card").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return element.scrollWidth <= element.clientWidth && bounds.left >= 0 && bounds.right <= window.innerWidth;
  });
  expect(cardFitsViewport).toBe(true);
  await receipt.getByLabel("Correct the category").selectOption("broken_light");
  await receipt.getByRole("button", { name: "Save category" }).click();

  await expect(receipt.locator(".report-receipt-card strong")).toHaveText("Broken exterior light");
  await expect(receipt.getByRole("status")).toContainText("Category updated");
  expect(editBody).not.toBeNull();
  expect(Object.keys(editBody!).sort()).toEqual(["capability", "expectedVersion", "kind", "visitorId"]);
  expect(editBody).toMatchObject({ capability: token, expectedVersion: 1, kind: "broken_light" });
  expect(editBody).not.toHaveProperty("text");
  expect(editBody).not.toHaveProperty("photo");
});

test("campus building footprints load and open details directly from the map", async ({ page }) => {
  const buildingsResponse = page.waitForResponse((response) => response.url().endsWith("/data/uw-campus-buildings.geojson") && response.ok());
  await page.goto("/?date=2026-09-26");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await buildingsResponse;
  await waitForBuildingMap(page);
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
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __badgerBuildingFocus: string[] }).__badgerBuildingFocus)).toEqual([]);
});

test("map-only building details remain available without the campus directory", async ({ page }) => {
  const buildingsResponse = page.waitForResponse((response) => response.url().endsWith("/data/uw-campus-buildings.geojson") && response.ok());
  await page.goto("/?date=2026-09-26");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await buildingsResponse;
  await waitForBuildingMap(page);
  await expect(page.getByRole("button", { name: /Explore campus buildings/ })).toHaveCount(0);
  await clickMapPoint(page, [-89.40433580443906, 43.07534639770641]);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Bascom Hall" })).toBeVisible();
  await expect(dialog.getByText("500 Lincoln Dr.")).toBeVisible();
  await expect(dialog.getByText(/FP&M #0050/)).toHaveCount(0);
  await expect(dialog.locator(".building-description")).toHaveText("Campus leadership and central administration, including the Chancellor and Provost offices.");
  await expect(dialog.getByRole("link", { name: /Directions in Google Maps/ })).toHaveAttribute("href", "https://www.google.com/maps/dir/?api=1&destination=43.07534639770641%2C-89.40433580443906");
  await expect(dialog.locator(".building-topic-tags")).toContainText("Campus administration");
  await dialog.getByRole("button", { name: /Back to map/ }).click();
  await expect(dialog).toBeHidden();
});

test("building details list all calendar events for the selected date", async ({ page }) => {
  const buildingsResponse = page.waitForResponse((response) => response.url().endsWith("/data/uw-campus-buildings.geojson") && response.ok());
  await page.goto("/?date=2026-09-26");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await buildingsResponse;
  await waitForBuildingMap(page);
  await page.getByRole("button", { name: "Sports", exact: true }).click();
  await expect(page.getByRole("button", { name: /events at Memorial Union/i })).toHaveCount(0);
  await clickMapPoint(page, [-89.40035, 43.0765]);
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
  const buildingsResponse = page.waitForResponse((response) => response.url().endsWith("/data/uw-campus-buildings.geojson") && response.ok());
  await page.goto("/?date=2026-09-26");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await buildingsResponse;
  await waitForBuildingMap(page);
  await clickMapPoint(page, [-89.40544068768608, 43.073874885388314]);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Chamberlin Hall" })).toBeVisible();
  const photo = dialog.getByRole("img", { name: "Exterior photo of Chamberlin Hall" });
  await expect(photo).toBeVisible();
  await expect.poll(() => dialog.locator(".building-photo img").evaluate((image) => (image as HTMLImageElement).naturalWidth), { timeout: 15000 }).toBeGreaterThan(0);

  await dialog.getByRole("button", { name: /Back to map/ }).click();
  const refreshedBuildings = page.waitForResponse((response) => response.url().endsWith("/data/uw-campus-buildings.geojson") && response.ok());
  await page.goto("/?date=2026-09-26");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await refreshedBuildings;
  await waitForBuildingMap(page);
  await clickMapPoint(page, [-89.41129383474136, 43.076517275447486]);
  await expect(dialog.getByRole("img", { name: "No photo available for Soils Building" })).toBeVisible();
});
