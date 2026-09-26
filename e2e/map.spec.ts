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

test("location access shows a private on-map position only after interaction", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 43.075, longitude: -89.405 });
  await page.goto("/?date=2026-09-26");
  await expect(page.getByRole("img", { name: "Your current location" })).toHaveCount(0);
  await page.getByRole("button", { name: "Locate me" }).click();
  await expect(page.getByRole("img", { name: "Your current location" })).toBeVisible();
});
