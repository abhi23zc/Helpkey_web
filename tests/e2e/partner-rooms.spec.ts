import { test, expect, type Page } from "@playwright/test";
import { buildRoomAmenityOptions } from "../../lib/partner/room-amenities";
const room = {
  id: "room-one",
  name: "Deluxe",
  description: "A comfortable double room",
  status: "active",
  inventory: 2,
  maxAdults: 2,
  maxChildren: 0,
  maxInfants: 0,
  bedConfigurations: [{ bedType: "double", count: 1 }],
  roomSizeSqFt: 200,
  bathroomType: "private",
  amenityIds: [],
  mediaIds: [],
  coverMediaId: null,
  bookingModes: ["overnight", "hourly"],
  cleaningBufferMinutes: 30,
};
const rate = {
  id: "rate-one",
  roomTypeId: room.id,
  name: "Flexible",
  code: "FLEX",
  status: "active",
  bookingMode: "overnight",
  pricingModel: "nightly",
  basePricePaise: 20000,
  durationPrices: [],
  cancellationPolicyId: "policy-one",
};
async function fixture(page: Page, hourly = false) {
  let housekeepingStatus = "dirty",
    price = 20000;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let body: unknown;
    if (url.pathname === "/api/partner/dashboard")
      body = {
        user: { uid: "owner", fullName: "Hotel Owner" },
        businessName: "Hotel Group",
        currency: "INR",
        properties: [
          {
            id: "hotel-one",
            name: "First Hotel",
            status: "active",
            approvalStatus: "approved",
            isBookable: true,
            timezone: "Asia/Kolkata",
          },
        ],
      };
    else if (url.pathname === "/api/notifications")
      body = { notifications: [], unreadCount: 0 };
    else if (url.pathname.endsWith("/rooms-workspace")) {
      if (route.request().method() === "POST") {
        const request = route.request().postDataJSON();
        if (request.action === "bulk" && request.input.action === "preview")
          body = { previewId: "preview-one", cells: request.input.input.cells };
        else if (request.action === "bulk") {
          price = 35000;
          body = { ok: true };
        } else if (request.action === "housekeeping") {
          housekeepingStatus = request.input.status;
          body = { ok: true };
        } else if (request.action === "availability") body = { available: 2 };
        else body = { ok: true };
      } else if (url.searchParams.has("unitId")) {
        body = { events: [] };
      } else {
        const start = url.searchParams.get("start")!;
        body = {
          features: { calendar: true, housekeeping: true },
          interval: true,
          timezone: "Asia/Kolkata",
          dates: Array.from(
            {
              length:
                Math.round(
                  (Date.parse(url.searchParams.get("end")!) -
                    Date.parse(start)) /
                    86400000,
                ) + 1,
            },
            (_, i) =>
              new Date(Date.parse(start) + i * 86400000)
                .toISOString()
                .slice(0, 10),
          ),
          calendars: [],
          prices: [{ ratePlanId: rate.id, date: start, basePricePaise: price }],
          units: [
            {
              id: "unit-one",
              label: "101",
              roomTypeId: room.id,
              status: "active",
              occupied: false,
              housekeepingStatus,
              revision: 0,
            },
          ],
          blocks: [],
        };
      }
    } else if (url.pathname === "/api/partner/properties/hotel-one")
      body = {
        property: {
          id: "hotel-one",
          name: "First Hotel",
          slug: "first-hotel",
          timezone: "Asia/Kolkata",
          inventoryEngine: "interval_v1",
          bookingModes: ["overnight", "hourly"],
          status: "active",
          approvalStatus: "approved",
          currency: "INR",
          amenityIds: [],
          cancellationPolicyIds: [],
          description: "Test hotel",
          coverMediaId: null,
        },
        roomTypes: [room],
        ratePlans: [
          hourly
            ? {
                ...rate,
                bookingMode: "hourly",
                pricingModel: "duration",
                durationPrices: [
                  { hours: 1, pricePaise: 20000 },
                  { hours: 3, pricePaise: 50000 },
                ],
              }
            : rate,
        ],
        policies: [
          {
            id: "policy-one",
            name: "Flexible cancellation",
            description:
              "Cancel before arrival according to the property policy.",
          },
        ],
        media: [],
        documents: [],
      };
    else if (url.pathname === "/api/partner/physical-units")
      body = { units: [], features: { allocation: true } };
    else body = {};
    await route.fulfill({ json: body });
  });
}
for (const width of [390, 768, 1366])
  test(`room calendar and housekeeping at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page);
    await page.goto(
      "/partner/rooms?propertyId=hotel-one&date=2026-11-03&section=calendar",
    );
    await expect(
      page.getByRole("heading", { name: "Availability & rates", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Rooms calendar date range" }),
    ).toContainText("3 Nov 2026 – 9 Nov 2026");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/partner-dashboard/rooms-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Housekeeping", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "101", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Update cleaning", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Status", { exact: true })
      .selectOption("inspected");
    await dialog.getByRole("button", { name: "Save cleaning status" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.locator("p").filter({ hasText: /^inspected$/ }),
    ).toBeVisible();
  });
test("previews understandable date prices and applies changes", async ({
  page,
}) => {
  await fixture(page);
  await page.goto(
    "/partner/rooms?propertyId=hotel-one&date=2026-11-03&section=calendar",
  );
  await page.getByLabel("Rate plan", { exact: true }).selectOption(rate.id);
  await page.getByLabel("Nightly room price (₹)").fill("350");
  await page
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Flexible: ₹350/).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm changes" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("status")).toContainText("Calendar updated");
});
test("room setup preserves bed configurations and protects unsaved edits", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/partner/rooms?propertyId=hotel-one&date=2026-11-03");
  await expect(
    page.getByRole("heading", { name: "Rooms", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Configured capacity", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Preview Guest View" }),
  ).toHaveAttribute("href", "/hotels/first-hotel");
  await page.getByRole("button", { name: "Edit room", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Room name", { exact: true }).fill("Updated Deluxe");
  page.once("dialog", (d) => d.dismiss());
  await dialog.getByRole("button", { name: "Close panel" }).click();
  await expect(dialog).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await dialog.getByRole("button", { name: "Close panel" }).click();
  await expect(dialog).not.toBeVisible();
});
test("calendar range stays shareable without header date navigation", async ({
  page,
}) => {
  await fixture(page);
  await page.goto(
    "/partner/rooms?propertyId=hotel-one&date=2026-11-03&section=calendar",
  );
  await page.getByRole("button", { name: "Rooms calendar date range" }).click();
  const picker = page.getByRole("dialog", {
    name: "Rooms calendar date range",
  });
  await picker.getByRole("button", { name: /November 17th, 2026/ }).click();
  await picker.getByRole("button", { name: /November 20th, 2026/ }).click();
  await picker.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(/calendarStart=2026-11-17/);
  await expect(page).toHaveURL(/calendarEnd=2026-11-20/);
  await expect(
    page.getByRole("button", { name: "Dashboard reporting date" }),
  ).toHaveCount(0);
});

for (const width of [390, 1366])
  test(`shared date picker applies and cancels at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page);
    await page.goto(
      "/partner/rooms?propertyId=hotel-one&date=2026-11-03&section=calendar",
    );
    await page
      .getByRole("button", { name: "Rooms calendar date range" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Rooms calendar date range",
    });
    await expect(dialog).toBeVisible();
    await page.screenshot({
      path: `test-results/partner-dashboard/date-picker-${width}.png`,
    });
    expect(await dialog.locator(".rdp-month").count()).toBe(
      width < 640 ? 1 : 2,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page).not.toHaveURL(/calendarEnd/);
    await page
      .getByRole("button", { name: "Rooms calendar date range" })
      .click();
    await dialog.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page).toHaveURL(/calendarEnd=2026-11-09/);
    await expect(
      page.getByRole("button", { name: "Dashboard reporting date" }),
    ).toHaveCount(0);
  });

