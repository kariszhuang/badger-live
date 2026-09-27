import { expect, test } from "@playwright/test";

test("real calendar, filters, source and date navigation", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?date=2026-09-26");
  if (testInfo.project.name === "desktop") {
    await expect(page.getByRole("heading", { name: /campus moment/i })).toBeVisible();
    await expect(page.getByText(/20 events · 14 on map · 6 without map locations/)).toBeVisible();
  }
  const list = testInfo.project.name === "mobile" ? page.locator(".mobile-sheet") : page.locator(".discovery-panel");
  await expect(list.getByText("Bioblitz at the Lakeshore Nature Preserve")).toBeVisible();
  await page.getByRole("button", { name: "Music", exact: true }).click();
  await expect(page.getByRole("button", { name: "Music", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "All events" }).click();
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
  await page.getByRole("button", { name: "Expand event list" }).click();
  await expect(page.locator(".mobile-sheet")).toHaveClass(/sheet-half/);
  await page.locator(".mobile-sheet").press("Escape");
  await expect(page.locator(".mobile-sheet")).toHaveClass(/sheet-peek/);
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

test("event and landmark markers with the same coordinates stay aligned through zoom", async ({ page }) => {
  await page.goto("/?date=2026-09-26");
  const eventMarker = page.getByRole("button", { name: "5 events at Memorial Union" });
  const landmarkMarker = page.getByRole("button", { name: "Show Memorial Union on the map" });
  await expect(eventMarker).toBeVisible();
  await expect(landmarkMarker).toBeVisible();
  const samePoint = () => page.evaluate(() => {
    const event = document.querySelector<HTMLButtonElement>('.venue-marker-anchor[aria-label="5 events at Memorial Union"]');
    const landmark = document.querySelector<HTMLButtonElement>('.landmark-marker[aria-label="Show Memorial Union on the map"]');
    if (!event || !landmark) return false;
    // Read both boxes in one browser task so an animated map frame cannot split the measurements.
    const eventRect = event.getBoundingClientRect();
    const landmarkRect = landmark.getBoundingClientRect();
    const landmarkCoordinate = { x: landmarkRect.x - 9, y: landmarkRect.y + landmarkRect.height / 2 + 2 };
    const eventCenter = { x: eventRect.x + eventRect.width / 2, y: eventRect.y + eventRect.height / 2 };
    return Math.abs(eventCenter.x - landmarkCoordinate.x) < 3 && Math.abs(eventCenter.y - landmarkCoordinate.y) < 3;
  });
  await expect.poll(samePoint).toBe(true);

  const canvas = await page.locator(".maplibregl-canvas").boundingBox();
  expect(canvas).not.toBeNull();
  await page.mouse.move(canvas!.x + canvas!.width / 2, canvas!.y + canvas!.height / 2);
  await page.mouse.wheel(0, -500);
  await expect.poll(samePoint).toBe(true);
  await page.mouse.wheel(0, 650);
  await expect.poll(samePoint).toBe(true);
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

test("the angled campus view toggles cleanly back to 2D and landmarks can be focused", async ({ page }, testInfo) => {
  await page.goto("/?date=2026-09-26");
  const angledView = page.getByRole("button", { name: "Switch to angled 3D view" });
  await angledView.click();
  const flatView = page.getByRole("button", { name: "Switch to 2D view" });
  await expect(flatView).toHaveAttribute("aria-pressed", "true");
  await flatView.click();
  await expect(page.getByRole("button", { name: "Switch to angled 3D view" })).toHaveAttribute("aria-pressed", "false");
  const campRandall = page.getByRole("button", { name: "Show Camp Randall on the map" });
  if (testInfo.project.name === "mobile") await expect(campRandall).toHaveCount(1);
  else await campRandall.click();
});

test("campus safety toolbox prioritizes official help and keeps community reporting private", async ({ page }) => {
  await page.goto("/?date=2026-09-26");
  await page.getByRole("button", { name: "Safety, alerts & reports" }).click();
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
  await expect(page.getByRole("button", { name: /Explore campus buildings 219/ })).toBeVisible();

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

test("campus directory searches by disciplines and opens building details", async ({ page }) => {
  await page.goto("/?date=2026-09-26");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await page.getByRole("button", { name: /Explore campus buildings/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Explore UW–Madison buildings" })).toBeVisible();
  await expect(dialog.getByText(/219 mapped UW campus buildings and complexes/)).toBeVisible({ timeout: 15000 });
  await dialog.getByPlaceholder("Search buildings, places, or uses").fill("Chancellor");
  await dialog.getByRole("button", { name: /Bascom Hall/ }).click();
  await expect(dialog.getByRole("heading", { name: "Bascom Hall" })).toBeVisible();
  await expect(dialog.getByText("500 Lincoln Dr.")).toBeVisible();
  await expect(dialog.getByText(/FP&M #0050/)).toHaveCount(0);
  await expect(dialog.locator(".building-description")).toHaveText("Campus leadership and central administration, including the Chancellor and Provost offices.");
  await expect(dialog.getByRole("link", { name: /Directions in Google Maps/ })).toHaveAttribute("href", "https://www.google.com/maps/dir/?api=1&destination=43.07534639770641%2C-89.40433580443906");
  await expect(dialog.locator(".building-topic-tags")).toContainText("Campus administration");
  await dialog.getByRole("button", { name: /All campus buildings/ }).click();
  await expect(dialog.getByPlaceholder("Search buildings, places, or uses")).toBeVisible();
  await dialog.getByPlaceholder("Search buildings, places, or uses").fill("microbiology");
  await dialog.getByRole("button", { name: /Microbial Sciences/ }).click();
  await expect(dialog.getByRole("heading", { name: "Microbial Sciences" })).toBeVisible();
  await expect(dialog.locator(".building-topic-tags")).toContainText("Microbiology");
  await expect(dialog.getByText("1550 Linden Dr.")).toBeVisible();
  await expect(dialog.getByText(/FP&M #0060/)).toHaveCount(0);
  await dialog.getByRole("button", { name: /All campus buildings/ }).click();
  await dialog.getByPlaceholder("Search buildings, places, or uses").fill("Bascom Hall");
  await dialog.getByRole("button", { name: /Bascom Hall/ }).click();
  await dialog.getByRole("button", { name: "Close" }).click();
  await page.waitForTimeout(900);
  const canvas = await page.locator(".maplibregl-canvas").boundingBox();
  expect(canvas).not.toBeNull();
  // selectBuilding focuses the official Bascom Hall center at zoom 15. Click
  // a verified point inside its footprint, away from the overlapping landmark label.
  const project = ([longitude, latitude]: [number, number]) => {
    const scale = 512 * 2 ** 15;
    const mercatorY = (value: number) => (1 - Math.asinh(Math.tan(value * Math.PI / 180)) / Math.PI) / 2 * scale;
    return {
      x: (longitude + 180) / 360 * scale,
      y: mercatorY(latitude),
    };
  };
  const target = project([-89.4041, 43.07572]);
  const center = project([-89.40433580443906, 43.07534639770641]);
  await page.mouse.click(
    canvas!.x + canvas!.width / 2 + target.x - center.x,
    canvas!.y + canvas!.height / 2 + target.y - center.y,
  );
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Bascom Hall" })).toBeVisible();
});

test("building details list all calendar events for the selected date", async ({ page }) => {
  await page.goto("/?date=2026-09-26");
  await page.getByRole("button", { name: /Explore campus buildings/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Search buildings, places, or uses").fill("Memorial Union");
  await dialog.getByRole("button", { name: /Memorial Union/ }).click();

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
  await page.getByRole("button", { name: /Explore campus buildings/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Search buildings, places, or uses").fill("Chamberlin");
  await dialog.getByRole("button", { name: /Chamberlin Hall/ }).click();
  const photo = dialog.getByRole("img", { name: "Exterior photo of Chamberlin Hall" });
  await expect(photo).toBeVisible();
  await expect.poll(() => dialog.locator(".building-photo img").evaluate((image) => (image as HTMLImageElement).naturalWidth), { timeout: 15000 }).toBeGreaterThan(0);

  await dialog.getByRole("button", { name: /All campus buildings/ }).click();
  await dialog.getByPlaceholder("Search buildings, places, or uses").fill("Soils Building");
  await dialog.getByRole("button", { name: /Soils Building/ }).click();
  await expect(dialog.getByRole("img", { name: "No photo available for Soils Building" })).toBeVisible();
});
