import { expect, test, type Page } from "@playwright/test";

const arrival = "2027-01-15";
const user = { uid: "browser-user", fullName: "Test Guest", roles: ["customer"], accountStatus: "active" };
function hotel(id = "hotel", price = 55000) {
  return { id, slug: id, name: id === "hotel" ? "Garden Hotel" : "River Hotel", city: "Kanpur", state: "Uttar Pradesh", locality: "Civil Lines", propertyType: "hotel", ratingAverage: 4, ratingCount: 1, minimumPricePaise: price, currency: "INR", coverImageUrl: null, coverImageSrcSet: "", coverImageWidth: 1, coverImageHeight: 1, amenityCodes: ["wifi", "parking"], propertyAmenityCodes: ["wifi"], freeCancellation: true, coordinates: { latitude: 26.46, longitude: 80.32 }, offer: { roomTypeId: "twin", ratePlanId: "flex", roomName: "Twin room", beds: [{ bedType: "single", count: 2 }], amenityCodes: ["wifi", "parking"], totalPaise: price, subtotalPaise: price - 5000, taxPaise: 5000, customerFeePaise: 0, breakfastIncluded: true, cancellation: { freeCancellation: true, deadline: "2027-01-14T08:30:00Z", feePercent: 0, name: "Flexible" }, startAt: `${arrival}T08:30:00Z`, endAt: "2027-01-16T05:30:00Z", timezone: "Asia/Kolkata", nights: 1, durationMinutes: 1260, bookingMode: "overnight", validUntil: Date.now() + 30_000 } };
}
async function fixtures(page: Page, signedIn = false) {
  let saved = false;
  await page.route("**/api/auth/me", route => route.fulfill({ status: signedIn ? 200 : 401, json: signedIn ? { user } : { error: "Unauthenticated" } }));
  await page.route("**/api/search/suggestions**", route => route.fulfill({ json: { suggestions: [] } }));
  await page.route("**/api/search/properties?**", route => {
    const params = new URL(route.request().url()).searchParams;
    const filtered = params.has("minRating");
    const next = params.has("cursor");
    return route.fulfill({ json: { properties: [hotel(next ? "second" : "hotel", next ? 65000 : 55000)], hasMore: !next && !filtered, nextCursor: next || filtered ? null : "fixture-next", total: filtered ? 1 : 2, evaluatedAt: Date.now(), expiresAt: Date.now() + 30_000, availableAmenities: ["wifi", "parking"] } });
  });
  await page.route(/\/api\/wishlist(?:\/|\?|$)/, route => {
    if (route.request().method() === "PUT") { saved = true; return route.fulfill({ json: { saved: true } }); }
    if (route.request().method() === "DELETE") { saved = false; return route.fulfill({ json: { saved: false } }); }
    return route.fulfill({ json: { propertyIds: saved ? ["hotel"] : [] } });
  });
  // Invalid limit deliberately skips database-backed SSR prefetch. API fixtures
  // exercise the actual client search, filters, pagination, saves and map.
  await page.goto(`/search?limit=0&destination=Kanpur&checkIn=${arrival}&checkOut=2027-01-16&adults=3&children=1&infants=1`);
  await expect(page.getByRole("heading", { name: "Garden Hotel", exact: true })).toBeVisible();
}