for (const width of [390, 768, 1366])
  test(`price option editing preserves precision and drafts at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page);
    let saved: Record<string, unknown> | undefined;
    await page.route(
      "**/api/partner/properties/hotel-one/rate-plans/**",
      async (route) => {
        saved = route.request().postDataJSON();
        await route.fulfill({ json: { ratePlan: { ...rate, ...saved } } });
      },
    );
    await page.goto("/partner/rooms?propertyId=hotel-one&date=2026-11-03");
    await page
      .getByRole("button", { name: "Manage prices", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Stay and price", exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Overnight stays", { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText("Code", { exact: true })).toHaveCount(0);
    const price = dialog.getByLabel("Price per room, per night (₹)");
    await price.fill("700.50");
    await dialog
      .getByText("Additional charges and stay rules", { exact: false })
      .first()
      .click();
    await dialog.getByLabel("Tax added to the room price (%)").fill("12.34");
    await dialog.getByLabel("Additional charge per booking (₹)").fill("10.51");
    await dialog.getByLabel("When the guest pays").selectOption("deposit");
    await dialog.getByLabel("Percentage paid when booking (%)").fill("25.55");
    await expect(
      dialog.getByRole("region", { name: "Example guest price" }),
    ).toContainText("₹797.45");
    await dialog.getByLabel("When the guest pays").selectOption("full");
    await expect(
      dialog.getByLabel("Percentage paid when booking (%)"),
    ).toHaveCount(0);
    await dialog.getByLabel("When the guest pays").selectOption("deposit");
    await expect(
      dialog.getByLabel("Percentage paid when booking (%)"),
    ).toHaveValue("25.55");
    page.once("dialog", (d) => d.dismiss());
    await dialog.getByRole("button", { name: "New price option" }).click();
    await expect(price).toHaveValue("700.50");
    page.once("dialog", (d) => d.dismiss());
    await dialog.getByRole("button", { name: "Close panel" }).click();
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("button", { name: "Save price option", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toContainText(
      "Price option saved",
    );
    expect(saved).toMatchObject({
      basePricePaise: 70050,
      taxBasisPoints: 1234,
      customerFeePaise: 1051,
      depositBasisPoints: 2555,
    });
    expect(saved).not.toHaveProperty("code");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/partner-dashboard/price-option-${width}.png`,
    });
  });

