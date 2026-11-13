import { expect, test, type Page } from "@playwright/test";
import { selectedBuckets } from "../../lib/partner/dashboard/domain";
const row = {
  id: "booking-one",
  confirmationCode: "HK-1234",
  guestName: "Ada Guest",
  roomName: "Deluxe",
  checkIn: "2026-10-31",
  checkOut: "2026-10-31",
  nights: 0,
  bookingMode: "hourly",
  startAt: "2026-10-31T04:00:00Z",
  endAt: "2026-10-31T10:00:00Z",
  paymentStatus: "paid",
  bookingStatus: "confirmed",
  balanceDuePaise: 0,
  preCheckinSubmitted: true,
};
const overview = (propertyId = "hotel-one") => ({
  attention: {
    asOf: "2026-10-31T05:00:00Z",
    today: "2026-10-31",
    uniqueReservationCount: 1,
    overdueArrivals: 1,
    overdueDepartures: 0,
    requestStays: 0,
    operations: { overdue: [row], overdue_departures: [], requests: [] },
  },
  generatedAt: "2026-10-31T05:00:00Z",
  timezone: "Asia/Kolkata",
  today: "2026-10-31",
  period: { start: "2026-10-25", end: "2026-10-31" },
  warnings: [],
  property: {
    name: propertyId,
    status: "active",
    approvalStatus: "approved",
    isLive: true,
    isBookable: true,
  },
  readiness: {
    percentage: 50,
    completed: 1,
    total: 2,
    checks: [
      {
        key: "rooms",
        label: "Active rooms",
        complete: true,
        href: "/partner/rooms",
      },
      {
        key: "photos",
        label: "Approved photos",
        complete: false,
        href: "/partner/listing",
      },
    ],
  },
  metrics: {
    arrivals: 1,
    expectedArrivals: 1,
    completedArrivals: 0,
    departures: 1,
    expectedDepartures: 1,
    completedDepartures: 0,
    occupancy: 25,
    stayingTonight: 0,
    pendingRequests: 0,
    noShowRisk: 1,
    bookedPaise: 10000,
    paidPaise: 10000,
    refundedPaise: 1000,
    netPaise: 9000,
    propertyCollectedPaise: 0,
    serviceCollectedPaise: 1000,
    platformCollectedPaise: 10000,
    outstandingPaise: 0,
    bookingCount: 1,
    cancellationCount: 0,
    roomHours: 6,
    roomNights: 0,
    unansweredReviews: 0,
  },
  series: [
    {
      key: "2026-10-31",
      label: "31 Oct",
      start: "2026-10-31",
      end: "2026-10-31",
      bookedPaise: 10000,
      paidPaise: 10000,
      refundedPaise: 1000,
      netPaise: 9000,
      occupancy: 25,
    },
  ],
  availability: [
    {
      date: "2026-10-31",
      total: 1,
      remaining: 0,
      reserved: 1,
      blocked: 0,
      percentage: 0,
    },
  ],
  upcomingReservations: [row],
  operations: {
    overdue_departures: [],
    arrivals: [row],
    departures: [row],
    in_house: [],
    requests: [],
    overdue: [row],
    balances: [],
  },
  review: { summary: { average: 0, count: 0 }, latest: null },
  alerts: [
    {
      type: "overdue",
      title: "Overdue arrivals · now",
      detail: "1 confirmed reservation past arrival time",
      href: "/partner/reservations?propertyId=hotel-one&date=2026-10-31&view=overdue&scope=all",
    },
  ],
});
async function fixture(page: Page) {
  await page.clock.setFixedTime(new Date("2026-10-31T05:00:00Z"));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let body: unknown;
    if (url.pathname === "/api/partner/dashboard")
      body = {
        user: {
          uid: "owner",
          fullName: "Hotel Owner",
          photoURL: "/bad-avatar",
        },
        businessName: "Owner Group",
        currency: "INR",
        properties: ["hotel-one", "hotel-two"].map((id) => ({
          id,
          name: id === "hotel-one" ? "First Hotel" : "Second Hotel",
          status: "active",
          approvalStatus: "approved",
          isBookable: true,
          timezone: "Asia/Kolkata",
          slug: id,
          coverImageUrl: "/bad-image",
        })),
      };
    else if (url.pathname === "/api/partner/dashboard/overview") {
      const value = overview(url.searchParams.get("propertyId")!);
      const from = url.searchParams.get("from")!,
        to = url.searchParams.get("to")!;
      value.period = { start: from, end: to };
      value.series = selectedBuckets(
        from,
        to,
        url.searchParams.get("range") as "daily" | "weekly" | "monthly",
      ).map((b) => ({ ...value.series[0], ...b }));
      body = value;
    } else if (url.pathname === "/api/notifications")
      body = { notifications: [], unreadCount: 0 };
    else if (url.pathname.endsWith("/search"))
      body = {
        bookings: [
          {
            id: row.id,
            confirmationCode: row.confirmationCode,
            leadGuest: { name: row.guestName },
          },
        ],
      };
    else if (url.pathname.endsWith("/operations"))
      body = {
        events: [],
        payments: [],
        onlinePayments: [],
        refunds: [],
        units: [],
        features: { allocation: false, payments: false, amendments: false },
        revision: 0,
      };
    else if (url.pathname.endsWith("/status")) body = { ok: true };
    else if (url.pathname.endsWith("/stay-requests")) body = { events: [] };
    else if (url.pathname.endsWith("/booking-one"))
      body = {
        booking: {
          ...row,
          propertyId: "hotel-one",
          propertyName: "First Hotel",
          leadGuest: {
            name: "Ada Guest",
            phone: "+919876543210",
            email: "ada@example.com",
          },
          ratePlanName: "Flexible",
          adults: 1,
          children: 0,
          currency: "INR",
          totalPaise: 10000,
          paidPaise: 10000,
          refundedPaise: 0,
          customizations: [],
          stayRevision: 0,
          timezone: "Asia/Kolkata",
        },
      };
    else body = { rooms: [], roomTypes: [], ratePlans: [] };
    await route.fulfill({ json: body });
  });
}
for (const width of [390, 768, 1366])
  test(`functional overview at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page);
    await page.goto("/partner/dashboard?propertyId=hotel-one&date=2026-10-31");
    await expect(
      page.getByRole("heading", { name: "First Hotel", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Dashboard reporting date" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Dashboard date range" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Dashboard date range" }),
    ).toContainText("25 Oct 2026 – 31 Oct 2026");
    await expect(page.getByText("Listing completeness 50%")).toBeVisible();
    await expect(page.getByRole("button", { name: /Ada Guest/ })).toBeVisible();
    await expect(
      page.getByText(/Hourly stay · Pre check-in submitted/),
    ).toBeVisible();
    await page.getByRole("button", { name: /Ada Guest/ }).click();
    await expect(
      page.getByRole("heading", { name: "Reservation details" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Check in", exact: true }).click();
    const action = page.waitForRequest(
      (r) => r.url().endsWith("/status") && r.method() === "POST",
    );
    await page
      .getByRole("button", { name: "Confirm action", exact: true })
      .click();
    await action;
    await page.getByRole("button", { name: "Close panel" }).click();
    await page.getByRole("button", { name: "monthly", exact: true }).click();
    await expect(page).toHaveURL(/range=monthly/);
    await page.getByRole("button", { name: /Refresh dashboard/ }).click();
    await page.screenshot({
      path: `test-results/partner-dashboard/overview-${width}.png`,
      fullPage: true,
    });
    // Verify Action Center sidebar drawer opens upon clicking Needs attention card
    await page.getByRole("button", { name: /Needs attention/ }).click();
    await expect(
      page.getByRole("heading", { name: "Action center" }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/partner-dashboard/action-center-${width}.png`,
    });
    await page.getByRole("button", { name: "Close panel" }).click();
    await expect(
      page.getByRole("heading", { name: "Action center" }),
    ).not.toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test("property switching, scoped search, navigation and failure recovery", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/partner/dashboard?propertyId=hotel-one&date=2026-10-31");
  await page.getByRole("combobox").fill("Ada");
  await page.getByRole("option", { name: /Ada Guest/ }).click();
  await expect(
    page.getByRole("heading", { name: "Reservation details" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: /First Hotel/ }).click();
  await page.getByRole("button", { name: /Second Hotel/ }).click();
  await expect(
    page.getByRole("heading", { name: "Second Hotel", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/propertyId=hotel-two/);
  await expect(
    page.getByRole("link", { name: "Update availability" }),
  ).toHaveAttribute("href", /propertyId=hotel-two.*tab=inventory/);
  await page.route("**/api/partner/dashboard/overview?**", (route) =>
    route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } }),
  );
  await page.getByRole("button", { name: "weekly", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Temporarily unavailable",
    { timeout: 15000 },
  );
  await expect(page.getByText("No successful update yet")).toBeVisible();
});
test("refreshes after 60 seconds and restores URL view on browser back", async ({
  page,
}) => {
  await page.clock.install();
  await fixture(page);
  let requests = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/partner/dashboard/overview?")) requests++;
  });
  await page.goto("/partner/dashboard?propertyId=hotel-one&date=2026-10-31");
  await expect(
    page.getByRole("heading", { name: "First Hotel", exact: true }),
  ).toBeVisible();
  const initial = requests;
  await page.clock.fastForward(61_000);
  await expect.poll(() => requests).toBeGreaterThan(initial);
  await page
    .getByRole("button", { name: "Guest requests (0)", exact: true })
    .click();
  await expect(page).toHaveURL(/view=requests/);
  await expect(page.getByText("No reservations in this view.")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("button", { name: /Ada Guest/ })).toBeVisible();
});
test("no property shows onboarding without fictional hotel data", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/partner/dashboard", (route) =>
    route.fulfill({
      json: {
        properties: [],
        user: { uid: "owner", fullName: "Owner" },
        businessName: "Owner",
        currency: "INR",
      },
    }),
  );
  await page.goto("/partner/dashboard");
  await expect(
    page.getByRole("heading", { name: "Start welcoming guests" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Add a property", exact: true }),
  ).toHaveAttribute("href", "/partner/onboarding");
  await expect(page.getByText("The Balmoral Hotel")).toHaveCount(0);
});

