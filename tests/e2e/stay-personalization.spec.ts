import { expect, test, type Page } from "@playwright/test";
import { selectedRequests, extraTotals } from "../../lib/stay/domain";
import type { Offering } from "../../lib/stay/contracts";
const checkIn = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const checkOut = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
const startAt = `${checkIn}T08:30:00.000Z`,
  endAt = `${checkOut}T05:30:00.000Z`;
const free: Offering = {
  id: "pillows",
  propertyId: "hotel",
  version: 1,
  name: "Extra pillows",
  description: "Extra pillows prepared for your arrival",
  kind: "item",
  travelerCategories: ["Family"],
  roomTypeIds: [],
  bookingModes: ["overnight", "hourly"],
  unitPricePaise: 0,
  maxQuantity: 3,
  advanceNoticeMinutes: 60,
  confirmation: "approval",
  variants: [],
  status: "active",
};
const paid: Offering = {
  ...free,
  id: "decoration",
  name: "Room decoration",
  description: "A celebration prepared before you arrive",
  kind: "service",
  unitPricePaise: 20000,
  travelerCategories: ["Couple"],
};
const input = {
  propertySlug: "garden",
  roomTypeId: "room",
  ratePlanId: "rate",
  checkIn,
  checkOut,
  bookingMode: "overnight",
  adults: 1,
  children: 0,
  infants: 0,
  customizationSelections: [],
  travelerPreferences: [],
};
const policy = {
  name: "Flexible",
  description: "Free cancellation until 24 hours before arrival",
  refundableUntilHours: 24,
  cancellationFeePercent: 0,
};
const quote = {
  startAt,
  endAt,
  bookingMode: "overnight",
  pricingModel: "nightly",
  durationMinutes: 1260,
  billedHours: 0,
  arrivalTime: "14:00",
  departureTime: "11:00",
  balanceDuePaise: 75000,
  timezone: "Asia/Kolkata",
  currency: "INR",
  roomType: { id: "room", name: "Comfort room" },
  ratePlan: { name: "Standard", paymentMode: "deposit" },
  checkIn,
  checkOut,
  nights: 1,
  adults: 1,
  children: 0,
  infants: 0,
  subtotalPaise: 100000,
  taxPaise: 0,
  customerFeePaise: 0,
  totalPaise: 100000,
  payableNowPaise: 25000,
  cancellationPolicy: policy,
  quotedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 300000).toISOString(),
  fingerprint: "a".repeat(64),
  availableCustomizations: [free, paid],
  customizations: [],
  extrasTotalPaise: 0,
  includedAmenities: {
    roomAmenities: [{ code: "desk", label: "Large desk" }],
    propertyAmenities: [],
    rateInclusions: [],
  },
};
const display = {
  propertyName: "Garden Hotel",
  propertyCity: "Kanpur",
  propertyState: "Uttar Pradesh",
  propertyAddress: "Garden Road, Kanpur",
  propertyRatingAverage: 4,
  propertyCoverImageUrl: null,
  propertyRules: {},
  timezone: "Asia/Kolkata",
  roomType: { id: "room", name: "Comfort room" },
  capacity: { maxAdults: 2, maxChildren: 1, maxInfants: 1, maxOccupancy: 3 },
  ratePlan: { id: "rate", name: "Standard", paymentMode: "deposit" },
  bookingMode: "overnight",
  checkIn,
  checkOut,
  arrivalTime: "14:00",
  departureTime: "11:00",
  nights: 1,
  durationMinutes: 1260,
  adults: 1,
  children: 0,
  infants: 0,
};
async function fixture(page: Page, catalog?: Offering[]) {
  let booking = {
    ...quote,
    id: "booking",
    confirmationCode: "HK-STAY-001",
    propertyId: "hotel",
    propertySlug: "garden",
    propertyName: "Garden Hotel",
    roomName: "Comfort room",
    ratePlanName: "Standard",
    propertyAddress: "Garden Road",
    propertyPublicPhone: "+919876543210",
    propertyPublicEmail: null,
    propertyCoverImageUrl: null,
    leadGuest: {
      name: "Test Guest",
      email: "guest@example.com",
      phone: "+919876543210",
    },
    guestNames: ["Test Guest"],
    bookingStatus: "confirmed",
    paymentStatus: "partially_paid",
    paymentMethod: "online",
    paidPaise: 45000,
    totalPaise: 120000,
    travelerPreferences: ["Family"],
    customizations: selectedRequests(
      [free, paid],
      [
        { offeringId: "pillows", variantId: null, quantity: 1 },
        { offeringId: "decoration", variantId: null, quantity: 1 },
      ],
      "room",
      "overnight",
      startAt,
      policy,
    ),
    stayRevision: 0,
    preCheckin: {
      status: "incomplete",
      expectedArrivalAt: null as string | null,
      submittedAt: null as string | null,
      notes: "",
    },
    specialRequest: "Arriving by train",
    createdAt: new Date().toISOString(),
  };
  let offerings: Offering[] = catalog ?? [free, paid];
  const submissions: Record<string, unknown>[] = [];
  await page.route("**/fixture-data", (r) =>
    r.fulfill({ json: { input, display, booking } }),
  );
  await page.route("**/api/notifications**", (r) =>
    r.fulfill({ json: { notifications: [], unreadCount: 0 } }),
  );
  await page.route("**/api/bookings/quote", (r) => {
    const data = r.request().postDataJSON();
    const customizations = selectedRequests(
      offerings,
      data.customizationSelections ?? [],
      "room",
      "overnight",
      startAt,
      policy,
    );
    return r.fulfill({
      json: {
        quote: {
          ...quote,
          customizations,
          ...extraTotals(100000, 25000, "deposit", customizations),
          fingerprint: (customizations.length ? "b" : "a").repeat(64),
        },
      },
    });
  });
  await page.route("**/api/bookings/personalization", (r) =>
    r.fulfill({ json: { offerings, startAt, timezone: "Asia/Kolkata" } }),
  );
  await page.route("**/api/bookings/booking", (r) =>
    r.fulfill({ json: { booking } }),
  );
  await page.route("**/api/bookings/booking/pre-checkin", (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({ json: { offerings: [free], editable: true } });
    const data = r.request().postDataJSON();
    submissions.push(data);
    booking = {
      ...booking,
      travelerPreferences: data.travelerPreferences,
      stayRevision: booking.stayRevision + 1,
      preCheckin: {
        status: data.submit ? "submitted" : "incomplete",
        expectedArrivalAt: `${checkIn}T09:30:00Z`,
        submittedAt: data.submit ? new Date().toISOString() : null,
        notes: data.notes,
      },
    };
    return r.fulfill({ json: { booking } });
  });
  await page.route("**/api/partner/dashboard", (r) =>
    r.fulfill({
      json: {
        user: {
          uid: "owner",
          fullName: "Owner",
          email: "owner@example.com",
          photoURL: null,
        },
        businessName: "Garden",
        currency: "INR",
        properties: [
          {
            id: "hotel",
            name: "Garden Hotel",
            status: "active",
            propertyType: "hotel",
            approvalStatus: "approved",
            rejectionReason: null,
          },
        ],
      },
    }),
  );
  await page.route(
    "**/api/partner/properties/hotel/stay-customizations",
    (r) => {
      if (r.request().method() === "GET")
        return r.fulfill({
          json: { offerings, rooms: [{ id: "room", name: "Comfort room" }] },
        });
      const data = r.request().postDataJSON();
      submissions.push(data);
      const saved = {
        ...data.offering,
        id: data.id ?? "new",
        propertyId: "hotel",
        version: (data.version ?? 0) + 1,
      };
      offerings = [...offerings.filter((o) => o.id !== saved.id), saved];
      return r.fulfill({ json: { id: saved.id } });
    },
  );
  await page.route("**/api/partner/bookings?**", (r) =>
    r.fulfill({
      json: {
        bookings: [booking],
        totalCount: 1,
        metrics: {
          arrivals: 0,
          departures: 0,
          staying: 0,
          pendingRequests: 1,
          noShowRisk: 0,
        },
        tabCounts: {
          all: 1,
          arrivals: 0,
          in_house: 0,
          upcoming: 1,
          pending_payment: 0,
          cancelled: 0,
          no_show: 0,
        },
        roomNames: ["Comfort room"],
      },
    }),
  );
  await page.route("**/api/partner/bookings/booking/customizations", (r) => {
    const data = r.request().postDataJSON();
    submissions.push(data);
    booking = {
      ...booking,
      stayRevision: booking.stayRevision + 1,
      customizations: booking.customizations.map((c) =>
        c.id === data.requestId
          ? {
              ...c,
              status: data.status,
              response: data.response,
              preparationStarted:
                c.preparationStarted || data.status === "preparing",
            }
          : c,
      ),
    };
    return r.fulfill({ json: { ok: true } });
  });
  return { submissions };
}
async function completeGuestDetails(page: Page) {
  await expect(
    page.getByRole("heading", { level: 1, name: "Guest details", exact: true }),
  ).toBeVisible();
  await page.getByPlaceholder("Full name as on ID").fill("Test Guest");
  await page.getByLabel("Aadhaar Number").fill("123456789012");
  await page.getByPlaceholder("you@example.com").fill("guest@example.com");
  await page.getByPlaceholder("9876543210").fill("9876543210");
  await page
    .getByRole("button", { name: "Continue to personalize", exact: true })
    .filter({ visible: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Personalize your stay",
      exact: true,
    }),
  ).toBeVisible();
}
function extraCard(page: Page, name: string) {
  return page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}
