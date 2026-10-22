import { expect, test, type Page } from "@playwright/test";

const stayQuery = "checkIn=2027-01-15&checkOut=2027-01-17&adults=2&children=0&infants=1";
const property = {
  id: "hotel", slug: "garden", name: "Garden Hotel", city: "Kanpur", state: "Uttar Pradesh", propertyType: "hotel", timezone: "Asia/Kolkata", bookingModes: ["overnight", "hourly"],
  ratingAverage: 4.5, ratingCount: 8, minimumPricePaise: 12345, currency: "INR", coverImageUrl: null, amenityCodes: ["wifi", "parking"], propertyAmenityCodes: ["wifi"],
  description: "A quiet family property with a courtyard and individually furnished rooms.", address: { line1: "12 Garden Road", line2: "Civil Lines", landmark: "Near the library", city: "Kanpur", state: "Uttar Pradesh", postalCode: "208001" }, coordinates: { latitude: 26.46, longitude: 80.32 }, checkInTime: "14:00", checkOutTime: "11:00", minimumCheckInAge: 21, identityRequirements: { governmentIdRequired: true }, smokingPolicy: { allowed: false },
  reviewSummary: null, images: Array.from({ length: 8 }, (_, index) => ({ id: String(index), imageUrl: `/broken-${index}.jpg`, altText: `Hotel photo ${index + 1}` })),
};
function offer(totalPaise = 27752) {
  return { id: "flex", name: "Flexible", basePricePaise: 12345, totalPaise, subtotalPaise: 24690, taxPaise: 2963, customerFeePaise: 99, payableNowPaise: 6938, balanceDuePaise: totalPaise - 6938, nights: 2, durationMinutes: 2700, startAt: "2027-01-15T08:30:00Z", endAt: "2027-01-17T05:30:00Z", validUntil: Date.now() + 30_000, paymentMode: "deposit", breakfastIncluded: true, cancellationTerms: { freeCancellation: true, deadline: "2027-01-14T08:30:00Z", feePercent: 0, name: "Flexible" }, cancellation: { name: "Flexible", description: "Cancel free until 24 hours before arrival." } };
}
function availability(totalPaise?: number) {
  return { expiresAt: Date.now() + 30_000, hourlyDurations: [{ roomTypeId: "family", ratePlanId: "hourly", prices: [{ hours: 2, pricePaise: 20000 }, { hours: 3, pricePaise: 30000 }] }], rooms: [{ id: "family", name: "Family room", description: "A spacious room with a desk.", totalInventory: 2, maxAdults: 4, maxChildren: 3, maxInfants: 2, maxOccupancy: 5, roomSizeSqFt: 220, amenityCodes: ["parking"], imageUrl: null, rates: [offer(totalPaise), { ...offer(30000), id: "standard", name: "Standard", breakfastIncluded: false, paymentMode: "full" }] }] };
}
async function fixture(page: Page, query = stayQuery) {
  let saved = false;
  await page.route("**/api/properties/garden", route => route.fulfill({ json: { property } }));
  await page.route("**/api/properties/garden/bookable?**", route => {
    const data = availability();
    if (!new URL(route.request().url()).searchParams.has("checkIn")) return route.fulfill({ json: { ...data, rooms: data.rooms.map(room => ({ ...room, rates: room.rates.map(rate => ({ ...rate, totalPaise: null, subtotalPaise: null, taxPaise: null, payableNowPaise: null, balanceDuePaise: null, startAt: null, endAt: null, validUntil: null, nights: null })) })) } });
    return route.fulfill({ json: data });
  });
  await page.route("**/api/properties/garden/reviews?**", route => {
    const next = new URL(route.request().url()).searchParams.has("cursor");
    return route.fulfill({ json: { reviews: Array.from({ length: next ? 2 : 6 }, (_, index) => ({ id: String(index + (next ? 6 : 0)), reviewerName: `Guest ${index + (next ? 7 : 1)}`, rating: 5, text: `Review number ${index + (next ? 7 : 1)}`, submittedAt: "2026-12-01", photos: [], partnerReply: null })), total: 8, nextCursor: next ? null : "fixture-cursor", hasMore: !next } });
  });
  await page.route(/\/api\/wishlist(?:\/|\?|$)/, route => {
    if (route.request().method() === "PUT") saved = true;
    if (route.request().method() === "DELETE") saved = false;
    return route.fulfill({ json: { propertyIds: saved ? ["hotel"] : [], saved } });
  });
  await page.goto(`/hotels/garden?${query}`);
  await expect(page.getByRole("heading", { name: "Garden Hotel", exact: true })).toBeVisible();
}

