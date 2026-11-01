import { expect, test, type Page } from "@playwright/test";
import { selectedRequests, extraTotals } from "../../lib/stay/domain";
import { quotedPrice } from "../../lib/stay/agreements";
import type { Offering, StayRequest } from "../../lib/stay/contracts";
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
  confirmation: "immediate",
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
async function fixture(page: Page, catalog?: Offering[], upgraded = false) {
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
    paidPaise: upgraded ? 25000 : 45000,
    totalPaise: upgraded ? 100000 : 120000,
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
    ).map((r): StayRequest =>
      upgraded
        ? {
            ...r,
            confirmation: "approval",
            status: "requested",
            settlement: "pending_hotel",
          }
        : {
            ...r,
            agreementVersion: undefined,
            settlement: undefined,
            source: undefined,
            status: "requested",
            confirmation: "approval",
          },
    ),
    stayRevision: 0,
    preCheckin: {
      status: "incomplete",
      arrivalChoice: null as "time" | "unknown" | null,
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
      Date.now(),
      { startAt, endAt, nights: 1, adults: 1, children: 0 },
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
      return r.fulfill({ json: { offerings: catalog ?? [free], editable: true } });
    const data = r.request().postDataJSON();
    submissions.push(data);
    booking = {
      ...booking,
      travelerPreferences: data.travelerPreferences ?? booking.travelerPreferences,
      stayRevision: booking.stayRevision + 1,
      preCheckin: {
        status: data.submit ? "submitted" : "incomplete",
        expectedArrivalAt: data.arrivalChoice === "unknown" ? null : `${checkIn}T09:30:00Z`,
        arrivalChoice: data.arrivalChoice,
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
          json: {
            offerings,
            canManage: true,
            rooms: [{ id: "room", name: "Comfort room" }],
          },
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
  await page.route("**/api/partner/properties/hotel/stay-requests?**", (r) =>
    r.fulfill({
      json: {
        rows: booking.customizations.map((request) => ({
          bookingId: booking.id,
          reference: booking.confirmationCode,
          guestName: booking.leadGuest.name,
          roomName: booking.roomName,
          checkIn,
          checkOut,
          bookingStatus: booking.bookingStatus,
          revision: booking.stayRevision,
          enabled: true,
          request,
        })),
        timezone: "Asia/Kolkata",
        nextCursor: null,
        scanned: 1,
      },
    }),
  );
  await page.route("**/api/partner/bookings/booking", (r) =>
    r.fulfill({ json: { booking } }),
  );
  await page.route("**/api/partner/bookings/booking/stay-requests", (r) =>
    r.fulfill({ json: { events: [] } }),
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
  if (upgraded) {
    await page.route(
      /\/api\/(?:partner\/)?bookings\/booking\/stay-requests$/,
      (r) => {
        if (r.request().method() === "GET")
          return r.fulfill({ json: { events: [] } });
        const data = r.request().postDataJSON();
        submissions.push(data);
        booking = {
          ...booking,
          stayRevision: booking.stayRevision + 1,
          customizations: booking.customizations.map((c) => {
            if (c.id !== data.requestId) return c;
            if (data.action === "approve_price" || data.action === "quote")
              return quotedPrice(c, {
                version: (c.quote?.version ?? 0) + 1,
                amountPaise: data.amountPaise ?? c.totalPaise,
                scope: data.scope || `${c.name} × ${c.quantity}`,
                conditions: "All charges included",
                expiresAt: endAt,
                status: "offered",
              });
            if (data.action === "accept")
              return {
                ...c,
                settlement: "awaiting_payment",
                quote: {
                  ...c.quote!,
                  status: "accepted",
                  acceptedAt: new Date().toISOString(),
                  paymentStatus: "awaiting_payment",
                },
              };
            if (data.action === "approve_free")
              return {
                ...c,
                status: "confirmed",
                settlement: "included",
                unitPricePaise: 0,
                totalPaise: 0,
              };
            return { ...c, status: "declined", response: data.response };
          }),
        };
        return r.fulfill({ json: { ok: true } });
      },
    );
    await page.route("**/api/bookings/booking/stay-quote-payment", (r) => {
      const data = r.request().postDataJSON();
      submissions.push(data);
      if (!data.razorpay_payment_id)
        return r.fulfill({
          json: {
            keyId: "mock_key",
            amount: 20000,
            currency: "INR",
            orderId: "mock_quote_order",
          },
        });
      booking = {
        ...booking,
        stayRevision: booking.stayRevision + 1,
        customizations: booking.customizations.map((c) =>
          c.quote?.status === "accepted"
            ? {
                ...c,
                status: "confirmed",
                settlement: "paid",
                quote: {
                  ...c.quote,
                  paymentId: "mock_quote_payment",
                  paymentStatus: "paid",
                },
              }
            : c,
        ),
      };
      return r.fulfill({ json: { refunded: false } });
    });
  }
  return { submissions, getBooking: () => booking, setRequests: (requests: StayRequest[]) => { booking = { ...booking, customizations: requests }; } };
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
    await extraCard(page, "Room decoration")
      .getByRole("button", { name: /^(Add|Request)$/, exact: true })
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
    await page.getByRole("button", { name: "Start pre-check-in", exact: true }).click();
    await page.getByLabel("Choose arrival time", { exact: true }).check();
    await page.getByRole("button", { name: "Arrival date", exact: true }).click();
    const calendar = page.getByRole("dialog", { name: "Arrival date", exact: true });
    const arrivalDay = calendar.locator(`[data-day="${checkIn}"]:not([data-outside]) button`);
    if (!(await arrivalDay.isVisible())) await calendar.getByRole("button", { name: "Go to the Next Month" }).click();
    await arrivalDay.click();
    await calendar.getByRole("button", { name: "Apply", exact: true }).click();
    await page.getByLabel("Arrival time", { exact: true }).selectOption("15:00");
    await page.getByLabel("Arrival note (optional)").fill("Arriving by train at 3 PM");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Check your guest details" })).toBeVisible();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Confirm pre-check-in", exact: true }).click();
    await expect(page.getByText("Pre-check-in confirmed", { exact: true })).toBeVisible();
    expect(submissions.at(-1)).toMatchObject({ submit: true, guestsReviewed: true, arrivalChoice: "time", notes: "Arriving by train at 3 PM" });
    expect(submissions.at(-1)).not.toHaveProperty("selections");
    expect(submissions.at(-1)).not.toHaveProperty("travelerPreferences");
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
  await page
    .getByRole("button", { name: "Create from scratch", exact: true })
    .click();
  await page
    .getByLabel("How should guests respond?", { exact: true })
    .selectOption("multiple");
  await page.getByLabel("Allow guests to choose quantities").check();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Charging adapter");
  await page
    .getByLabel("Description", { exact: true })
    .fill("A compatible charger for your phone");
  await page.getByRole("button", { name: "Add choice", exact: true }).click();
  await page.getByLabel("Variant 1", { exact: true }).fill("USB-C");
  await page.getByLabel("I reviewed prices", { exact: false }).check();
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
  await page
    .getByRole("button", { name: "Guest requests", exact: true })
    .click();
  await page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", {
        name: "Extra pillows × 1",
        exact: true,
      }),
    })
    .getByRole("button", { name: "View request", exact: true })
    .click();
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
  await expect(
    page.getByRole("link", { name: "Open reservation", exact: true }),
  ).toHaveAttribute("href", /bookingId=booking/);
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
    await page
      .getByRole("button", { name: "Create from scratch", exact: true })
      .click();
    await page
      .getByLabel("How should guests respond?", { exact: true })
      .selectOption("multiple");
    await page.getByLabel("Allow guests to choose quantities").check();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("Room Aroma");
    await page
      .getByLabel("Description", { exact: true })
      .fill("Choose an aroma for your room");
    await page.getByLabel("Price", { exact: true }).selectOption("paid");
    await page
      .getByLabel("Default price (₹, 0 = Free)", { exact: true })
      .fill("200");
    await page.getByLabel("Maximum quantity per booking").fill("3");
    await page.getByLabel("Confirmation", { exact: true }).selectOption("immediate");
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
    await page.getByLabel("I reviewed prices", { exact: false }).check();
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
    await page.mouse.move(width - 20, 100);
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
    await page.getByLabel("I reviewed prices", { exact: false }).check();
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
    await page.getByRole("button", { name: "Start pre-check-in", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("Room Aroma", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("dialog").getByRole("combobox")).toHaveCount(0);
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
    await expect(page.getByRole("article")).toHaveCount(8);
    await page.getByRole("button", { name: "Browse all", exact: true }).click();
    await expect(page.getByRole("article")).toHaveCount(47);
    await expect(
      page.getByRole("heading", { name: "Primary Guest Details" }),
    ).toHaveCount(0);
    await page
      .getByLabel("Extra categories", { exact: true })
      .selectOption("technology");
    await expect(page.getByRole("article")).toHaveCount(23);
    await page
      .getByLabel("Extra categories", { exact: true })
      .selectOption("all");
    await page.getByLabel("Search stay options").fill("Comfort option 01");
    await expect(page.getByRole("article")).toHaveCount(1);
    await extraCard(page, "Comfort option 01")
      .getByRole("button", { name: /^(Add|Request)$/, exact: true })
      .click();
    await expect(
      page.getByText("Booking total: ₹1,000", { exact: false }),
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
    await page
      .getByRole("button", { name: "Selected (1)", exact: true })
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
    .getByRole("button", { name: /^(Add|Request)$/, exact: true })
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
      confirmation: "immediate",
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
    await page.getByRole("button", { name: "Browse all", exact: true }).click();
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
      .getByLabel("Extra categories", { exact: true })
      .selectOption("technology");
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

for (const width of [390, 1366]) {
  test(`template draft, image failure and dynamic choices at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const { submissions } = await fixture(page);
    await page.goto("/partner-fixture");
    await page
      .getByRole("button", { name: "Create offering", exact: true })
      .click();
    await page.getByLabel("Search offering templates").fill("cake");
    await page
      .getByRole("button", { name: /^Birthday Cake/ })
      .click();
    expect(submissions).toHaveLength(0);
    await expect(
      page.getByLabel("Guest note label", { exact: true }),
    ).toHaveValue("Message on cake");
    await expect(page.getByLabel("Variant 1", { exact: true })).toHaveValue(
      "500 g",
    );
    await page.getByLabel("Price", { exact: true }).selectOption("paid");
    await page
      .getByLabel("Default price (₹, 0 = Free)", { exact: true })
      .fill("200");
    await page
      .getByLabel("Variant 2 custom price", { exact: true })
      .fill("350");
    let fail = true;
    await page.route("**/api/partner/properties/hotel/stay-image", (r) =>
      r.fulfill(
        fail
          ? {
              status: 422,
              json: { error: "Image upload failed. Please retry." },
            }
          : { json: { imageId: "12345678-1234-1234-1234-123456789abc" } },
      ),
    );
    await page.getByLabel("Upload image", { exact: true }).setInputFiles({
      name: "cake.png",
      mimeType: "image/png",
      buffer: Buffer.from("image-fixture"),
    });
    await expect(page.getByRole("alert")).toContainText("Image upload failed");
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
      "Birthday Cake",
    );
    fail = false;
    await page.route("**/api/stay-images/**", (r) =>
      r.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64"><rect width="96" height="64" fill="#e8eaff"/></svg>',
      }),
    );
    await page.getByLabel("Upload image", { exact: true }).setInputFiles({
      name: "cake2.png",
      mimeType: "image/png",
      buffer: Buffer.from("image-fixture-2"),
    });
    await expect(
      page.getByRole("img", { name: "Offering preview" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Remove image", exact: true })
      .click();
    await page.getByLabel("I reviewed prices", { exact: false }).check();
    await page
      .getByRole("button", { name: "Save offering", exact: true })
      .click();
    expect(submissions.at(-1)).toMatchObject({
      offering: {
        name: "Birthday Cake",
        imageId: null,
        formType: "variants",
        choiceGroups: [{ name: "Flavour", required: true }],
        variants: [{ name: "500 g" }, { name: "1 kg", unitPricePaise: 35000 }],
      },
    });
    await page.goto("/checkout-fixture");
    await page
      .getByRole("button", { name: "Special occasion", exact: true })
      .click();
    await completeGuestDetails(page);
    await extraCard(page, "Birthday Cake")
      .getByRole("button", { name: "Choose options", exact: true })
      .click();
    const card = extraCard(page, "Birthday Cake");
    await card
      .getByRole("combobox", { name: "Flavour *", exact: true })
      .first()
      .selectOption("Chocolate");
    await card
      .getByLabel("Message on cake (optional)", { exact: true })
      .first()
      .fill("Happy birthday!");
    await card
      .getByRole("button", { name: "Add one Birthday Cake 500 g", exact: true })
      .click();
    await expect(
      page.getByText(
        "Pending hotel approval · Excluded from checkout payment",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText("Booking total: ₹1,000", { exact: false }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("template-and-choices.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
  test(`hotel quote, explicit guest acceptance and separate payment retry at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const { submissions } = await fixture(page, undefined, true);
    await page.addInitScript(() => {
      let attempts = 0;
      window.Razorpay = class {
        options: ConstructorParameters<NonNullable<typeof window.Razorpay>>[0];
        constructor(
          options: ConstructorParameters<
            NonNullable<typeof window.Razorpay>
          >[0],
        ) {
          this.options = options;
        }
        open() {
          if (attempts++ === 0) this.options.modal?.ondismiss();
          else
            this.options.handler({
              razorpay_order_id: "mock_quote_order",
              razorpay_payment_id: "mock_quote_payment",
              razorpay_signature: "mock_signature",
            });
        }
      };
    });
    await page.goto("/partner-fixture");
    await page
      .getByRole("button", { name: "Guest requests", exact: true })
      .click();
    await page
      .getByRole("article")
      .filter({
        has: page.getByRole("heading", {
          name: "Room decoration × 1",
          exact: true,
        }),
      })
      .getByRole("button", { name: "View request", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Offer saved price · ₹200", exact: true })
      .click();
    await expect(
      page.getByText("Hotel quote · ₹200 (all charges included)", {
        exact: true,
      }),
    ).toBeVisible();
    await page.goto("/arrival-fixture");
    await page.locator("summary").filter({ hasText: "Room decoration" }).click();
    await page
      .getByRole("button", { name: "Accept exact price · ₹200", exact: true })
      .click();
    await expect(
      page.getByText("Awaiting payment", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Pay ₹200 to confirm", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Payment not completed",
    );
    await page
      .getByRole("button", { name: "Pay ₹200 to confirm", exact: true })
      .click();
    await expect(
      page.getByText("Payment reference: mock_quote_payment · paid", {
        exact: true,
      }),
    ).toBeVisible();
    expect(submissions.filter((s) => s.action === "accept")).toHaveLength(1);
    await page.screenshot({
      path: info.outputPath("accepted-quote-payment.png"),
      fullPage: true,
    });
  });
}

for (const width of [390, 768, 1366]) {
  test(`offering workspace filters, duplicates and protects drafts at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const { submissions } = await fixture(page);
    await page.goto("/partner-fixture");
    await page
      .getByRole("searchbox", { name: "Search offerings", exact: true })
      .fill("decoration");
    await expect(page.getByRole("article")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Reset filters", exact: true })
      .click();
    const card = page
      .getByRole("article")
      .filter({
        has: page.getByRole("heading", {
          name: "Room decoration",
          exact: true,
        }),
      });
    await card.getByRole("button", { name: "Duplicate", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(
      "Room decoration (copy)",
    );
    await expect(
      dialog.getByRole("combobox", { name: "Status", exact: true }),
    ).toHaveValue("paused");
    await expect(
      dialog.getByRole("region", { name: "Guest preview" }),
    ).toContainText("Room decoration (copy)");
    await dialog
      .getByLabel("Name", { exact: true })
      .fill("Custom birthday decoration");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      dialog.getByText("Discard your unsaved changes?"),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    await dialog.getByLabel("I reviewed prices", { exact: false }).check();
    await dialog
      .getByRole("button", { name: "Save offering", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    expect(submissions.at(-1)).toMatchObject({
      offering: { name: "Custom birthday decoration", status: "paused" },
    });
    await page.getByRole("button", { name: /^Paused/ }).click();
    await expect(page.getByRole("article")).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`offering-workspace-${width}.png`),
      fullPage: true,
    });
  });
  test(`guest request queue manages preparation and refreshes at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page);
    let revision = 0;
    let request = {
      ...selectedRequests(
        [free],
        [{ offeringId: free.id, variantId: null, quantity: 1 }],
        "room",
        "overnight",
        startAt,
        policy,
      )[0],
      agreementVersion: undefined,
      status: "confirmed",
      settlement: undefined,
    } as StayRequest;
    const row = () => ({
      bookingId: "booking",
      reference: "HK123",
      guestName: "Test Guest",
      roomName: "Comfort room",
      checkIn,
      checkOut,
      bookingStatus: "confirmed",
      revision,
      enabled: true,
      request,
    });
    await page.route("**/api/partner/properties/hotel/stay-requests?**", (r) =>
      r.fulfill({
        json: {
          rows: [row()],
          timezone: "Asia/Kolkata",
          nextCursor: null,
          scanned: 1,
        },
      }),
    );
    await page.route("**/api/partner/bookings/booking", (r) =>
      r.fulfill({
        json: {
          booking: {
            propertyId: "hotel",
            customizations: [request],
            stayRevision: revision,
            bookingStatus: "confirmed",
          },
        },
      }),
    );
    await page.route("**/api/partner/bookings/booking/stay-requests", (r) =>
      r.fulfill({ json: { events: [] } }),
    );
    await page.route("**/api/partner/bookings/booking/customizations", (r) => {
      const body = r.request().postDataJSON();
      expect(body.revision).toBe(revision);
      revision++;
      request = { ...request, status: body.status };
      return r.fulfill({ json: { ok: true } });
    });
    await page.goto("/partner-fixture");
    await page
      .getByRole("button", { name: "Guest requests", exact: true })
      .click();
    await expect(page.getByText("HK123", { exact: false })).toBeVisible();
    await page
      .getByRole("button", { name: "View request", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: "Mark preparing", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Mark ready", exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Mark ready", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Mark fulfilled", exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: "Open reservation" }),
    ).toHaveAttribute("href", /bookingId=booking/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`guest-request-${width}.png`),
      fullPage: true,
    });
  });
}

test("offering editor retains a conflicting draft and reloads only on request", async ({
  page,
}) => {
  await fixture(page);
  let version = 1;
  await page.route(
    "**/api/partner/properties/hotel/stay-customizations",
    (r) =>
      r.request().method() === "GET"
        ? r.fulfill({
            json: {
              offerings: [{ ...free, version }],
              canManage: true,
              rooms: [],
            },
          })
        : (() => {
            version = 2;
            return r.fulfill({
              status: 409,
              json: {
                error:
                  "This information changed. Refresh and review before saving again.",
                code: "CONFLICT",
              },
            });
          })(),
  );
  await page.goto("/partner-fixture");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("My unsaved pillow");
  await page.getByLabel("I reviewed prices", { exact: false }).check();
  await page
    .getByRole("button", { name: "Save offering", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("changed");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "My unsaved pillow",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Load latest saved version" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Extra pillows",
  );
});

test("staff can view offerings but cannot edit the owner catalog", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/partner/properties/hotel/stay-customizations", (r) =>
    r.fulfill({ json: { offerings: [free], canManage: false, rooms: [] } }),
  );
  await page.goto("/partner-fixture");
  await expect(
    page.getByRole("heading", { name: "Extra pillows", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create offering", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Guest requests", exact: true }),
  ).toBeVisible();
});

for (const width of [390, 1366]) test(`single aroma choice and yes-no petals have no quantity controls at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const petals: Offering = { ...free, id: "petals", name: "Rose petals on the bed", kind: "preference", formType: "simple", maxQuantity: 1 };
  const { submissions } = await fixture(page, [petals]);
  await page.goto("/partner-fixture");
  await page.getByRole("button", { name: "Create offering", exact: true }).click();
  await page.getByRole("button", { name: "Create from scratch", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Room aroma");
  await page.getByLabel("Description", { exact: true }).fill("Choose one aroma for your room");
  await page.getByLabel("Type", { exact: true }).selectOption("preference");
  await page.getByLabel("How should guests respond?", { exact: true }).selectOption("single");
  await expect(page.getByLabel("Maximum quantity per booking")).toHaveCount(0);
  for (const [index, name] of [[1, "Rose"], [2, "Vanilla"], [3, "Lavender"]] as const) {
    if (index > 1) await page.getByRole("button", { name: "Add choice", exact: true }).click();
    await page.getByLabel(`Variant ${index}`, { exact: true }).fill(name);
  }
  await page.getByLabel("How should guests respond?", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Allow guests to choose quantities")).toBeFocused();
  await expect(page.getByRole("button", { name: "Save offering", exact: true })).toBeInViewport();
  await page.screenshot({ path: `test-results/stay/universal-owner-${width}.png` });
  await page.getByLabel("I reviewed prices", { exact: false }).check();
  await page.getByRole("button", { name: "Save offering", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(submissions.at(-1)).toMatchObject({ offering: { responseConfig: { responseType: "single", quantityEnabled: false }, maxQuantity: 1, kind: "preference", variants: [{ name: "Rose" }, { name: "Vanilla" }, { name: "Lavender" }] } });
  await page.reload();
  const adminCard = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Room aroma", exact: true }) });
  await adminCard.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("How should guests respond?", { exact: true })).toHaveValue("single");
  await expect(page.getByLabel("Variant 3", { exact: true })).toHaveValue("Lavender");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto("/checkout-fixture");
  await completeGuestDetails(page);
  const aromaCard = extraCard(page, "Room aroma");
  await aromaCard.getByRole("button", { name: "Choose options", exact: true }).click();
  await aromaCard.getByRole("button", { name: "Choose Rose", exact: true }).click();
  await aromaCard.getByRole("button", { name: "Choose Lavender", exact: true }).click();
  await expect(aromaCard.getByRole("button", { name: "Selected · Remove", exact: true })).toHaveCount(1);
  await expect(aromaCard.getByRole("button", { name: "Choose Rose", exact: true })).toBeVisible();
  await expect(aromaCard.locator("output")).toHaveCount(0);
  await expect(aromaCard.getByRole("button", { name: /^Add one/ })).toHaveCount(0);
  const petalsCard = extraCard(page, petals.name);
  const request = petalsCard.getByRole("button", { name: "Request", exact: true });
  if (await request.count()) await request.click();
  await expect(petalsCard.getByRole("button", { name: "Remove request", exact: true })).toBeVisible();
  await expect(petalsCard.getByRole("button", { name: /^Add one/ })).toHaveCount(0);
  await page.screenshot({ path: `test-results/stay/single-preferences-${width}.png`, fullPage: true });
});

for (const width of [390, 768, 1366]) test(`universal multi-choice quantities, pricing and text at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const multiple: Offering = { ...paid, id: "treats", name: "Welcome treats", responseConfig: { responseType: "multiple", quantityEnabled: false }, maxQuantity: 2, variants: [{ id: "rose", name: "Rose", unitPricePaise: 10050 }, { id: "vanilla", name: "Vanilla", unitPricePaise: 20000 }, { id: "lavender", name: "Lavender", unitPricePaise: 0 }] };
  const text: Offering = { ...free, id: "instructions", name: "Special instructions", variants: [], maxQuantity: 1, responseConfig: { responseType: "text", quantityEnabled: false } };
  const pillows: Offering = { ...free, id: "comfort", name: "Pillow types", responseConfig: { responseType: "multiple", quantityEnabled: true }, variants: [{ id: "soft", name: "Soft" }, { id: "firm", name: "Firm" }] };
  await fixture(page, [multiple, text, pillows]);
  await page.goto("/checkout-fixture"); await completeGuestDetails(page);
  await page.getByRole("button", { name: /Browse all/ }).click();
  const card = extraCard(page, multiple.name);
  await card.getByRole("button", { name: "Choose options", exact: true }).click();
  await card.getByLabel("Select Rose", { exact: true }).check();
  await card.getByLabel("Select Vanilla", { exact: true }).check();
  await expect(card.getByLabel("Select Lavender", { exact: true })).toBeDisabled();
  await expect(card.locator("output")).toHaveCount(0);
  await expect(page.getByText("Booking total: ₹1,300.50", { exact: false })).toBeVisible();
  const pillowCard = extraCard(page, pillows.name);
  await pillowCard.getByRole("button", { name: "Choose options", exact: true }).click();
  await pillowCard.getByRole("button", { name: "Add one Pillow types Soft", exact: true }).click();
  await pillowCard.getByRole("button", { name: "Add one Pillow types Soft", exact: true }).click();
  await pillowCard.getByRole("button", { name: "Add one Pillow types Firm", exact: true }).click();
  await expect(pillowCard.getByRole("button", { name: "Add one Pillow types Soft", exact: true })).toBeDisabled();
  await expect(pillowCard.getByRole("button", { name: "Add one Pillow types Firm", exact: true })).toBeDisabled();
  const textCard = extraCard(page, text.name);
  await textCard.getByRole("button", { name: "Choose options", exact: true }).click();
  await textCard.getByRole("button", { name: "Request this", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("response");
  await textCard.getByLabel("Request details *", { exact: true }).fill("Please prepare before arrival");
  await textCard.getByRole("button", { name: "Request this", exact: true }).click();
  await expect(textCard.getByRole("button", { name: "Remove request", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/stay/universal-responses-${width}.png`, fullPage: true });
});

test("admin preserves prices and options while switching universal settings", async ({ page }) => {
  const offering: Offering = { ...paid, kind: "preference", formType: "choice", maxQuantity: 1, responseConfig: { responseType: "single", quantityEnabled: false }, variants: [{ id: "rose", name: "Rose", unitPricePaise: 70050 }, { id: "vanilla", name: "Vanilla", unitPricePaise: 10000 }] };
  await fixture(page, [offering]); await page.goto("/partner-fixture");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Price", { exact: true }).selectOption("free");
  await expect(dialog.getByLabel("Pricing unit", { exact: true })).toHaveCount(0);
  await dialog.getByLabel("Price", { exact: true }).selectOption("paid");
  await expect(dialog.getByLabel("Variant 1 custom price", { exact: true })).toHaveValue("700.5");
  await dialog.getByLabel("How should guests respond?", { exact: true }).selectOption("yes_no");
  await dialog.getByLabel("How should guests respond?", { exact: true }).selectOption("single");
  await expect(dialog.getByLabel("Variant 1", { exact: true })).toHaveValue("Rose");
  await dialog.getByLabel("How should guests respond?", { exact: true }).selectOption("yes_no");
  await dialog.getByLabel("I reviewed prices", { exact: false }).check();
  page.once("dialog", d => d.dismiss());
  await dialog.getByRole("button", { name: "Save offering", exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("How should guests respond?", { exact: true }).selectOption("single");
  await expect(dialog.getByLabel("Variant 1", { exact: true })).toHaveValue("Rose");
  await dialog.getByRole("button", { name: "Save offering", exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole("button", { name: "Save offering", exact: true })).toBeInViewport();
});


for (const width of [390, 768, 1366]) {
  test(`guided arrival unknown choice, refresh and focus at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const { submissions } = await fixture(page);
    await page.goto("/arrival-fixture");
    await page.getByRole("button", { name: "Start pre-check-in", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("radio", { checked: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Choose an arrival time");
    await dialog.getByLabel("Not sure yet", { exact: true }).check();
    await dialog.getByLabel("Arrival note (optional)").fill("Train schedule pending");
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Check your guest details" })).toBeFocused();
    await page.reload();
    await page.getByRole("button", { name: "Start pre-check-in", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Check your guest details" })).toBeVisible();
    await dialog.getByRole("button", { name: "Back", exact: true }).click();
    await expect(dialog.getByLabel("Not sure yet", { exact: true })).toBeChecked();
    await expect(dialog.getByLabel("Arrival note (optional)")).toHaveValue("Train schedule pending");
    await dialog.getByRole("button", { name: "Save and close", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start pre-check-in", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Start pre-check-in", exact: true }).click();
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);
    await expect(dialog.getByText("Train schedule pending", { exact: false })).toBeVisible();
    await page.screenshot({ path: info.outputPath("arrival-review.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await dialog.getByRole("button", { name: "Confirm pre-check-in", exact: true }).click();
    await expect(page.getByText("Pre-check-in confirmed", { exact: true })).toBeVisible();
    expect(submissions.at(-1)).toMatchObject({ submit: true, arrivalChoice: "unknown", expectedArrivalLocal: null, guestsReviewed: true });
  });
}

test("arrival save errors retain draft and close warns before keeping changes", async ({ page }) => {
  await fixture(page);
  await page.goto("/arrival-fixture");
  await page.getByRole("button", { name: "Start pre-check-in", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Not sure yet", { exact: true }).check();
  await page.route("**/api/bookings/booking/pre-checkin", route => route.request().method() === "PATCH" ? route.fulfill({ status: 409, json: { error: "This information changed. Review before retrying." } }) : route.fallback());
  await dialog.getByRole("button", { name: "Save and close", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("This information changed");
  await expect(dialog.getByLabel("Not sure yet", { exact: true })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(dialog.getByText("You have unsaved changes.", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("alert").filter({ hasText: "You have unsaved changes" })).toBeInViewport();
  await expect(dialog.getByRole("alert").filter({ hasText: "You have unsaved changes" })).toBeFocused();
  await dialog.getByRole("button", { name: "Keep draft and close" }).click();
  await expect(dialog).toHaveCount(0);
});

test("existing requests edit universal responses once without changing arrival", async ({ page }) => {
  const aroma: Offering = { ...free, id: "aroma", name: "Room Aroma", maxQuantity: 1, formType: "choice", responseConfig: { responseType: "single", quantityEnabled: false }, variants: [{ id: "rose", name: "Rose" }, { id: "lavender", name: "Lavender" }] };
  const yes: Offering = { ...free, id: "quiet", name: "Quiet room", maxQuantity: 1, formType: "simple", responseConfig: { responseType: "yes_no", quantityEnabled: false } };
  const text: Offering = { ...yes, id: "instructions", name: "Room instructions", formType: "text", noteLabel: "Room note", responseConfig: { responseType: "text", quantityEnabled: false } };
  const f = await fixture(page, [aroma, yes, text, free], false);
  f.setRequests(selectedRequests([aroma, yes, text, free], [{ offeringId: "aroma", variantId: "rose", quantity: 1 }, { offeringId: "quiet", variantId: null, quantity: 1 }, { offeringId: "instructions", variantId: null, quantity: 1, inputs: { note: "Original" } }, { offeringId: "pillows", variantId: null, quantity: 1 }], "room", "overnight", startAt, policy));
  const edits: Record<string, unknown>[] = [];
  await page.route("**/api/bookings/booking/stay-requests", route => {
    const data = route.request().postDataJSON(); edits.push(data);
    f.setRequests(f.getBooking().customizations.map(r => r.id !== data.requestId ? r : data.selection ? { ...r, ...data.selection, variantName: data.selection.variantId === "lavender" ? "Lavender" : r.variantName } : { ...r, status: "cancelled" }));
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/arrival-fixture");
  const row = (name: string) => page.locator("details").filter({ has: page.locator("summary").filter({ hasText: name }) });
  await row("Quiet room").locator("summary").click();
  await row("Quiet room").getByRole("button", { name: "Change request" }).click();
  await expect(row("Quiet room").getByRole("combobox")).toHaveCount(0);
  await expect(row("Quiet room").getByRole("button", { name: "Remove request", exact: true })).toHaveCount(2);
  await expect(row("Quiet room").getByText("Maximum 1", { exact: false })).toHaveCount(0);
  await expect(row("Quiet room").getByText("No payment is taken", { exact: false })).toHaveCount(0);
  await row("Room Aroma").locator("summary").click();
  await row("Room Aroma").getByRole("button", { name: "Change request" }).click();
  await row("Room Aroma").getByLabel("Selected option").selectOption("lavender");
  await row("Room Aroma").getByRole("button", { name: "Save request" }).click();
  expect(edits.at(-1)).toMatchObject({ selection: { variantId: "lavender", quantity: 1 } });
  await row("Room instructions").locator("summary").click();
  await row("Room instructions").getByRole("button", { name: "Change request" }).click();
  await row("Room instructions").getByLabel("Room note", { exact: false }).fill("Updated instructions");
  await row("Room instructions").getByRole("button", { name: "Save request" }).click();
  expect(edits.at(-1)).toMatchObject({ selection: { inputs: { note: "Updated instructions" } } });
  expect(edits.at(-1)).not.toHaveProperty("preCheckin");
  await row("Extra pillows").locator("summary").click();
  await row("Extra pillows").getByRole("button", { name: "Change request" }).click();
  await row("Extra pillows").getByRole("button", { name: "Add one Extra pillows Extra pillows" }).click();
  await row("Extra pillows").getByRole("button", { name: "Save request" }).click();
  expect(edits.at(-1)).toMatchObject({ selection: { quantity: 2 } });
  await expect(page.locator("summary").filter({ hasText: "Room Aroma" })).toHaveCount(1);
});