for (const width of [390, 768, 1366]) {
  test(`empty ranges, grouping, live alert links and recovery at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page);
    const calls: URL[] = [];
    await page.route("**/api/partner/dashboard/overview?**", async (route) => {
      const url = new URL(route.request().url());
      calls.push(url);
      const value = overview();
      const from = url.searchParams.get("from")!,
        to = url.searchParams.get("to")!;
      value.period = { start: from, end: to };
      value.series = selectedBuckets(
        from,
        to,
        url.searchParams.get("range") as "daily" | "weekly" | "monthly",
      ).map((b) => ({
        ...value.series[0],
        ...b,
        bookedPaise: 0,
        paidPaise: 0,
        refundedPaise: 0,
        netPaise: 0,
      }));
      value.metrics.bookedPaise = 0;
      value.metrics.paidPaise = 0;
      value.metrics.refundedPaise = 0;
      value.metrics.netPaise = 0;
      Object.assign(value.metrics, {
        arrivals: 0,
        expectedArrivals: 0,
        completedArrivals: 0,
        departures: 0,
        expectedDepartures: 0,
        completedDepartures: 0,
        occupancy: 0,
        stayingTonight: 0,
        platformCollectedPaise: 0,
        propertyCollectedPaise: 0,
        serviceCollectedPaise: 0,
        bookingCount: 0,
        cancellationCount: 0,
        roomHours: 0,
        roomNights: 0,
      });
      value.operations = {
        ...value.operations,
        arrivals: [],
        departures: [],
        in_house: [],
        requests: [],
        balances: [],
      };
      value.upcomingReservations = [];
      value.availability = [
        {
          ...value.availability[0],
          date: to,
          total: 1,
          remaining: 1,
          reserved: 0,
          percentage: 100,
        },
      ];
      await route.fulfill({ json: value });
    });
    await page.goto(
      "/partner/dashboard?propertyId=hotel-one&date=2026-10-31&from=2026-11-01&to=2026-11-29",
    );
    await expect(page).toHaveURL(/date=2026-11-29/);
    await expect(
      page.getByRole("heading", { name: "No financial activity" }),
    ).toBeVisible();
    await expect(
      page.getByText("Auto · weekly totals", { exact: false }),
    ).toBeVisible();
    expect(calls.at(-1)?.searchParams.get("range")).toBe("weekly");
    await expect(
      page.getByRole("link", { name: "Update availability" }),
    ).toHaveAttribute(
      "href",
      /calendarStart=2026-11-01&calendarEnd=2026-11-29/,
    );
    await page.getByRole("button", { name: /Needs attention now/ }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toContainText("1 unique reservation needs attention");
    await expect(
      drawer.getByRole("link", { name: /Open current workload/ }),
    ).toHaveAttribute("href", /date=2026-10-31.*scope=all/);
    await page.getByRole("button", { name: "Close panel" }).click();
    await page.getByRole("button", { name: "daily", exact: true }).click();
    await page.getByRole("button", { name: "Table", exact: true }).click();
    await expect(page.getByRole("table").first().getByRole("row")).toHaveCount(
      30,
    );
    await page.getByRole("button", { name: "Chart", exact: true }).click();
    await page.getByRole("button", { name: "View last 7 days" }).click();
    await expect(page).toHaveURL(/from=2026-10-25&to=2026-10-31/);
    await expect(page).toHaveURL(/date=2026-10-31/);
    await page.goBack();
    await expect(page).toHaveURL(/from=2026-11-01&to=2026-11-29/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/partner-dashboard/empty-range-${width}.png`,
      fullPage: true,
    });
  });
  test(`dense charts have readable labels and keyboard details at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page);
    await page.goto(
      "/partner/dashboard?propertyId=hotel-one&from=2026-10-01&to=2026-10-31&range=daily",
    );
    const chart = page.getByRole("group", {
      name: "Booking value, payments received and refunds issued chart",
      exact: true,
    });
    await expect(chart.getByRole("button")).toHaveCount(31);
    const help = page.getByRole("img", { name: /Booked room hours divided/ });
    await help.click();
    await expect(
      page.getByRole("tooltip").filter({ hasText: "Booked room hours" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page).not.toHaveURL(/view=in_house/);
    await help.press("Escape");
    expect(await chart.locator("text").allTextContents()).not.toContain("…");
    expect(
      (await chart.locator("text").allTextContents()).length,
    ).toBeLessThanOrEqual(11);
    await chart.getByRole("button").first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(chart.getByRole("button").nth(1)).toBeFocused();
    await expect(
      page.getByRole("tooltip").getByText("2 Oct 2026", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Sold out/ }).first(),
    ).toHaveAttribute(
      "href",
      /calendarStart=2026-10-31&calendarEnd=2026-10-31/,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/partner-dashboard/dense-chart-${width}.png`,
      fullPage: true,
    });
  });
}

