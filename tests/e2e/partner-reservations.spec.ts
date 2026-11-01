import { test, expect, type Page } from "@playwright/test";
import type { StayRequest } from "../../lib/stay/contracts";
const booking = {
  id: "booking-one",
  propertyId: "hotel-one",
  confirmationCode: "KNP123456",
  propertyName: "First Hotel",
  roomTypeId: "room-one",
  roomName: "Deluxe",
  ratePlanName: "Flexible",
  leadGuest: {
    name: "Ada Guest",
    email: "ada@example.com",
    phone: "+919876543210",
  },
  bookingStatus: "confirmed",
  paymentStatus: "pay_at_property",
  paymentMethod: "pay_at_property",
  bookingMode: "overnight",
  checkIn: "2026-11-03",
  checkOut: "2026-11-04",
  startAt: "2026-11-03T08:30:00Z",
  endAt: "2026-11-04T05:30:00Z",
  timezone: "Asia/Kolkata",
  adults: 1,
  children: 0,
  nights: 1,
  totalPaise: 200000,
  paidPaise: 0,
  balanceDuePaise: 200000,
  currency: "INR",
  customizations: [],
  stayRevision: 0,
  source: "web",
  refundedPaise: 0,
};
async function fixture(
  page: Page,
  overrides: Record<string, unknown> = {},
  operationOverrides: Record<string, unknown> = {},
  readiness?: { assigned: boolean; status: string },
) {
  let currentBooking = { ...booking, ...overrides };
  let events: object[] = [],
    units: object[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()),
      method = route.request().method();
    let body: unknown;
    if (url.pathname === "/api/partner/dashboard")
      body = {
        user: { uid: "owner", fullName: "Hotel Owner" },
        businessName: "Hotel Group",
        currency: "INR",
        properties: ["hotel-one", "hotel-two"].map((id) => ({
          id,
          name: id === "hotel-one" ? "First Hotel" : "Second Hotel",
          status: "active",
          approvalStatus: "approved",
          isBookable: true,
          timezone: "Asia/Kolkata",
        })),
      };
    else if (url.pathname === "/api/notifications")
      body = { notifications: [], unreadCount: 0 };
    else if (url.pathname === "/api/partner/bookings/export") {
      await route.fulfill({
        contentType: "text/csv",
        headers: {
          "Content-Disposition": 'attachment; filename="reservations.csv"',
        },
        body: '"Reference","Guest"\n"KNP123456","Ada Guest"',
      });
      return;
    } else if (url.pathname === "/api/partner/bookings" && method === "POST")
      body = {
        bookingId: booking.id,
        confirmationCode: booking.confirmationCode,
      };
    else if (url.pathname === "/api/partner/bookings")
      body = {
        bookings:
          url.searchParams.get("view") === "cancelled" ? [] : [currentBooking],
        totalCount: 21,
        nextCursor: url.searchParams.has("cursor") ? null : "next-cursor",
        generatedAt: "2026-11-03T05:00:00Z",
        timezone: "Asia/Kolkata",
        metrics: {
          arrivals: 1,
          departures: 0,
          in_house: 0,
          requests: 0,
          overdue: 0,
        },
        tabCounts: { all: 21, arrivals: 1, cancelled: 0 },
        roomTypes: [{ id: "room-one", name: "Deluxe", status: "active" }],
        ratePlans: [],
        features: { allocation: true, payments: true, amendments: true },
      };
    else if (url.pathname.endsWith("/operations")) {
      if (method === "POST") {
        const input = route.request().postDataJSON();
        events = [
          {
            id: `event-${events.length}`,
            type:
              input.action === "note" ? "staff_note" : "property_collection",
            text: input.text,
            amountPaise: input.amountPaise,
            actorId: "owner",
            createdAt: "2026-11-03T05:00:00Z",
          },
          ...events,
        ];
        body = { ok: true };
      } else
        body = {
          events,
          payments: [],
          onlinePayments: [],
          refunds: [],
          units,
          features: { allocation: true, payments: true, amendments: true },
          revision: 0,
          assignedUnitId: null,
          assignedUnitLabel: null,
          refundExcessPaise: 0,
          nextEventCursor: null,
          ...operationOverrides,
        };
    } else if (url.pathname.endsWith("/amendment"))
      body =
        method === "PATCH"
          ? { ok: true }
          : {
              token: "signed-preview",
              previousTotalPaise: 200000,
              totalPaise: 300000,
              amountToCollectPaise: 300000,
              refundableExcessPaise: 0,
              roomName: "Deluxe",
              startAt: booking.startAt,
              endAt: booking.endAt,
              assignmentCleared: false,
            };
    else if (url.pathname === "/api/partner/physical-units") {
      if (method === "POST") {
        const input = route.request().postDataJSON();
        units = [{ id: "unit-one", ...input }];
        body = { id: "unit-one" };
      } else body = { units };
    } else if (url.pathname === "/api/partner/properties/hotel-one")
      body = {
        roomTypes: [{ id: "room-one", name: "Deluxe", status: "active" }],
        ratePlans: [
          {
            id: "rate-one",
            name: "Flexible",
            basePricePaise: 100000,
            pricingModel: "nightly",
            taxBasisPoints: 1800,
            customerFeePaise: 5000,
            roomTypeId: "room-one",
            bookingMode: "overnight",
            status: "active",
          },
        ],
      };
    else if (url.pathname.endsWith("/booking-one"))
      body = { booking: currentBooking, readiness };
    else if (url.pathname.endsWith("/status")) {
      currentBooking = {
        ...currentBooking,
        bookingStatus: route.request().postDataJSON().status,
      };
      body = { ok: true };
    } else body = { events: [], bookings: [], roomTypes: [], ratePlans: [] };
    await route.fulfill({ json: body });
  });
  return {
    setBooking: (patch: Record<string, unknown>) => {
      currentBooking = { ...currentBooking, ...patch };
    },
  };
}
for (const width of [390, 768, 1366])
  test(`usable reservations at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page);
    await page.goto(
      "/partner/reservations?propertyId=hotel-one&date=2026-11-03",
    );
    await expect(
      page.getByRole("heading", { name: "Reservations", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Manage", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Show", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Reservation date range" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reservation date range" }),
    ).toContainText("3 Nov 2026 – 9 Nov 2026");
    await page.getByRole("button", { name: "Manage", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Reservation details" }),
    ).toBeVisible();
    await page.getByText("Add staff note", { exact: false }).click();
    await page
      .getByLabel("New note", { exact: true })
      .fill("Guest needs a quiet room");
    await page.getByRole("button", { name: "Save note", exact: true }).click();
    await expect(
      page
        .locator("details")
        .filter({
          has: page.locator("summary").filter({ hasText: "Add staff note" }),
        })
        .getByText("Guest needs a quiet room", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close panel" }).click();
    await page.screenshot({
      path: `test-results/partner-dashboard/reservations-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test("filters, debounced search, pagination, export and browser history work", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/partner/reservations?propertyId=hotel-one&date=2026-11-03");
  await page.getByRole("button", { name: "Reservation date range" }).click();
  const datePanel = page.getByRole("dialog", {
    name: "Reservation date range",
  });
  await datePanel.getByRole("button", { name: /November 1st, 2026/ }).click();
  await datePanel.getByRole("button", { name: /November 3rd, 2026/ }).click();
  await datePanel.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(/from=2026-11-01/);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page).toHaveURL(/cursor=next-cursor/);
  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(page).not.toHaveURL(/cursor=/);
  await page.getByLabel("Search reservations", { exact: true }).fill("Ada");
  await expect(page).toHaveURL(/q=Ada/);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  expect((await download).suggestedFilename()).toContain("reservations");
  await page
    .getByRole("navigation", { name: "Reservation views" })
    .getByRole("button", { name: /Cancelled/ })
    .click();
  await expect(page.getByText("No reservations match this view")).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("button", { name: "Manage", exact: true }),
  ).toBeVisible();
});
test("collection confirmation works without offering reservation edits", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/partner/reservations?propertyId=hotel-one&date=2026-11-03");
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await page.getByText("Payment details", { exact: true }).click();
  await page
    .getByRole("button", { name: "Record collection", exact: true })
    .click();
  await page.getByLabel("Amount (₹)", { exact: true }).fill("500");
  await page
    .getByRole("button", { name: "Review collection", exact: true })
    .click();
  const collect = page.waitForRequest(
    (r) => r.url().endsWith("/operations") && r.method() === "POST",
  );
  await page
    .getByRole("button", { name: "Confirm payment action", exact: true })
    .click();
  expect((await collect).postDataJSON()).toMatchObject({
    action: "collect",
    amountPaise: 50000,
    method: "cash",
  });
  await expect(
    page.getByRole("button", { name: "Edit reservation", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Preview new price", exact: true }),
  ).toHaveCount(0);
});
test("shows recoverable errors without fabricated reservations", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/partner/bookings?**", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: {
          message: "Reservations temporarily unavailable",
          code: "UNAVAILABLE",
        },
      },
    }),
  );
  await page.goto("/partner/reservations?propertyId=hotel-one&date=2026-11-03");
  await expect(page.getByRole("alert")).toContainText(
    "Reservations temporarily unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Manage", exact: true }),
  ).toHaveCount(0);
});