test("cards show the priced room and preserve booking context", async ({ page }) => {
  await fixtures(page);
  const card = page.locator('article[data-hotel-id="hotel"]');
  await expect(card).toContainText("Twin room");
  await expect(card).toContainText("2 single beds");
  await expect(card).toContainText("4 guests + 1 infant");
  await expect(card).toContainText("Breakfast included");
  await expect(card).toContainText("Civil Lines");
  await expect(card).not.toContainText("City centre");
  await expect(card).not.toContainText("Great value");
  const href = await card.getByRole("link", { name: "Choose room" }).getAttribute("href");
  const params = new URL(href!, "http://localhost").searchParams;
  expect(params.get("roomTypeId")).toBe("twin");
  expect(params.get("ratePlanId")).toBe("flex");
  expect(params.get("adults")).toBe("3");
  expect(params.get("infants")).toBe("1");
  expect(params.get("checkIn")).toBe(arrival);
  expect(params.has("limit")).toBe(false);
  await page.getByRole("button", { name: /Show more stays/ }).click();
  await expect(page.getByRole("heading", { name: "River Hotel", exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/helpkey-search-desktop.png", fullPage: true });
});

test("filters survive navigation, reload and back", async ({ page }) => {
  await fixtures(page);
  const checkbox = page.getByLabel("4.5+ Exceptional", { exact: true });
  await checkbox.click();
  await expect(page).toHaveURL(/minRating=4.5/);
  await expect(page.getByRole("button", { name: /Guest rating 4.5/ })).toBeVisible();
  await page.reload();
  await expect(checkbox).toBeChecked();
  await page.getByRole("button", { name: "Clear all", exact: true }).first().click();
  await expect(page).not.toHaveURL(/minRating/);
  await page.goBack();
  await expect(checkbox).toBeChecked();
});

test("saving requires sign-in and signed-in saves persist after reload", async ({ page }) => {
  await fixtures(page);
  await page.getByRole("button", { name: "Save Garden Hotel", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Sign in to Helpkey" })).toBeVisible();
  await page.reload();
  await fixtures(page, true);
  const heart = page.getByRole("button", { name: "Save Garden Hotel", exact: true });
  await expect(heart).toBeEnabled();
  const savedResponse = page.waitForResponse(response => response.url().includes("/api/wishlist/hotel") && response.request().method() === "PUT");
  await heart.click();
  await savedResponse;
  await expect(page.getByRole("button", { name: "Unsave Garden Hotel", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Unsave Garden Hotel", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: "Unsave Garden Hotel", exact: true })).toBeVisible();
});

test("map loads on demand and previews the same hotel offer", async ({ page }) => {
  await page.addInitScript(() => {
    class FakeMap { element: HTMLElement; constructor(element: HTMLElement) { this.element = element; } fitBounds() {} }
    class Marker { map: FakeMap | null; constructor(options: { map: FakeMap; content: HTMLElement }) { this.map = options.map; options.map.element.append(options.content); } }
    Object.assign(window, { google: { maps: { importLibrary: async (name: string) => name === "maps" ? { Map: FakeMap } : { AdvancedMarkerElement: Marker }, LatLngBounds: class { extend() {} }, event: { clearInstanceListeners() {} } } } });
  });
  await fixtures(page);
  await expect(page.getByRole("region", { name: "Hotel map" })).toHaveCount(0);
  await page.getByRole("button", { name: "Map", exact: true }).click();
  const map = page.getByRole("region", { name: "Hotel map" });
  await expect(map).toContainText("1 mapped hotels");
  await map.getByRole("button", { name: /Garden Hotel.*Show hotel preview/ }).click();
  await expect(map.getByRole("link", { name: "View details" })).toHaveAttribute("href", /ratePlanId=flex/);
});

test("mobile cards and filters fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Filter hotels" })).toBeVisible();
  await page.getByRole("button", { name: "Close filters", exact: true }).last().click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/helpkey-search-mobile.png", fullPage: true });
});


test("cache expiry keeps hotels visible and refreshes pagination without an expiry error", async ({ page }) => {
  await page.clock.install();
  await fixtures(page);
  await page.clock.fastForward(31_000);
  await expect(page.getByRole("heading", { name: "Garden Hotel", exact: true })).toBeVisible();
  await expect(page.getByText("Refresh to see current prices and availability.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Map", exact: true })).toBeEnabled();
  // Route handlers use the test runner's real clock; return a fresh snapshot
  // beyond the browser's advanced clock for the revalidation response.
  await page.route("**/api/search/properties?**", route => {
    const next = new URL(route.request().url()).searchParams.has("cursor");
    return route.fulfill({ json: { properties: [hotel(next ? "second" : "hotel")], hasMore: !next, nextCursor: next ? null : "fresh-next", total: 2, evaluatedAt: Date.now() + 31_000, expiresAt: Date.now() + 120_000, availableAmenities: ["wifi"] } });
  });
  const updated = page.waitForResponse(response => response.url().includes("/api/search/properties?") && !new URL(response.url()).searchParams.has("cursor"));
  await page.getByRole("button", { name: /Show more stays/ }).click();
  await updated;
  await expect(page.getByRole("heading", { name: "Garden Hotel", exact: true })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Refresh" })).toHaveCount(0);
  await page.getByRole("button", { name: /Show more stays/ }).click();
  await expect(page.getByRole("heading", { name: "River Hotel", exact: true })).toBeVisible();
});