for (const viewport of [
  { width: 1366, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`optional checkout personalization and arrival submission at ${viewport.width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    const { submissions } = await fixture(page);
    await page.goto("/checkout-fixture");
    await completeGuestDetails(page);
    await page.getByText("Suggestions for your trip", { exact: false }).click();
    await page.getByRole("button", { name: "Couple", exact: true }).click();
    await extraCard(page, "Room decoration")
      .getByRole("button", { name: "Add", exact: true })
      .click();
    await expect(
      page.getByText("Booking total: ₹1,200", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("Room decoration × 1", { exact: true }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Remove all extras" }).click();
    await expect(
      extraCard(page, "Room decoration").getByRole("button", {
        name: "Add",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("checkout.png"),
      fullPage: true,
    });
    await page.goto("/arrival-fixture");
    await page
      .getByRole("button", { name: "Prepare for arrival", exact: true })
      .click();
    await page
      .getByLabel("Expected arrival (Asia/Kolkata)")
      .fill(`${checkIn}T15:00`);
    await page.getByLabel("I have reviewed the guest information").check();
    await page
      .getByLabel("Additional arrival notes")
      .fill("Arriving by train at 3 PM");
    await page
      .getByRole("button", { name: "Submit pre check-in", exact: true })
      .click();
    await expect(
      page.getByText("Pre check-in: Submitted", { exact: true }),
    ).toBeVisible();
    expect(submissions.at(-1)).toMatchObject({
      submit: true,
      guestsReviewed: true,
      notes: "Arriving by train at 3 PM",
      selections: [{ offeringId: "pillows", variantId: null, quantity: 1 }],
    });
    expect(JSON.stringify(submissions.at(-1))).not.toContain("aadhaar");
    await page.screenshot({
      path: info.outputPath("arrival.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
test("owner creates and pauses an offering and staff prepares a request", async ({
  page,
}, info) => {
  const { submissions } = await fixture(page);
  await page.goto("/partner-fixture");
  await page
    .getByRole("button", { name: "Create offering", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Charging adapter");
  await page
    .getByLabel("Description", { exact: true })
    .fill("A compatible charger for your phone");
  await page.getByRole("button", { name: "Add choice", exact: true }).click();
  await page.getByLabel("Variant 1", { exact: true }).fill("USB-C");
  await page
    .getByRole("button", { name: "Save offering", exact: true })
    .click();
  const card = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Charging adapter", exact: true }),
  });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(card.getByText("Paused", { exact: true })).toBeVisible();
  expect(submissions.at(-1)).toMatchObject({
    offering: {
      name: "Charging adapter",
      status: "paused",
      variants: [{ name: "USB-C" }],
    },
  });
  await page.goto("/reservations-fixture");
  await page
    .getByRole("button", { name: "Open reservation details", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Arrival preparation", exact: true }),
  ).toBeVisible();
  const request = page
    .locator("div.rounded-xl")
    .filter({
      has: page.getByRole("heading", {
        name: "Extra pillows × 1",
        exact: true,
      }),
    })
    .last();
  await request.getByRole("button", { name: "Confirm", exact: true }).click();
  await request
    .getByRole("button", { name: "Mark preparing", exact: true })
    .click();
  await request
    .getByRole("button", { name: "Mark ready", exact: true })
    .click();
  await expect(request.getByText("Ready", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Payment", exact: true }).click();
  await expect(
    page.getByText("Outstanding Balance", { exact: true }).locator(".."),
  ).toContainText("₹750");
  await page.screenshot({
    path: info.outputPath("partner-preparation.png"),
    fullPage: true,
  });
});

for (const width of [1366, 390]) {
  test(`variant prices persist, clear and total correctly at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const { submissions } = await fixture(page);
    await page.goto("/partner-fixture");
    await page
      .getByRole("button", { name: "Create offering", exact: true })
      .click();
    await page.getByLabel("Name", { exact: true }).fill("Room Aroma");
    await page
      .getByLabel("Description", { exact: true })
      .fill("Choose an aroma for your room");
    await page.getByLabel("Default price per item per stay").fill("200");
    await page.getByLabel("Maximum quantity per booking").fill("3");
    await page
      .getByLabel("Guest browsing category", { exact: true })
      .selectOption("celebrations");
    for (const [index, name, price] of [
      [1, "Lavender", "150"],
      [2, "Sandalwood", "250"],
      [3, "Rose", "0"],
    ] as const) {
      await page
        .getByRole("button", { name: "Add choice", exact: true })
        .click();
      await page.getByLabel(`Variant ${index}`, { exact: true }).fill(name);
      await page
        .getByLabel(`Variant ${index} custom price`, { exact: true })
        .fill(price);
    }
    await page
      .getByRole("button", { name: "Save offering", exact: true })
      .click();
    const card = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: "Room Aroma", exact: true }),
    });
    await expect(card).toContainText("Free – ₹250");
    const saved = submissions.at(-1) as {
      offering: { variants: { id: string }[] };
    };
    await page.reload();
    if (width >= 1024) {
      await page.getByRole("complementary").hover();
      await page
        .getByRole("button", { name: "Pin sidebar open", exact: true })
        .click();
    }
    await card.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(
      page.getByLabel("Variant 1 custom price", { exact: true }),
    ).toHaveValue("150");
    await expect(
      page.getByLabel("Guest browsing category", { exact: true }),
    ).toHaveValue("celebrations");
    await expect(
      page.getByLabel("Variant 3 custom price", { exact: true }),
    ).toHaveValue("0");
    await page.getByLabel("Variant 2 custom price", { exact: true }).fill("");
    await page
      .getByRole("button", { name: "Save offering", exact: true })
      .click();
    expect(submissions.at(-1)).toMatchObject({
      offering: {
        variants: [
          { id: saved.offering.variants[0].id, unitPricePaise: 15000 },
          { unitPricePaise: null },
          { unitPricePaise: 0 },
        ],
      },
    });
    await page.goto("/checkout-fixture");
    await completeGuestDetails(page);
    await extraCard(page, "Room Aroma")
      .getByRole("button", { name: "Choose options", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add one Room Aroma Lavender", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Add one Room Aroma Sandalwood",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Add one Room Aroma Rose", exact: true })
      .click();
    await expect(
      page.getByText("Booking total: ₹1,350", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Room Aroma Lavender quantity", { exact: true }),
    ).toHaveText("1");
    await page.goto("/arrival-fixture");
    await page.route("**/api/bookings/booking/pre-checkin", (r) =>
      r.fulfill({
        json: {
          offerings: [
            {
              ...paid,
              id: "aroma",
              name: "Room Aroma",
              variants: [
                { id: "rose", name: "Rose", unitPricePaise: 0 },
                { id: "lavender", name: "Lavender", unitPricePaise: 15000 },
              ],
            },
          ],
          editable: true,
        },
      }),
    );
    await page
      .getByRole("button", { name: "Prepare for arrival", exact: true })
      .click();
    await page.getByLabel("Room Aroma Rose", { exact: true }).selectOption("1");
    await expect(
      page.getByLabel("Room Aroma Lavender", { exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

for (const width of [390, 768, 1366]) {
  test(`three checkout stages, navigation and clean layouts at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const catalog: Offering[] = Array.from({ length: 47 }, (_, i) => ({
      ...free,
      id: `extra-${i}`,
      name: `Comfort option ${String(i + 1).padStart(2, "0")}`,
      category: i % 2 ? "devices" : "room_essentials",
      unitPricePaise: i % 3 ? 0 : 10000,
    }));
    await fixture(page, catalog);
    await page.goto("/checkout-fixture?step=review");
    await expect(page).toHaveURL(/step=details/);
    await expect(
      page
        .getByRole("navigation", { name: "Checkout progress" })
        .getByRole("button")
        .nth(2),
    ).toBeDisabled();
    await page.screenshot({
      path: info.outputPath("details.png"),
      fullPage: true,
    });
    await completeGuestDetails(page);
    await expect(page.getByRole("article")).toHaveCount(47);
    await expect(
      page.getByRole("heading", { name: "Primary Guest Details" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Devices & convenience", exact: true })
      .click();
    await expect(page.getByRole("article")).toHaveCount(23);
    await page
      .getByRole("button", { name: "All categories", exact: true })
      .click();
    await page.getByLabel("Search stay options").fill("Comfort option 01");
    await expect(page.getByRole("article")).toHaveCount(1);
    await extraCard(page, "Comfort option 01")
      .getByRole("button", { name: "Add", exact: true })
      .click();
    await expect(
      page.getByText("Booking total: ₹1,100", { exact: false }),
    ).toBeVisible();
    await page.getByLabel("Search stay options").fill("");
    await page.screenshot({
      path: info.outputPath("extras-large-catalog.png"),
      fullPage: true,
    });
    await page.screenshot({ path: info.outputPath("extras-viewport.png") });
    await page
      .getByRole("button", { name: "Selected (1)", exact: true })
      .click();
    await expect(page.getByRole("article")).toHaveCount(1);
    await page
      .getByText("Anything else the hotel should know?", { exact: false })
      .click();
    await page.getByLabel("Note for the hotel").fill("Arriving by train");
    await page
      .getByRole("button", { name: "Continue to review", exact: true })
      .filter({ visible: true })
      .click();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Review & pay",
        exact: true,
      }),
    ).toBeFocused();
    await expect(
      page.getByText("Arriving by train", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Comfort option 01 × 1", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(0);
    await page.getByText("Included with your room", { exact: true }).click();
    await expect(page.getByText("Large desk", { exact: true })).toBeVisible();
    await page.screenshot({
      path: info.outputPath("review.png"),
      fullPage: true,
    });
    await page.goBack();
    await expect(
      page.getByRole("heading", { level: 1, name: "Personalize your stay" }),
    ).toBeVisible();
    await page.goForward();
    await expect(
      page.getByRole("heading", { level: 1, name: "Review & pay" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Edit guest details", exact: true })
      .click();
    await expect(page.getByPlaceholder("Full name as on ID")).toHaveValue(
      "Test Guest",
    );
    await expect(page.getByLabel("Aadhaar Number")).toHaveValue(
      "1234 5678 9012",
    );
    await page
      .getByRole("button", { name: "Continue to personalize", exact: true })
      .filter({ visible: true })
      .click();
    await expect(
      page.getByLabel("Comfort option 01 Quantity quantity", { exact: true }),
    ).toHaveText("1");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(page.url()).not.toContain("1234");
    await page.reload();
    await expect(page).toHaveURL(/step=details/);
    await expect(page.getByLabel("Aadhaar Number")).toHaveValue("");
  });
}

test("empty extras and failed options never require a Skip action", async ({
  page,
}) => {
  await fixture(page, []);
  await page.goto("/checkout-fixture");
  await page
    .getByRole("button", { name: "Continue to personalize", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Guest details" }),
  ).toBeVisible();
  await expect(page.getByLabel("Aadhaar Number")).toBeFocused();
  await completeGuestDetails(page);
  await expect(
    page.getByText("Your stay is ready as it is", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /skip/i })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Continue to review", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Review & pay" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit stay additions", exact: true })
    .click();
  await page.route("**/api/bookings/personalization", (r) =>
    r.fulfill({ status: 500, json: { error: "Unavailable" } }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  // Reloading safely restarts the journey without retaining identity input.
  await page.reload();
  await completeGuestDetails(page);
  await expect(
    page.getByText("Options could not load.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continue to review", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Review & pay" }),
  ).toBeVisible();
});

test("quote failures retain selected requests and provide a removal recovery path", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/checkout-fixture");
  await completeGuestDetails(page);
  await page.route("**/api/bookings/quote", (r) =>
    r.fulfill({
      status: 400,
      json: { error: "This customization is no longer available." },
    }),
  );
  await extraCard(page, "Room decoration")
    .getByRole("button", { name: "Add", exact: true })
    .click();
  await expect(page.getByRole("alert").first()).toContainText(
    "This customization is no longer available.",
  );
  await expect(
    page
      .getByRole("button", { name: "Refresh price to continue", exact: true })
      .filter({ visible: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Remove all extras", exact: true }),
  ).toBeEnabled();
});

test("mixed-price filtering retains siblings and shares quantity limits", async ({
  page,
}) => {
  await fixture(page, [
    {
      ...paid,
      id: "aroma",
      name: "Room aroma",
      category: "celebrations",
      maxQuantity: 2,
      variants: [
        { id: "rose", name: "Rose", unitPricePaise: 0 },
        { id: "lavender", name: "Lavender", unitPricePaise: 15000 },
      ],
    },
  ]);
  await page.goto("/checkout-fixture");
  await completeGuestDetails(page);
  await page.getByRole("button", { name: "Free options", exact: true }).click();
  await extraCard(page, "Room aroma")
    .getByRole("button", { name: "Choose options", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add one Room aroma Rose", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Add one Room aroma Lavender",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Paid extras", exact: true }).click();
  await page
    .getByRole("button", { name: "Add one Room aroma Lavender", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Add one Room aroma Lavender",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByText("Room aroma · Rose × 1", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Booking total: ₹1,150", { exact: false }),
  ).toBeVisible();
});

test("only review submits a booking and payment holds lock stage navigation", async ({
  page,
}) => {
  await fixture(page);
  let submissions = 0;
  await page.route("**/api/bookings", (r) => {
    submissions++;
    return r.fulfill({
      json: {
        bookingId: "held",
        confirmationCode: "HK-HELD",
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        requiresPayment: true,
        razorpay: {
          keyId: "fixture",
          amount: 25000,
          currency: "INR",
          name: "Helpkey",
          orderId: "fixture",
        },
      },
    });
  });
  await page.goto("/checkout-fixture");
  await completeGuestDetails(page);
  await page
    .getByRole("button", { name: "Continue to review", exact: true })
    .filter({ visible: true })
    .click();
  expect(submissions).toBe(0);
  await page
    .getByRole("button", { name: "Pay ₹250 & confirm", exact: true })
    .filter({ visible: true })
    .click();
  expect(submissions).toBe(0);
  await page.getByRole("checkbox", { name: /I agree to the Helpkey/ }).check();
  await page
    .getByRole("checkbox", { name: /I confirm that all staying guests/ })
    .check();
  await page.evaluate(() =>
    Object.defineProperty(window, "Razorpay", {
      value: class {
        options: { modal?: { ondismiss: () => void } };
        constructor(options: { modal?: { ondismiss: () => void } }) {
          this.options = options;
        }
        open() {
          this.options.modal?.ondismiss();
        }
      },
    }),
  );
  await page
    .getByRole("button", { name: "Pay ₹250 & confirm", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByText(/Room reserved temporarily for/)).toBeVisible();
  expect(submissions).toBe(1);
  await expect(
    page.getByRole("button", { name: "Edit guest details", exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .getByRole("navigation", { name: "Checkout progress" })
      .getByRole("button")
      .first(),
  ).toBeDisabled();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Review & pay", level: 1 }),
  ).toBeVisible();
});

for (const width of [390, 1366]) {
  test(`unavailable hotel offerings stay searchable without clutter at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const catalog: Offering[] = [
      free,
      {
        ...free,
        id: "mouse",
        name: "External Mouse",
        category: "devices",
        description: "Borrow a compatible external mouse.",
        advanceNoticeMinutes: 7200,
        variants: [{ id: "usb", name: "USB", unitPricePaise: 0 }],
      },
      {
        ...free,
        id: "suite",
        name: "Suite welcome kit",
        roomTypeIds: ["suite"],
      },
      {
        ...free,
        id: "hourly",
        name: "Hourly refreshment",
        bookingModes: ["hourly"],
      },
    ];
    await fixture(page, catalog);
    await page.goto("/checkout-fixture");
    await completeGuestDetails(page);
    await expect(
      page.getByRole("heading", { name: "Extra pillows", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Unavailable for this stay (3)", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "External Mouse", exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("Search stay options").fill("mouse");
    const mouse = extraCard(page, "External Mouse");
    await expect(mouse).toBeVisible();
    await expect(mouse).toContainText("Needs 120 hours’ notice");
    await expect(
      mouse.getByRole("button", { name: "Unavailable", exact: true }),
    ).toBeDisabled();
    await expect(
      mouse.getByRole("button", { name: /Add|Choose options/ }),
    ).toHaveCount(0);
    await expect(
      page.getByText("No matching options", { exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath("unavailable-search.png"),
      fullPage: true,
    });
    await page.getByLabel("Search stay options").fill("welcome");
    await expect(extraCard(page, "Suite welcome kit")).toContainText(
      "Not offered for your selected room.",
    );
    await page.getByLabel("Search stay options").fill("refreshment");
    await expect(extraCard(page, "Hourly refreshment")).toContainText(
      "Available for hourly stays only.",
    );
    await page.getByLabel("Search stay options").fill("");
    await page
      .getByRole("button", { name: "Devices & convenience", exact: true })
      .click();
    await page
      .getByText("Unavailable for this stay (1)", { exact: true })
      .click();
    await expect(mouse).toBeVisible();
    await page
      .getByRole("button", { name: "Continue to review", exact: true })
      .filter({ visible: true })
      .click();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Review & pay",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