test("manual bookings show taxes and fees, submit an idempotency key and open the saved reservation", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/partner/reservations?propertyId=hotel-one&date=2026-11-03");
  await page
    .getByRole("button", { name: "New reservation", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Add Manual Booking",
    exact: true,
  });
  await dialog.getByLabel("Guest name", { exact: true }).fill("Ada Guest");
  await page.clock.setFixedTime(new Date("2026-11-01T06:00Z"));
  for (const [label, day] of [
    ["Check-in date", "3rd"],
    ["Check-out date", "4th"],
  ]) {
    await dialog.getByRole("button", { name: label, exact: true }).click();
    const picker = page.getByRole("dialog", { name: label, exact: true });
    await picker
      .getByRole("button", { name: new RegExp(`November ${day}, 2026`) })
      .click();
    await picker.getByRole("button", { name: "Apply", exact: true }).click();
  }
  await dialog
    .getByLabel("Room category", { exact: true })
    .selectOption("room-one");
  await dialog
    .getByLabel("Published rate", { exact: true })
    .selectOption("rate-one");
  await dialog
    .getByLabel("Payment status", { exact: true })
    .selectOption("paid");
  await expect(dialog.getByText(/Tax ₹180/)).toBeVisible();
  const created = page.waitForRequest(
    (r) => r.url().endsWith("/api/partner/bookings") && r.method() === "POST",
  );
  await dialog
    .getByRole("button", { name: "Create Booking", exact: true })
    .click();
  const request = await created;
  expect(request.postDataJSON()).toMatchObject({
    expectedTotalPaise: 123000,
    paymentMethod: "paid",
    collectionMethod: "cash",
  });
  expect(request.headers()["idempotency-key"]).toBeTruthy();
  await dialog.getByRole("button", { name: /View Reservation/ }).click();
  await expect(
    page.getByRole("heading", { name: "Reservation details", exact: true }),
  ).toBeVisible();
});
test("simple filters distinguish presets, all dates, advanced filters and reset", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-03T06:00Z"));
  await fixture(page);
  await page.goto("/partner/reservations?propertyId=hotel-one&date=2026-11-03");
  await expect(page.getByLabel("Show", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Next 7 days", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reservation date range" }),
  ).toContainText("3 Nov 2026 – 3 Nov 2026");
  await page.getByRole("button", { name: "Next 7 days", exact: true }).click();
  await expect(page).toHaveURL(/to=2026-11-09/);
  await expect(
    page.getByRole("button", { name: "Next 7 days", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Today", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "All dates", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reservation date range" }),
  ).toContainText("Choose dates");
  await page.getByText("More filters", { exact: true }).click();
  await page
    .getByLabel("Booking status", { exact: true })
    .selectOption("confirmed");
  await page.getByLabel("Stay type", { exact: true }).selectOption("hourly");
  await expect(
    page.getByText("More filters (2)", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await expect(page.getByLabel("Filter by", { exact: true })).toHaveValue(
    "stay",
  );
  await expect(
    page.getByRole("button", { name: "Reset filters", exact: true }),
  ).toHaveCount(0);
});

