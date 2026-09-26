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

test("location access shows a private on-map position only after interaction", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 43.075, longitude: -89.405 });
  await page.goto("/?date=2026-09-26");
  await expect(page.getByRole("img", { name: "Your current location" })).toHaveCount(0);
  await page.getByRole("button", { name: "Locate me" }).click();
  await expect(page.getByRole("img", { name: "Your current location" })).toBeVisible();
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