test("slow range changes, stale refresh failures and refund-only charts stay honest", async ({
  page,
}) => {
  await fixture(page);
  let release: () => void = () => {};
  let delayed = false;
  await page.route("**/api/partner/dashboard/overview?**", async (route) => {
    const url = new URL(route.request().url());
    const value = overview();
    const from = url.searchParams.get("from")!,
      to = url.searchParams.get("to")!;
    value.period = { start: from, end: to };
    if (from === "2026-11-01") {
      delayed = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    value.series = [
      {
        ...value.series[0],
        key: from,
        start: from,
        end: to,
        bookedPaise: 0,
        paidPaise: 0,
        refundedPaise: 1000,
        netPaise: -1000,
      },
    ];
    value.metrics.netPaise = -1000;
    await route.fulfill({ json: value });
  });
  await page.goto("/partner/dashboard?propertyId=hotel-one&date=2026-10-31");
  await expect(
    page.getByRole("heading", { name: "First Hotel", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    history.pushState(
      {},
      "",
      "/partner/dashboard?propertyId=hotel-one&from=2026-11-01&to=2026-11-29&date=2026-11-29",
    ),
  );
  await expect.poll(() => delayed).toBe(true);
  await expect(
    page.getByRole("status", { name: "Loading financial report" }),
  ).toBeVisible();
  await expect(
    page.getByText("No financial activity", { exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() =>
    history.pushState(
      {},
      "",
      "/partner/dashboard?propertyId=hotel-one&from=2026-11-02&to=2026-11-03&date=2026-11-03",
    ),
  );
  const latestChart = page.getByRole("group", {
    name: "Booking value, payments received and refunds issued chart",
    exact: true,
  });
  await expect(latestChart).toBeVisible();
  release();
  await expect(latestChart.getByRole("button").first()).toHaveAttribute(
    "aria-label",
    /^2 Nov 2026/,
  );
  await page.route("**/api/partner/dashboard/overview?**", (route) =>
    route.fulfill({ status: 503, json: { error: "Dashboard update failed" } }),
  );
  await page.getByRole("button", { name: /Refresh dashboard/ }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Showing the last successful update.",
  );
  await expect(page.getByText(/Last successful update/)).toBeVisible();
  await expect(
    page.getByRole("group", {
      name: "Booking value, payments received and refunds issued chart",
      exact: true,
    }),
  ).toBeVisible();
});

for (const width of [390, 768, 1366]) {
  test(`financial chart tooltip is lightweight and dismissible at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page);
    await page.route("**/api/partner/dashboard/overview?**", (route) => {
      const value = overview();
      value.series = selectedBuckets("2026-10-01", "2026-10-07", "daily").map(
        (bucket, i) => ({
          ...value.series[0],
          ...bucket,
          ...(i === 1
            ? { bookedPaise: 0, paidPaise: 0, refundedPaise: 0, netPaise: 0 }
            : {}),
        }),
      );
      return route.fulfill({ json: value });
    });
    await page.goto(
      "/partner/dashboard?propertyId=hotel-one&from=2026-10-01&to=2026-10-07&range=daily",
    );
    const chart = page.getByRole("group", {
      name: "Booking value, payments received and refunds issued chart",
      exact: true,
    });
    const days = chart.getByRole("button");
    const tooltip = page.getByRole("tooltip");
    await expect(chart).toBeVisible();
    await expect(tooltip).toHaveCount(0);
    await expect(
      page.getByText("Tap, hover or focus a date", { exact: false }),
    ).toHaveCount(0);
    await days.nth(1).locator("rect").first().hover();
    await expect(
      tooltip.getByText("2 Oct 2026", { exact: true }),
    ).toBeVisible();
    await expect(tooltip).toContainText("No financial activity");
    await expect(tooltip).not.toContainText("₹0");
    await expect(chart.locator('rect[stroke="#b78929"]')).toHaveCount(0);
    await expect(chart.locator('line[stroke="#94a3b8"]')).toHaveCount(1);
    const chartBounds = await chart.boundingBox(),
      tooltipBounds = await tooltip.boundingBox();
    expect(tooltipBounds!.x).toBeGreaterThanOrEqual(chartBounds!.x);
    expect(tooltipBounds!.x + tooltipBounds!.width).toBeLessThanOrEqual(
      chartBounds!.x + chartBounds!.width + 1,
    );
    await page.getByRole("button", { name: "Chart", exact: true }).hover();
    await expect(tooltip).toHaveCount(0);
    await days.first().locator("rect").first().hover();
    await expect(tooltip).toContainText("Booking value");
    await expect(tooltip).toContainText("₹100.00");
    await page.screenshot({
      path: info.outputPath(`financial-tooltip-${width}.png`),
      fullPage: true,
    });
    await tooltip.hover();
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tooltip).toHaveCount(0);
    await days.first().focus();
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(days.nth(1)).toBeFocused();
    await expect(tooltip).toContainText("No financial activity");
    await expect(chart.locator('[tabindex="0"]')).toHaveCount(1);
    await page.keyboard.press("End");
    await expect(days.last()).toBeFocused();
    await expect(tooltip).toContainText("7 Oct 2026");
    await page.keyboard.press("Home");
    await expect(days.first()).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(tooltip).toHaveCount(0);
    await page.getByRole("button", { name: "Table", exact: true }).click();
    const table = page.getByRole("table", { name: /Financial report/ });
    await expect(
      table.getByRole("rowheader", { name: "2 Oct", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test.describe("touch financial chart", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("tap shows amounts and outside taps dismiss the tooltip", async ({
    page,
  }) => {
    await fixture(page);
    await page.goto(
      "/partner/dashboard?propertyId=hotel-one&from=2026-10-01&to=2026-10-07&range=daily",
    );
    const chart = page.getByRole("group", {
      name: "Booking value, payments received and refunds issued chart",
      exact: true,
    });
    const day = chart.getByRole("button").nth(2);
    const tooltip = page.getByRole("tooltip");
    await day.locator("rect").first().tap();
    await expect(tooltip).toContainText("3 Oct 2026");
    await page.getByRole("button", { name: "Chart", exact: true }).tap();
    await expect(tooltip).toHaveCount(0);
    await day.locator("rect").first().tap();
    await expect(tooltip).toBeVisible();
    await page.getByRole("button", { name: "Table", exact: true }).tap();
    await expect(tooltip).toHaveCount(0);
  });
});

const accessShell = (property: Record<string, unknown> = {}) => ({
  user: { uid: "owner", fullName: "Hotel Owner" },
  currency: "INR",
  businessName: "Owner Group",
  properties: [
    {
      id: "hotel-one",
      name: "First Hotel",
      timezone: "Asia/Kolkata",
      role: "owner",
      permissions: ["reports.read", "setup.read"],
      ...property,
    },
  ],
});

test("incomplete PMS setup shows its recovery link instead of a permanent skeleton", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/partner/dashboard", (route) =>
    route.fulfill({
      json: accessShell({
        pmsState: "setup",
        operationsReason:
          "PMS setup is incomplete. Verify inventory in Settings.",
        operationsIssues: [
          { id: "inventory", label: "Inventory verification required", complete: false, detail: "Verify your room inventory in PMS setup before using hotel operations." },
          { id: "opening", label: "Opening information needs review", complete: false, detail: "Confirm whether existing reservations or balances need to be brought across." },
        ],
      }),
    }),
  );
  await page.goto("/partner/dashboard");
  await expect(
    page.getByRole("heading", { name: "Hotel operations unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Review PMS setup" }),
  ).toHaveAttribute("href", "/partner/settings?propertyId=hotel-one");
  await expect(
    page.getByText("Loading partner workspace", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("PMS setup is incomplete. Verify inventory in Settings.");
  await expect(page.getByText("Inventory verification required", { exact: true })).toBeVisible();
  await expect(page.getByText("Opening information needs review", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Contact support", exact: true })).toHaveAttribute("href", "/help");
  for (const width of [390, 1366]) {
    await page.setViewportSize({ width, height: 950 });
    await expect(page.getByRole("link", { name: "Review PMS setup" })).toBeVisible();
    await expect.poll(() => page.getByRole("alert").evaluate(element => {
      const notice = element.getBoundingClientRect();
      const sidebar = document.querySelector("aside")?.getBoundingClientRect();
      const edge = Math.max(0, sidebar?.right ?? 0);
      return notice.left >= edge + 8 && notice.left <= edge + 32 && notice.right <= innerWidth;
    })).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`access-notice-${width}.png`), fullPage: true, animations: "disabled" });
  }
});

test("role-restricted overview shows the permitted workspace instead of loading forever", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/partner/dashboard", (route) =>
    route.fulfill({
      json: accessShell({
        role: "receptionist",
        permissions: ["reservation.read"],
      }),
    }),
  );
  await page.goto("/partner/dashboard");
  await expect(
    page.getByRole("heading", {
      name: "This page is not available for your role",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open permitted workspace" }),
  ).toHaveAttribute("href", "/partner/reservations?propertyId=hotel-one");
  await expect(
    page.getByText("Loading partner workspace", { exact: true }),
  ).toHaveCount(0);
});

test("failed hotel loading releases the skeleton and can recover through retry", async ({
  page,
}) => {
  await fixture(page);
  let failed = true;
  await page.route("**/api/partner/dashboard", (route) =>
    route.fulfill(
      failed
        ? {
            status: 503,
            json: {
              error: {
                code: "TEMPORARY",
                message: "Hotel access is temporarily unavailable.",
              },
            },
          }
        : { json: accessShell() },
    ),
  );
  await page.goto("/partner/dashboard");
  await expect(page.getByRole("alert")).toContainText(
    "Hotel access is temporarily unavailable.",
  );
  await expect(
    page.getByText("Loading partner workspace", { exact: true }),
  ).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Retry loading hotels" }).click();
  await expect(
    page.getByRole("heading", { name: "Hotel operations unavailable" }),
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByText("Loading partner workspace", { exact: true }),
  ).toHaveCount(0);
});

test("a property that becomes blocked after the overview loaded can recover without a stale overlay", async ({
  page,
}) => {
  await fixture(page);
  let blocked = false;
  await page.route("**/api/partner/dashboard", (route) =>
    route.fulfill({
      json: accessShell(
        blocked ? { operationsReason: "Hotel disabled by its owner." } : {},
      ),
    }),
  );
  await page.goto("/partner/dashboard");
  await expect(
    page.getByText("Loading partner workspace", { exact: true }),
  ).toHaveCount(0);
  blocked = true;
  await page.evaluate(() =>
    window.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(
    page.getByRole("heading", { name: "Hotel operations unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByText("Loading partner workspace", { exact: true }),
  ).toHaveCount(0);
  blocked = false;
  await page.evaluate(() =>
    window.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(
    page.getByRole("heading", { name: "Hotel operations unavailable" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Loading partner workspace", { exact: true }),
  ).toHaveCount(0);
});