for (const width of [390, 768, 1366]) {
  test(`focused reservation overview and pinned actions at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.setFixedTime(new Date("2026-11-03T09:00Z"));
    await fixture(page, {
      paidPaise: 200000,
      balanceDuePaise: 0,
      paymentStatus: "paid",
      preCheckin: {
        status: "submitted",
        arrivalChoice: "unknown",
        expectedArrivalAt: null,
        notes: "Train schedule pending",
        submittedAt: "2026-11-01T09:00Z",
      },
    });
    await page.goto(
      "/partner/reservations?propertyId=hotel-one&date=2026-11-03",
    );
    await page.getByRole("button", { name: "Manage", exact: true }).click();
    const drawer = page.getByRole("dialog", {
      name: "Reservation details",
      exact: true,
    });
    await expect(
      drawer.getByRole("heading", { name: "Ada Guest", exact: true }),
    ).toBeVisible();
    await expect(
      drawer.getByText("Arrival time: Not sure yet", { exact: true }),
    ).toBeVisible();
    await expect(
      drawer.getByText("Train schedule pending", { exact: true }),
    ).toBeVisible();
    await expect(
      drawer.getByText("Online pre-check-in submitted", { exact: false }),
    ).toBeVisible();
    await expect(
      drawer.getByRole("button", { name: "Check in", exact: true }),
    ).toBeEnabled();
    await expect(
      drawer.getByLabel("Physical room", { exact: true }),
    ).toHaveCount(0);
    await expect(drawer.getByLabel("New note", { exact: true })).toBeHidden();
    await expect(drawer.getByLabel("Amount (₹)", { exact: true })).toBeHidden();
    await expect(drawer.getByText("Refunded", { exact: true })).toHaveCount(0);
    await expect(drawer.getByText("No customizations requested.")).toHaveCount(
      0,
    );
    await page.screenshot({
      path: info.outputPath(`reservation-overview-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      drawer.getByRole("button", { name: "Edit reservation", exact: true }),
    ).toHaveCount(0);
    await drawer
      .getByText("Add staff note", { exact: false })
      .scrollIntoViewIfNeeded();
    const action = drawer.getByRole("button", {
      name: "Check in",
      exact: true,
    });
    await expect(action).toBeInViewport();
    await action.click();
    const request = page.waitForRequest(
      (r) => r.url().endsWith("/status") && r.method() === "POST",
    );
    await drawer
      .getByRole("button", { name: "Confirm action", exact: true })
      .click();
    expect((await request).postDataJSON()).toEqual({ status: "checked_in" });
    await expect(
      drawer.getByRole("button", { name: "Check out", exact: true }),
    ).toBeVisible();
    await expect(
      drawer.getByText("Guest checked in at the hotel", { exact: false }),
    ).toBeVisible();
  });
}