test("accurate content, clipboard share, persisted save, full gallery and keyboard containment", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await fixture(page);
  await expect(page.locator("#overview")).toContainText(property.description);
  await expect(page.locator("#amenities")).toContainText("Wi-Fi");
  await expect(page.locator("#amenities")).not.toContainText("Parking");
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Hotel link copied." })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("http://127.0.0.1:3001/hotels/garden");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
  const gallery = page.getByRole("region", { name: "Property photos" });
  await expect(gallery.getByRole("button")).toHaveCount(5);
  await expect(gallery.locator("img").first()).toHaveAttribute("src", "/photo-unavailable.svg");
  await page.getByRole("button", { name: /View all 8 photos/ }).click();
  const dialog = page.getByRole("dialog", { name: "Garden Hotel photo gallery" });
  await expect(dialog.getByRole("button", { name: /^Show photo/ })).toHaveCount(8);
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Show photo 8", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close photo gallery" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: /View all 8 photos/ })).toBeFocused();
});

test("native share gets a clean URL; map and reviews load only when needed and pagination keeps every record", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => { Object.assign(window, { shared: data }); } });
    Object.assign(window, { google: { maps: { importLibrary: async () => ({ Map: class {}, InfoWindow: class { open() {} } }) } } });
  });
  let reviews = 0;
  page.on("request", request => { if (request.url().includes("/reviews?")) reviews++; });
  await fixture(page);
  expect(reviews).toBe(0);
  expect(await page.locator('script[src*="maps.googleapis.com"]').count()).toBe(0);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { shared: ShareData }).shared.url)).toBe("http://127.0.0.1:3001/hotels/garden");
  await page.getByRole("button", { name: "Show map", exact: true }).click();
  await expect(page.getByRole("button", { name: "Show map", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Read all 8 reviews" }).click();
  const dialog = page.getByRole("dialog", { name: "All guest reviews" });
  await expect(dialog.locator("article")).toHaveCount(6);
  await dialog.getByRole("button", { name: "Load more reviews" }).click();
  await expect(dialog.locator("article")).toHaveCount(8);
  await expect(dialog).toContainText("Review number 3");
  await expect(dialog).toContainText("Review number 8");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("guest changes apply once without comparing the previous stay, and checkout preserves infants", async ({ page }) => {
  await fixture(page, `${stayQuery}&roomTypeId=family&ratePlanId=flex&searchTotalPaise=27752`);
  await expect(page.getByRole("link", { name: "Reserve this room" })).toBeVisible();
  await page.locator("#rooms").getByRole("button", { name: "Selected", exact: true }).click();
  let reads = 0;
  let release: (() => void) | undefined;
  await page.route("**/api/properties/garden/bookable?**", async route => {
    reads++;
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: availability(28888) });
  });
  await page.locator("#reserve").getByRole("button", { name: /^Guests/ }).click();
  await page.getByRole("button", { name: "Increase Infants" }).click();
  expect(reads).toBe(0);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(/infants=2/);
  await expect(page.getByRole("status").filter({ hasText: "Updating availability" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Family room", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Reserve this room" })).toHaveCount(0);
  expect(reads).toBe(1);
  release?.();
  await expect(page.locator("#rooms")).toContainText("₹288.88");
  await expect(page.getByText("The room or price from your search has changed.", { exact: false })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("searchTotalPaise")).toBe(false);
  await page.locator("#rooms").getByRole("button", { name: "Select", exact: true }).click();
  await expect(page).toHaveURL(/ratePlanId=flex/);
  await expect(page).toHaveURL(/searchTotalPaise=28888/);
  const reserve = page.getByRole("link", { name: "Reserve this room" });
  await expect(reserve).toBeVisible();
  const params = new URL((await reserve.getAttribute("href"))!, "http://localhost").searchParams;
  expect(params.get("infants")).toBe("2");
  expect(params.get("room")).toBe("family");
  await page.getByText("Price breakdown · 2 nights").click();
  await expect(page.locator("#reserve")).toContainText("₹288.88");
  await expect(page.locator("#reserve")).toContainText("₹69.38");
});

test("a genuine changed search offer warns only after fresh availability finishes", async ({ page }) => {
  await fixture(page);
  let release: (() => void) | undefined;
  await page.route("**/api/properties/garden/bookable?**", async route => {
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: availability(28888) });
  });
  await page.goto(`/hotels/garden?${stayQuery}&roomTypeId=family&ratePlanId=flex&searchTotalPaise=27752`);
  await expect(page.getByText("Loading available rooms...")).toBeVisible();
  const warning = page.getByText("The room or price from your search has changed.", { exact: false });
  await expect(warning).toHaveCount(0);
  release?.();
  await expect(warning).toBeVisible();
  await expect(page.getByRole("link", { name: "Reserve this room" })).toHaveCount(0);
  await page.locator("#rooms").getByRole("button", { name: "Select", exact: true }).click();
  await expect(warning).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Reserve this room" })).toBeVisible();
});