for (const width of [390, 768, 1366])
  test(`hourly price panel stays clean and keyboard accessible at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page, true);
    await page.goto("/partner/rooms?propertyId=hotel-one&date=2026-11-03");
    await page
      .getByRole("button", { name: "Manage prices", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText("Hourly stays", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Flexible", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      dialog.getByRole("button", { name: "Prices", exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Save price option", exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/partner-dashboard/hourly-panel-${width}.png`,
    });
    const summary = dialog.locator("summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(dialog.getByLabel("Earliest check-in")).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Save price option", exact: true }),
    ).toBeInViewport();
  });

async function amenitiesFixture(page: Page) {
  await fixture(page);
  const state = {
    rooms: [
      { ...room, id: "normal", name: "Normal", amenityIds: ["catalog-wifi", "Legacy lamp"] },
      { ...room, id: "standard", name: "Standard", amenityIds: [] as string[] },
      { ...room, id: "deluxe", name: "Deluxe", amenityIds: ["bathtub", "balcony", "air_conditioning", "wifi", "tv"] },
    ],
    patches: [] as { id: string; body: { amenityIds: string[] } }[],
    failNext: false,
    hold: undefined as Promise<void> | undefined,
  };
  await page.route("**/api/partner/properties/hotel-one?*", route => route.fulfill({ json: {
    amenityOptions: buildRoomAmenityOptions([{ id: "catalog-wifi", code: "wifi", name: "Wi-Fi" }]),
    property: { id: "hotel-one", name: "First Hotel", slug: "first-hotel", timezone: "Asia/Kolkata", inventoryEngine: "interval_v1", status: "active", approvalStatus: "approved", currency: "INR", amenityIds: ["parking"], cancellationPolicyIds: [], coverMediaId: null },
    roomTypes: state.rooms, ratePlans: state.rooms.map(item => ({ ...rate, id: `rate-${item.id}`, roomTypeId: item.id })), policies: [], media: [], documents: [],
  } }));
  await page.route("**/api/partner/properties/hotel-one/room-types/*", async route => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    const body = route.request().postDataJSON();
    state.patches.push({ id, body });
    if (state.hold) await state.hold;
    if (state.failNext) { state.failNext = false; return route.fulfill({ status: 422, json: { error: "Save failed. Try again." } }); }
    const selected = state.rooms.find(item => item.id === id)!;
    Object.assign(selected, body);
    await route.fulfill({ json: { ok: true, roomType: selected } });
  });
  await page.goto("/partner/rooms?propertyId=hotel-one&date=2026-11-03");
  await expect(page.getByRole("button", { name: "Amenities for Normal", exact: true })).toBeVisible();
  return state;
}