test("future arrivals explain disabled actions and show room readiness and saved arrival", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-01T09:00Z"));
  await fixture(
    page,
    {
      preCheckin: {
        status: "submitted",
        expectedArrivalAt: "2026-11-03T10:30:00Z",
        notes: "Arriving by train",
      },
    },
    {
      assignedUnitId: "unit-one",
      assignedUnitLabel: "101",
      units: [
        {
          id: "unit-one",
          label: "101",
          roomTypeId: "room-one",
          status: "active",
          housekeepingStatus: "dirty",
        },
      ],
    },
    { assigned: true, status: "dirty" },
  );
  await page.goto("/partner/reservations?propertyId=hotel-one&date=2026-11-03");
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  const drawer = page.getByRole("dialog", {
    name: "Reservation details",
    exact: true,
  });
  await expect(
    drawer.getByRole("button", { name: "Check in", exact: true }),
  ).toBeDisabled();
  await expect(
    drawer.getByText("Check-in opens", { exact: false }),
  ).toBeVisible();
  await expect(
    drawer.getByText("Expected arrival:", { exact: false }),
  ).toContainText("4:00 pm");
  await expect(
    drawer.getByText("Assigned room is dirty.", { exact: false }),
  ).toBeVisible();
  await expect(drawer.getByText("Room 101", { exact: true })).toBeVisible();
  await drawer
    .getByRole("button", { name: "Change room", exact: true })
    .click();
  await expect(drawer.getByLabel("Physical room", { exact: true })).toHaveValue(
    "unit-one",
  );
  await drawer.getByText("More actions", { exact: true }).click();
  await expect(
    drawer.getByRole("button", { name: "Mark no-show", exact: true }),
  ).toBeDisabled();
  await drawer
    .getByRole("button", { name: "Cancel reservation", exact: true })
    .click();
  await expect(
    drawer.getByRole("group", { name: "Confirm reservation action" }),
  ).toContainText("Cancellation releases the reserved room capacity");
  await drawer
    .getByRole("button", { name: "Keep unchanged", exact: true })
    .click();
});