test("switching to hourly stays discards the overnight offer in both the header and booking panel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const trigger of ["Hourly Stays", "Hourly stay"]) {
    await fixture(page, `${stayQuery}&roomTypeId=family&ratePlanId=flex&searchTotalPaise=27752`);
    await page.locator("#rooms").getByRole("button", { name: "Selected", exact: true }).click();
    await page.route("**/api/properties/garden/bookable?**", route => {
      const data = availability(20000);
      data.rooms[0].rates = [{ ...offer(20000), id: "hourly", name: "Hourly rate" }];
      return route.fulfill({ json: data });
    });
    await page.getByRole("button", { name: trigger, exact: true }).click();
    await expect(page).toHaveURL(/bookingMode=hourly/);
    await expect(page.locator("#rooms")).toContainText("₹200");
    await expect(page.getByText("The room or price from your search has changed.", { exact: false })).toHaveCount(0);
    const params = new URL(page.url()).searchParams;
    for (const key of ["roomTypeId", "ratePlanId", "searchTotalPaise"]) expect(params.has(key)).toBe(false);
    await expect(page.getByRole("link", { name: "Reserve this room" })).toHaveCount(0);
    await page.unroute("**/api/properties/garden/bookable?**");
  }
});

test("old hourly URLs with an overnight selection do not show a changed-offer warning", async ({ page }) => {
  await fixture(page);
  await page.route("**/api/properties/garden/bookable?**", route => {
    const data = availability(20000);
    data.rooms[0].rates = [{ ...offer(20000), id: "hourly", name: "Hourly rate" }];
    return route.fulfill({ json: { ...data, ratePlanModes: { flex: "overnight", hourly: "hourly" } } });
  });
  await page.goto("/hotels/garden?checkIn=2027-01-15&bookingMode=hourly&arrivalTime=10%3A00&durationMinutes=180&adults=2&children=0&infants=1&roomTypeId=family&ratePlanId=flex&searchTotalPaise=27752");
  await expect(page.locator("#rooms")).toContainText("₹200");
  await expect(page.getByText("The room or price from your search has changed.", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Reserve this room" })).toHaveCount(0);
  await page.locator("#rooms").getByRole("button", { name: "Select", exact: true }).click();
  await expect(page).toHaveURL(/ratePlanId=hourly/);
});

test("no reviews, failed maps and availability errors stay distinct, with no unrelated photos", async ({ page }) => {
  await fixture(page);
  await page.route("**/api/properties/garden", route => route.fulfill({ json: { property: { ...property, ratingAverage: 0, ratingCount: 0 } } }));
  await page.route("**/api/properties/garden/reviews?**", route => route.fulfill({ json: { reviews: [], total: 0, nextCursor: null } }));
  await page.reload();
  await expect(page.getByRole("link", { name: "No reviews yet", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show map", exact: true }).click();
  await expect(page.getByText(/The map could not load/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Get directions" })).toHaveAttribute("href", /destination=/);
  await page.route("**/api/properties/garden/bookable?**", route => route.fulfill({ status: 503, json: { error: "TEMPORARILY_UNAVAILABLE" } }));
  await page.locator("#reserve").getByRole("button", { name: /^Guests/ }).click();
  await page.getByRole("button", { name: "Increase Adults" }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Unable to update rooms" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Family room", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Reserve this room" })).toHaveCount(0);
});

test("undated prices are starting prices and invalid stays cannot reserve", async ({ page }) => {
  await fixture(page, "adults=2&children=0&infants=1");
  await expect(page.locator("#rooms")).toContainText("From ₹123.45");
  await expect(page.locator("#rooms")).toContainText("per night");
  await expect(page.locator("#reserve")).toContainText("Choose dates to check availability and the final total.");
  await expect(page.getByRole("link", { name: "Reserve this room" })).toHaveCount(0);
  await page.goto("/hotels/garden?checkIn=2027-01-15&adults=0");
  await expect(page.getByRole("alert").filter({ hasText: "Check your dates and guest counts" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Reserve this room" })).toHaveCount(0);
});

test("expiry revalidates on interaction without polling or hiding rooms", async ({ page }) => {
  await page.clock.install();
  let requests = 0;
  page.on("request", request => { if (request.url().includes("/bookable?")) requests++; });
  await fixture(page, `${stayQuery}&roomTypeId=family&ratePlanId=flex&searchTotalPaise=27752`);
  await expect(page.getByRole("link", { name: "Reserve this room" })).toBeVisible();
  await page.clock.runFor(30_001);
  await expect(page.getByRole("link", { name: "Reserve this room" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Family room", exact: true })).toBeVisible();
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "Share", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect.poll(() => requests).toBe(2);
  await expect(page.getByRole("link", { name: "Reserve this room" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("dates apply only after a complete range and hourly settings debounce into one request", async ({ page }) => {
  await fixture(page);
  let requests = 0;
  page.on("request", request => { if (request.url().includes("/bookable?")) requests++; });
  await page.locator("#reserve").getByRole("button", { name: /^Check-in/ }).click();
  const calendar = page.getByRole("dialog", { name: "Choose stay dates" });
  await calendar.getByRole("button", { name: "18", exact: true }).click();
  expect(requests).toBe(0);
  await calendar.getByRole("button", { name: "20", exact: true }).click();
  await expect(page).toHaveURL(/checkIn=2027-01-18/);
  await expect(page).toHaveURL(/checkOut=2027-01-20/);
  await expect.poll(() => requests).toBe(1);
  await page.locator("#reserve").getByRole("button", { name: "Hourly stay", exact: true }).click();
  await expect(page).toHaveURL(/bookingMode=hourly/);
  await expect.poll(() => requests).toBe(2);
  await page.getByLabel("Local arrival time", { exact: true }).selectOption("11:00");
  await page.getByLabel("Guest duration", { exact: true }).selectOption("120");
  await expect(page).toHaveURL(/arrivalTime=11%3A00/);
  await expect(page).toHaveURL(/durationMinutes=120/);
  expect(requests).toBe(3);
});

test("initial loading, no matching rooms, temporary failures and share errors have recovery feedback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("DENIED"); } } });
  });
  await fixture(page);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Unable to share this hotel" })).toBeVisible();
  let release: (() => void) | undefined;
  await page.route("**/api/properties/garden/bookable?**", async route => {
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: { expiresAt: Date.now() + 30_000, rooms: [], hourlyDurations: [] } });
  });
  await page.reload();
  await expect(page.getByText("Loading available rooms...")).toBeVisible();
  release?.();
  await expect(page.getByText(/No rooms match this stay and guest count/)).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.route("**/api/properties/garden", route => route.fulfill({ status: 503, json: { error: "UNAVAILABLE" } }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Unable to load this property" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
});

test("partner saves explicit and unspecified policies without changing amenities", async ({ page }) => {
  let saved: Record<string, unknown> = {};
  await page.route("**/api/partner/properties/hotel", async route => { saved = route.request().postDataJSON(); await route.fulfill({ json: { ok: true } }); });
  await page.goto("/partner-fixture");
  await expect(page.getByLabel("Children welcome")).toHaveValue("false");
  await expect(page.getByLabel("Government ID required at check-in")).toHaveValue("false");
  await page.getByLabel("Pets welcome").selectOption("true");
  await page.getByLabel("Children welcome").selectOption("");
  await page.getByLabel("Additional house rules (optional)").fill("Quiet hours after 10pm.");
  await page.getByRole("button", { name: "Save guest policies", exact: true }).click();
  await expect.poll(() => saved.petPolicy).toEqual({ allowed: true });
  expect(saved.childrenPolicy).toEqual({ allowed: null });
  expect(saved.identityRequirements).toEqual({ governmentIdRequired: false });
  expect(saved.minimumCheckInAge).toBe(21);
  expect(saved).not.toHaveProperty("amenityIds");
});

test("desktop and mobile retain the theme without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fixture(page);
  await page.screenshot({ path: "/tmp/helpkey-hotel-desktop.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("link", { name: "Choose room", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Choose room", exact: true }).click();
  await page.locator("#reserve").getByRole("button", { name: /^Check-in/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: "/tmp/helpkey-hotel-mobile.png", fullPage: true });
});