for (const width of [390, 768, 1366]) test(`room amenities stay independent and persist at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const state = await amenitiesFixture(page);
  await page.getByRole("button", { name: "Amenities for Normal", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Normal", exact: true });
  await expect(dialog).toContainText("Available in every Normal room.");
  await expect(dialog.getByRole("checkbox", { name: "Wi-Fi", exact: true })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "Legacy Lamp", exact: true })).toBeChecked();
  await dialog.getByRole("searchbox", { name: "Search amenities" }).fill("bathtub");
  await dialog.getByRole("checkbox", { name: "Bathtub", exact: true }).check();
  await dialog.getByRole("searchbox", { name: "Search amenities" }).fill("no-such-amenity");
  await expect(dialog).toContainText("No amenities match");
  await dialog.getByRole("searchbox", { name: "Search amenities" }).clear();
  await expect(dialog).toContainText("3 selected");
  await page.screenshot({ path: `/private/tmp/helpkey-room-amenities/ui-${width}.png`, animations: "disabled" });
  const bounds = await dialog.boundingBox();
  expect(bounds?.x).toBe(0);
  expect(bounds?.y).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.getByRole("button", { name: "Save amenities", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Room amenities saved.");
  expect(state.patches.at(-1)).toEqual({ id: "normal", body: { amenityIds: ["catalog-wifi", "Legacy lamp", "bathtub"] } });
  expect(state.rooms.find(item => item.id === "standard")?.amenityIds).toEqual([]);
  await dialog.getByRole("button", { name: "Close panel" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Amenities for Normal", exact: true }).click();
  await expect(dialog.getByRole("checkbox", { name: "Bathtub", exact: true })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "Legacy Lamp", exact: true })).toBeChecked();
});

test("copy merges into a draft, failed saves retain it, and saving prevents close", async ({ page }) => {
  const state = await amenitiesFixture(page);
  await page.getByRole("button", { name: "Amenities for Normal", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Normal", exact: true });
  await dialog.getByRole("combobox", { name: "Copy from room type" }).selectOption("deluxe");
  await expect(dialog).toContainText("6 selected");
  expect(state.patches).toHaveLength(0);
  await dialog.getByRole("combobox", { name: "Copy from room type" }).selectOption("deluxe");
  await expect(dialog).toContainText("6 selected");
  state.failNext = true;
  await dialog.getByRole("button", { name: "Save amenities", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Save failed");
  await expect(dialog.getByRole("checkbox", { name: "Balcony", exact: true })).toBeChecked();
  let release!: () => void;
  state.hold = new Promise<void>(resolve => { release = resolve; });
  await dialog.getByRole("button", { name: "Save amenities", exact: true }).click();
  await expect(dialog.getByRole("checkbox", { name: "Balcony", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Close panel" }).click();
  await expect(dialog).toBeVisible();
  release();
  await expect(dialog.getByRole("status").filter({ hasText: "Room amenities saved." })).toBeVisible();
  expect(state.rooms.find(item => item.id === "normal")?.amenityIds).toEqual(["catalog-wifi", "Legacy lamp", "bathtub", "balcony", "air_conditioning", "tv"]);
});

test("search is not dirty; clearing requires save and unsaved close can be cancelled", async ({ page }) => {
  const state = await amenitiesFixture(page);
  await page.getByRole("button", { name: "Amenities for Normal", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Normal", exact: true });
  await dialog.getByRole("searchbox", { name: "Search amenities" }).fill("wifi");
  await dialog.getByRole("button", { name: "Close panel" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Amenities for Normal", exact: true }).click();
  await dialog.getByRole("button", { name: "Clear all", exact: true }).click();
  page.once("dialog", prompt => prompt.dismiss());
  await dialog.getByRole("button", { name: "Close panel" }).click();
  await expect(dialog).toBeVisible();
  expect(state.rooms[0].amenityIds).toEqual(["catalog-wifi", "Legacy lamp"]);
  await dialog.getByRole("button", { name: "Save amenities", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Room amenities saved.");
  await dialog.getByRole("button", { name: "Close panel" }).click();
  await expect(page.getByText("No amenities configured", { exact: true })).toHaveCount(2);
});