test("staff drafts survive refresh and closing warns without discarding them", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/partner/reservations?propertyId=hotel-one&date=2026-11-03");
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  const drawer = page.getByRole("dialog", {
    name: "Reservation details",
    exact: true,
  });
  await drawer.getByText("Add staff note", { exact: false }).click();
  await drawer
    .getByLabel("New note", { exact: true })
    .fill("Do not discard this note");
  await page.evaluate(() =>
    window.dispatchEvent(new Event("stay-request-updated")),
  );
  await expect(drawer.getByLabel("New note", { exact: true })).toHaveValue(
    "Do not discard this note",
  );
  await page.keyboard.press("Escape");
  const warning = drawer.getByRole("alertdialog", {
    name: "Unsaved reservation changes",
  });
  await expect(warning).toBeVisible();
  await expect(
    warning.getByRole("button", { name: "Keep editing", exact: true }),
  ).toBeFocused();
  await warning
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await drawer.getByText("Payment details", { exact: true }).click();
  await drawer
    .getByRole("button", { name: "Record collection", exact: true })
    .click();
  await drawer.getByLabel("Amount (₹)", { exact: true }).fill("500");
  await drawer
    .getByRole("button", { name: "Review collection", exact: true })
    .click();
  await drawer
    .getByRole("button", { name: "Confirm payment action", exact: true })
    .click();
  await drawer
    .getByRole("button", { name: "Close panel", exact: true })
    .click();
  await expect(warning).toBeVisible();
  await warning
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(drawer.getByLabel("New note", { exact: true })).toHaveValue(
    "Do not discard this note",
  );
  await drawer
    .getByRole("button", { name: "Close panel", exact: true })
    .click();
  await warning
    .getByRole("button", { name: "Discard changes and close", exact: true })
    .click();
  await expect(drawer).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Manage", exact: true }),
  ).toBeFocused();
});

