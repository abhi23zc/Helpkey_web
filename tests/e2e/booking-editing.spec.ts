import { expect, test } from "@playwright/test";
const current = {
  bookingMode: "hourly",
  roomTypeId: "room",
  ratePlanId: "rate",
  checkIn: "2030-01-10",
  checkOut: "2030-01-10",
  arrivalTime: "10:00",
  durationMinutes: 120,
  adults: 1,
  children: 0,
  infants: 0,
  occupants: [{ name: "Test Guest", ageGroup: "adult" }],
  bookingContact: {
    name: "Test Guest",
    email: "guest@example.com",
    phone: "+919876543210",
  },
  totalPaise: 200000,
};
const options = {
  timezone: "Asia/Kolkata",
  enabled: true,
  canEditStay: true,
  canEditGuests: true,
  blocker: null,
  revision: 0,
  stayRevision: 0,
  stayDeadline: "2030-01-10T04:30:00Z",
  guestDeadline: "2030-01-10T04:30:00Z",
  cancellationDeadline: "2030-01-09T04:30:00Z",
  hotelContact: { phone: "+919876543210" },
  packages: [
    {
      ratePlanId: "rate",
      roomTypeId: "room",
      name: "Standard",
      roomName: "Double",
    },
  ],
  current,
  active: null,
};
const quote = {
  quoteId: "00000000-0000-4000-8000-000000000000",
  expiresAt: "2030-01-10T04:30:00Z",
  published: { totalPaise: 150000 },
  accepted: {
    subtotalPaise: 180000,
    taxPaise: 18000,
    customerFeePaise: 2000,
    totalPaise: 200000,
  },
  retainedDifferencePaise: 50000,
  creditPaise: 0,
  amountToCollectPaise: 0,
  hotelBalancePaise: 200000,
  serviceImpacts: [],
  currency: "INR",
  previous: {
    startAt: "2030-01-10T04:30:00Z",
    endAt: "2030-01-10T06:30:00Z",
    roomName: "Double",
    totalPaise: 200000,
  },
  proposed: {
    startAt: "2030-01-10T05:30:00Z",
    endAt: "2030-01-10T07:30:00Z",
    roomName: "Double",
  },
  changedInclusions: {
    proposed: { rateInclusions: [], roomAmenities: [], propertyAmenities: [] },
  },
};
for (const width of [1440, 390])
  test(`reviews and applies a retained-price amendment at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/bookings/fixture/edit-options", (route) =>
      route.fulfill({ json: options }),
    );
    await page.route(
      "**/api/bookings/fixture/amendments/quote",
      async (route) => {
        const body = route.request().postDataJSON();
        expect(body.bookingMode).toBeUndefined();
        expect(body.totalPaise).toBeUndefined();
        expect(body.occupants).toEqual(current.occupants);
        await route.fulfill({ json: quote });
      },
    );
    await page.route("**/api/bookings/fixture/amendments", async (route) => {
      expect(route.request().headers()["idempotency-key"]).toBeTruthy();
      await route.fulfill({
        json: {
          amendment: { id: "a", status: "applied", checkoutReplaced: false },
        },
      });
    });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Edit booking", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("Start time").fill("11:00");
    await page
      .getByRole("button", { name: "Review availability and price" })
      .click();
    await expect(
      page.getByRole("region", { name: "Review proposed changes" }),
    ).toContainText("Retained difference");
    await expect(
      page.getByRole("region", { name: "Review proposed changes" }),
    ).toContainText("₹2,000.00");
    expect(
      await page
        .getByRole("dialog")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/booking-editing/review-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Confirm changes", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Your booking changes are confirmed.",
    );
  });
test("preserves entered names after a stale-review conflict", async ({
  page,
}) => {
  await page.route("**/api/bookings/fixture/edit-options", (route) =>
    route.fulfill({ json: options }),
  );
  await page.route("**/api/bookings/fixture/amendments/quote", (route) =>
    route.fulfill({
      status: 409,
      json: {
        error: {
          code: "REVISION_CONFLICT",
          message: "Booking changed. Review again.",
        },
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Edit booking", exact: true }).click();
  await page.getByLabel("adult 1", { exact: true }).fill("Revised Guest");
  await page
    .getByRole("button", { name: "Review availability and price" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Booking changed");
  await expect(page.getByLabel("adult 1", { exact: true })).toHaveValue(
    "Revised Guest",
  );
});
test("locks the reviewed draft while a quote is loading", async ({ page }) => {
  let releaseQuote!: () => void;
  const gate = new Promise<void>((resolve) => { releaseQuote = resolve; });
  await page.route("**/api/bookings/fixture/edit-options", (route) =>
    route.fulfill({ json: options }),
  );
  await page.route("**/api/bookings/fixture/amendments/quote", async (route) => {
    await gate;
    await route.fulfill({ json: quote });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Edit booking", exact: true }).click();
  await page.getByRole("button", { name: "Review availability and price" }).click();
  await expect(page.getByLabel("adult 1", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Start time")).toBeDisabled();
  await expect(page.getByLabel("Change only guest names and reservation contact")).toBeDisabled();
  releaseQuote();
  await expect(page.getByRole("region", { name: "Review proposed changes" })).toBeVisible();
});
test("blocks confirmation until affected services are resolved", async ({
  page,
}) => {
  await page.route("**/api/bookings/fixture/edit-options", (route) =>
    route.fulfill({ json: options }),
  );
  await page.route("**/api/bookings/fixture/amendments/quote", (route) =>
    route.fulfill({
      json: {
        ...quote,
        serviceImpacts: [
          {
            id: "service",
            name: "Airport pickup",
            reasons: ["Service schedule or duration changes"],
            approved: false,
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Edit booking", exact: true }).click();
  await page
    .getByRole("button", { name: "Review availability and price" })
    .click();
  await expect(page.getByText("Airport pickup")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm changes", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("link", { name: "Call hotel" })).toHaveAttribute(
    "href",
    "tel:+919876543210",
  );
});
test("recovers a pending amendment after opening the editor", async ({
  page,
}) => {
  const amendment = {
    id: "a",
    status: "awaiting_payment",
    expiresAt: "2030-01-10T04:30:00Z",
    amountToCollectPaise: 50000,
    currency: "INR",
  };
  await page.route("**/api/bookings/fixture/edit-options", (route) =>
    route.fulfill({
      json: {
        ...options,
        canEditStay: false,
        canEditGuests: false,
        active: amendment,
      },
    }),
  );
  await page.route("**/api/bookings/fixture/amendments/a", (route) =>
    route.fulfill({ json: { amendment, refunds: [] } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Edit booking", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pay ₹500.00" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm changes", exact: true }),
  ).toHaveCount(0);
});
test("allows only guest details after the stay cutoff", async ({ page }) => {
  await page.route("**/api/bookings/fixture/edit-options", (route) =>
    route.fulfill({
      json: { ...options, canEditStay: false, blocker: "EDITING_CLOSED" },
    }),
  );
  await page.route("**/api/bookings/fixture/guest-details", async (route) => {
    expect(route.request().method()).toBe("PATCH");
    expect(route.request().postDataJSON().revision).toBe(0);
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Edit booking", exact: true }).click();
  await expect(
    page.getByLabel("Change only guest names and reservation contact"),
  ).toBeChecked();
  await page.getByLabel("adult 1", { exact: true }).fill("New Guest");
  await page.getByRole("button", { name: "Save guest details" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Guest and reservation contact details saved.",
  );
});
test("shows the hotel's stay times when the customer is in another timezone", async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: "America/Los_Angeles", locale: "en-US" });
  try {
    const page = await context.newPage();
    await page.route("**/api/bookings/fixture/edit-options", (route) => route.fulfill({ json: options }));
    await page.route("**/api/bookings/fixture/amendments/quote", (route) => route.fulfill({ json: quote }));
    await page.goto("/");
    await page.getByRole("button", { name: "Edit booking", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Hotel time (Asia/Kolkata)");
    await page.getByRole("button", { name: "Review availability and price" }).click();
    await expect(page.getByRole("region", { name: "Review proposed changes" })).toContainText("11:00 AM");
    await expect(page.getByRole("region", { name: "Review proposed changes" })).toContainText("1:00 PM");
  } finally {
    await context.close();
  }
});
