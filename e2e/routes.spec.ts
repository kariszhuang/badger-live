import { expect, test } from "@playwright/test";

const origin = {
  id: "00000000-0000-4000-8000-000000000010",
  sourcePlaceId: "memorial-union",
  name: "Memorial Union",
  aliases: [],
  kind: "building",
  coordinates: [-89.3999, 43.0764],
  officialSourceUrl: "https://map.wisc.edu/",
};

const destination = {
  id: "00000000-0000-4000-8000-000000000011",
  sourcePlaceId: "van-vleck",
  name: "Van Vleck Hall",
  aliases: [],
  kind: "building",
  coordinates: [-89.405, 43.075],
  officialSourceUrl: "https://map.wisc.edu/",
};

test("route planner uses trusted place IDs and shows nearby unverified observations", async ({ page }) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/places/search?*", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q")?.toLowerCase() ?? "";
    const place = query.includes("memorial") ? origin : query.includes("van vleck") ? destination : null;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ places: place ? [place] : [] }),
    });
  });
  await page.route("**/api/routes/plan", async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        route: {
          coordinates: [origin.coordinates, [-89.402, 43.076], destination.coordinates],
          distanceM: 520,
          durationS: 390,
        },
        origin: { id: origin.id, name: origin.name },
        destination: { id: destination.id, name: destination.name },
        warnings: [{
          reportId: "00000000-0000-4000-8000-000000000222",
          kind: "blocked_path",
          title: "Blocked sidewalk",
          lifecycle: "active",
          observationLabel: "unverified",
          observationCount: 2,
          lastObservedAt: "2026-09-27T12:00:00.000Z",
          distanceM: 8,
        }],
        disclaimer: "This route is not verified for accessibility, safety, closures, or construction.",
      }),
    });
  });

  await page.goto("/?date=2026-09-27");
  await page.getByRole("button", { name: "Check walking route" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Check a route" })).toBeVisible();
  await dialog.getByRole("combobox", { name: "From" }).fill("Memorial Union");
  await dialog.getByRole("option", { name: /Memorial Union/ }).click();
  await dialog.getByRole("combobox", { name: "To" }).fill("Van Vleck");
  await dialog.getByRole("option", { name: /Van Vleck Hall/ }).click();
  await dialog.getByRole("button", { name: "Check route" }).click();

  await expect(dialog.getByRole("heading", { name: "Reported obstruction on this route" })).toBeVisible();
  await expect(dialog).toContainText("Memorial Union");
  await expect(dialog).toContainText("Van Vleck Hall");
  await expect(dialog).toContainText("Blocked sidewalk");
  await expect(dialog).toContainText("8 m from route · 2 unverified observations");
  await expect(dialog).toContainText("not verified for accessibility, safety, closures, or construction");
  expect(submitted).toMatchObject({ originPlaceId: origin.id, destinationPlaceId: destination.id });
  expect(submitted?.visitorId).toEqual(expect.any(String));
  expect(submitted).not.toHaveProperty("coordinates");

  await dialog.getByRole("button", { name: "Clear route" }).click();
  await expect(dialog.getByRole("heading", { name: "Reported obstruction on this route" })).toHaveCount(0);
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
});