for (const status of ["checked_out", "cancelled", "pending_payment"]) {
  test(`${status} reservations show applicable controls and financial details`, async ({
    page,
  }) => {
    await fixture(page, {
      bookingStatus: status,
      bookingMode: "hourly",
      durationMinutes: 180,
      balanceDuePaise: 0,
      paidPaise: 200000,
      paymentStatus: status === "cancelled" ? "refunded" : "paid",
      refundedPaise: status === "cancelled" ? 200000 : 0,
    });
    await page.goto(
      "/partner/reservations?propertyId=hotel-one&date=2026-11-03",
    );
    await page.getByRole("button", { name: "Manage", exact: true }).click();
    const drawer = page.getByRole("dialog", {
      name: "Reservation details",
      exact: true,
    });
    await expect(drawer.getByText("3 hours", { exact: true })).toBeVisible();
    await expect(
      drawer.getByText("Arrival time not provided", { exact: true }),
    ).toBeVisible();
    await expect(
      drawer.getByRole("button", { name: "Check in", exact: true }),
    ).toHaveCount(0);
    await expect(
      drawer.getByRole("button", { name: "Check out", exact: true }),
    ).toHaveCount(0);
    if (status === "pending_payment") {
      await drawer.getByText("More actions", { exact: true }).click();
      await expect(
        drawer.getByRole("button", { name: "Cancel reservation", exact: true }),
      ).toBeVisible();
    } else await expect(drawer.locator("footer")).toHaveCount(0);
    if (status === "cancelled")
      await expect(drawer.getByText("Refunded", { exact: true })).toBeVisible();
    await drawer.getByText("Payment details", { exact: true }).click();
    await expect(
      drawer.getByRole("button", { name: "View / print receipt", exact: true }),
    ).toBeVisible();
    await drawer
      .getByRole("button", { name: "Refund payment", exact: true })
      .click();
    await expect(
      drawer.getByLabel("Payment action", { exact: true }),
    ).toHaveValue("refund");
  });
}

for (const width of [390, 768, 1366]) {
  test(`clean request cards disclose details and retain actions at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-11-03T09:00Z"));
    const base: StayRequest = {
      id: "fragrance",
      offeringId: "fragrance",
      offeringVersion: 1,
      name: "No Added Fragrance Preference",
      description:
        "Request no added room fragrance during preparation for arrival. This is not a guarantee that the room is free from all scents.",
      kind: "preference",
      variantId: null,
      variantName: null,
      quantity: 1,
      unitPricePaise: 0,
      totalPaise: 0,
      maxQuantity: 1,
      confirmation: "approval",
      deadlineAt: "2026-11-03T06:30:00Z",
      cancellationPolicy: null,
      status: "preparing",
      preparationStarted: true,
      response: null,
      updatedAt: "2026-11-03T06:00:00Z",
    };
    const refundText =
      "Unfulfilled services are refunded in full if the booking is cancelled.";
    let requests: StayRequest[] = [
      base,
      {
        ...base,
        id: "quiet",
        offeringId: "quiet",
        name: "Quiet Room Preference",
        description:
          "Request a room away from busy common areas. The hotel will confirm what is possible within your booked room type.",
      },
      {
        ...base,
        id: "cake",
        offeringId: "cake",
        name: "Cake",
        description: "A chocolate cake prepared for your stay",
        kind: "service",
        variantId: "chocolate",
        variantName: "Chocolate",
        agreementVersion: 2,
        source: "catalog",
        settlement: "awaiting_payment",
        status: "requested",
        preparationStarted: false,
        unitPricePaise: 50000,
        totalPaise: 50000,
        quote: {
          version: 1,
          amountPaise: 50000,
          scope: "Cake · Chocolate × 1",
          conditions: `${refundText} All charges included.`,
          expiresAt: "2026-11-04T06:30:00Z",
          status: "accepted",
          acceptedAt: "2026-11-03T08:30:00Z",
        },
      },
    ];
    const f = await fixture(page, {
      customizations: requests,
      paidPaise: 200000,
      balanceDuePaise: 0,
      paymentStatus: "paid",
    });
    await page.route(
      "**/api/partner/bookings/booking-one/customizations",
      (route) => {
        const input = route.request().postDataJSON();
        requests = requests.map((r) =>
          r.id === input.requestId
            ? { ...r, status: input.status, response: input.response }
            : r,
        );
        f.setBooking({ customizations: requests, stayRevision: 1 });
        return route.fulfill({ json: { ok: true } });
      },
    );
    await page.goto(
      "/partner/reservations?propertyId=hotel-one&date=2026-11-03",
    );
    await page.getByRole("button", { name: "Manage", exact: true }).click();
    const drawer = page.getByRole("dialog", {
      name: "Reservation details",
      exact: true,
    });
    const card = (name: string) =>
      drawer
        .getByRole("article")
        .filter({ has: page.getByRole("heading", { name, exact: true }) });
    await expect(drawer.getByRole("article")).toHaveCount(3);
    await expect(
      drawer.getByText("Reservation activity", { exact: true }),
    ).toHaveCount(0);
    await expect(
      card(base.name).getByText(base.description, { exact: true }),
    ).toBeHidden();
    await expect(
      card(base.name).getByLabel("Message to guest (optional)", {
        exact: true,
      }),
    ).toBeHidden();
    await expect(card(base.name).getByRole("heading")).not.toContainText("× 1");
    await expect(
      card(base.name).getByText("Maximum 1", { exact: false }),
    ).toHaveCount(0);
    await expect(
      card("Cake").getByText("Waiting for the guest to complete payment.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      card("Cake").getByText(refundText, { exact: true }),
    ).toHaveCount(0);
    await expect(
      card("Cake").getByText(`${refundText} All charges included.`, {
        exact: true,
      }),
    ).toBeHidden();
    await drawer
      .getByRole("heading", { name: "Guest requests (3)", exact: true })
      .evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.screenshot({
      path: info.outputPath(`compact-requests-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await card(base.name).getByText("Request details", { exact: true }).click();
    await expect(
      card(base.name).getByText(base.description, { exact: true }),
    ).toBeVisible();
    await card(base.name).getByText("Request details", { exact: true }).click();
    await card("Cake")
      .locator("summary")
      .filter({ hasText: "Quote details" })
      .click();
    await expect(
      card("Cake").getByText(`${refundText} All charges included.`, {
        exact: true,
      }),
    ).toBeVisible();
    await card(base.name).getByText("Message guest", { exact: false }).click();
    await card(base.name)
      .getByLabel("Message to guest (optional)", { exact: true })
      .fill("Prepared without added fragrance");
    const saved = page.waitForRequest(
      (r) => r.url().endsWith("/customizations") && r.method() === "POST",
    );
    await card(base.name)
      .getByRole("button", { name: "Mark ready", exact: true })
      .click();
    expect((await saved).postDataJSON()).toMatchObject({
      requestId: "fragrance",
      status: "ready",
      response: "Prepared without added fragrance",
    });
    await expect(
      card(base.name).getByText("Ready", { exact: true }),
    ).toBeVisible();
  });
}

test("Razorpay bookings hide refund actions in both the buttons and payment selector", async ({
  page,
}) => {
  await fixture(page, {
    paymentMethod: "online",
    paymentStatus: "paid",
    paidPaise: 200000,
    balanceDuePaise: 0,
  });
  await page.goto("/partner/reservations?propertyId=hotel-one&date=2026-11-03");
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  const drawer = page.getByRole("dialog", {
    name: "Reservation details",
    exact: true,
  });
  await drawer.getByText("Payment details", { exact: true }).click();
  await expect(
    drawer.getByRole("button", { name: "Refund payment", exact: true }),
  ).toHaveCount(0);
  await drawer
    .getByRole("button", { name: "Record collection", exact: true })
    .click();
  await expect(
    drawer.getByLabel("Payment action").locator('option[value="refund"]'),
  ).toHaveCount(0);
  await expect(
    drawer.getByRole("button", { name: "View / print receipt", exact: true }),
  ).toBeVisible();
});
