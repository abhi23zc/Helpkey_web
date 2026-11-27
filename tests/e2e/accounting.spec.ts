import { test, expect, type BrowserContext } from "@playwright/test";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { accountingFixture } from "../helpers/accounting";
import {
  processAccounting,
  journalCollection,
  stateCollection,
} from "../../lib/accounting/posting";
if (
  !/^(127\.0\.0\.1|localhost):\d+$/.test(
    process.env.FIRESTORE_EMULATOR_HOST || "",
  ) ||
  !/^(127\.0\.0\.1|localhost):\d+$/.test(
    process.env.FIREBASE_AUTH_EMULATOR_HOST || "",
  )
)
  throw Error("Local emulators required");
const app = initializeApp(
  { projectId: "demo-helpkey-finance" },
  "accounting-browser",
);
const db = getFirestore(app),
  auth = getAuth(app),
  prefix = `accounting-ui-${crypto.randomUUID()}`,
  hotel = `${prefix}-hotel`,
  bookingId = `${prefix}-booking`;
const cookies = new Map<string, string>(),
  uid = (role: string) => `${prefix}-${role}`;
async function login(context: BrowserContext, role: string) {
  await context.clearCookies();
  await context.addCookies([
    {
      name: "helpkey_session",
      value: cookies.get(role)!,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
test.beforeAll(async () => {
  process.env.HOTEL_ACCOUNTING_START_AT = "2026-11-24T00:00:00Z";
  for (const role of ["admin", "owner", "staff", "stranger"]) {
    const email = `${uid(role)}@example.test`;
    await auth.createUser({
      uid: uid(role),
      email,
      password: "LocalFixture123!",
      emailVerified: true,
    });
    await db
      .collection("users")
      .doc(uid(role))
      .set({
        fullName: role,
        email,
        emailVerified: true,
        roles: [role === "admin" ? "admin" : "partner"],
        accountStatus: "active",
        isActive: true,
      });
    const response = await fetch(
      `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: "LocalFixture123!",
          returnSecureToken: true,
        }),
      },
    );
    cookies.set(
      role,
      await auth.createSessionCookie((await response.json()).idToken, {
        expiresIn: 86400000,
      }),
    );
  }
  await db
    .collection("properties")
    .doc(hotel)
    .set({
      ownerId: uid("owner"),
      partnerId: uid("owner"),
      name: "Accounting Browser Hotel",
      slug: hotel,
      status: "active",
      approvalStatus: "approved",
      isBookable: true,
      timezone: "Asia/Kolkata",
      currency: "INR",
      address: { city: "Test City" },
    });
  for (const [role, membership] of [
    ["owner", "owner"],
    ["staff", "manager"],
  ])
    await db
      .collection("propertyMemberships")
      .doc(`${hotel}_${uid(role)}`)
      .set({
        propertyId: hotel,
        userId: uid(role),
        role: membership,
        status: "active",
      });
  const f = accountingFixture(210000, 0, true, 1000, bookingId, hotel);
  f.agreement.ownerId = uid("owner");
  await db
    .collection("bookings")
    .doc(bookingId)
    .set({
      ...f.b,
      createdAt: Timestamp.now(),
      confirmationCode: "HK-ACCOUNTING",
      guestId: uid("stranger"),
    });
  await db
    .collection("bookingFinanceAgreementsV1")
    .doc(bookingId)
    .set(f.agreement);
  await db
    .collection("bookingFinanceAgreementsV1")
    .doc(bookingId)
    .collection("proofs")
    .doc("checkout")
    .set(f.proof!);
  await db
    .collection("paymentAttempts")
    .doc(f.sources.online[0].id)
    .set(f.sources.online[0]);
  await processAccounting(db, bookingId);
});
test.afterAll(async () => {
  for (const name of [
    journalCollection,
    "paymentAttempts",
    "refunds",
    "propertyPayments",
  ]) {
    const rows = await db
      .collection(name)
      .where("bookingId", "==", bookingId)
      .get();
    await Promise.all(rows.docs.map((d) => db.recursiveDelete(d.ref)));
  }
  for (const name of [
    "bookings",
    "bookingFinanceAgreementsV1",
    stateCollection,
  ])
    await db.recursiveDelete(db.collection(name).doc(bookingId));
  const requests = await db
    .collection("hotelAccountingRequestsV1")
    .where("actorId", "==", uid("admin"))
    .get();
  await Promise.all(requests.docs.map((d) => d.ref.delete()));
  for (const name of ["projectionOutbox", "projectionJobs"]) {
    const rows = await db
      .collection(name)
      .where("entityId", "==", bookingId)
      .get();
    await Promise.all(rows.docs.map((d) => d.ref.delete()));
  }
  for (const role of ["owner", "staff"])
    await db
      .collection("propertyMemberships")
      .doc(`${hotel}_${uid(role)}`)
      .delete();
  await db.collection("properties").doc(hotel).delete();
  for (const role of ["admin", "owner", "staff", "stranger"]) {
    await db.collection("users").doc(uid(role)).delete();
    await auth.deleteUser(uid(role));
  }
});
test("paid add-ons settle normally and the main history contains only actual payments", async ({
  page,
  context,
}) => {
  const original = (
    await db.collection("bookings").doc(bookingId).get()
  ).data()!;
  const request = {
    id: "extra",
    offeringId: "service-ui",
    offeringVersion: 1,
    name: "Airport pickup",
    kind: "service",
    agreementVersion: 2,
    settlement: "paid",
    status: "confirmed",
    quote: {
      version: 1,
      amountPaise: 10000,
      status: "accepted",
      acceptedAt: "2026-11-24T00:10:00Z",
      scope: "Airport pickup",
      conditions: "Hotel service",
      paymentId: `${bookingId}-extra`,
      paymentStatus: "paid",
    },
  };
  await db
    .collection("properties")
    .doc(hotel)
    .collection("stayCustomizations")
    .doc("service-ui")
    .set({ version: 1, category: "transport", kind: "service" });
  await db
    .collection("bookings")
    .doc(bookingId)
    .update({
      customizations: [request],
      stayPaymentReceipts: [
        {
          requestId: "extra",
          quoteVersion: 1,
          paymentId: request.quote.paymentId,
          orderId: "service-order",
          amountPaise: 10000,
          status: "paid",
        },
      ],
    });
  await db
    .collection("paymentAttempts")
    .doc(request.quote.paymentId)
    .set({
      bookingId,
      propertyId: hotel,
      paymentId: request.quote.paymentId,
      orderId: "service-order",
      amountPaise: 10000,
      currency: "INR",
      stayQuote: true,
      status: "captured",
      createdAt: "2026-11-24T00:11:00Z",
    });
  await processAccounting(db, bookingId);
  await login(context, "admin");
  await page.goto(`/admin/accounting?propertyId=${hotel}`);
  await page.getByRole("tab", { name: /Needs attention/ }).click();
  await expect(
    page.getByText("Held for review", { exact: true }),
  ).toBeVisible();
  await page.getByText("Review add-on settlement", { exact: true }).click();
  await page
    .getByRole("button", { name: "Verify saved service evidence", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Service terms saved for verification" }),
  ).toBeVisible();
  await processAccounting(db, bookingId);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByText("No booking issues to review", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("₹2,000.00", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Payment history", exact: true }).click();
  await expect(page.getByText("Received", { exact: true })).toHaveCount(2);
  await expect(
    page.getByText("Add-on service", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Previous calculation replaced", { exact: true }).first(),
  ).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/accounting/payment-history.png",
    fullPage: true,
  });
  await login(context, "stranger");
  const payload = await (
    await page.request.get(`/api/bookings/${bookingId}`)
  ).json();
  const booking = payload.booking ?? payload.data?.booking;
  expect(booking.paymentSummary).toMatchObject({
    reliable: true,
    roomChargesPaise: 210000,
    addonChargesPaise: 10000,
    grossPaidPaise: 220000,
    outstandingPaise: 0,
  });
  expect(JSON.stringify(booking.paymentSummary)).not.toMatch(
    /commission|ownerId|serviceAgreements/,
  );
  await page.goto(`/trips/${bookingId}`);
  await expect(
    page.getByRole("definition").filter({ hasText: "₹2,200.00" }).first(),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/accounting/guest-payments.png",
    fullPage: true,
  });
  await db.collection("bookings").doc(bookingId).set(original);
  await db.collection("paymentAttempts").doc(request.quote.paymentId).delete();
  // Historical service audit remains immutable; rebuilding the disposable fixture removes its journal only.
  const journal = await db
    .collection(journalCollection)
    .where("bookingId", "==", bookingId)
    .get();
  await Promise.all(journal.docs.map((d) => d.ref.delete()));
  await db.collection(stateCollection).doc(bookingId).delete();
  await processAccounting(db, bookingId);
  await db
    .collection("properties")
    .doc(hotel)
    .collection("stayCustomizations")
    .doc("service-ui")
    .delete();
});
test("admin and owner inspect journal; direct access and commands remain restricted", async ({
  page,
  context,
}) => {
  await login(context, "admin");
  await page.goto("/admin/accounting");
  await page.getByLabel("Hotel", { exact: true }).selectOption(hotel);
  await expect(
    page.getByText("Hotel balance", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Hotel dues", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Pending collections", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Earned commission:", { exact: false }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Retry accounting", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByText("₹1,900.00", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(/Balances may change after deduction review/),
  ).toBeVisible();
  await page
    .getByLabel("Search bookings", { exact: true })
    .fill("NOT-A-BOOKING");
  await expect(
    page.getByText("No matching bookings", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search bookings", { exact: true }).fill("");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/accounting/admin-overview.png",
    fullPage: true,
  });
  await db
    .collection(stateCollection)
    .doc(bookingId)
    .update({ dirty: true, lastError: "Fixture processing failure" });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("Update failed", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /Needs attention/ }).click();
  await page.getByText("View booking details", { exact: true }).click();
  await expect(
    page.getByText(/Last recorded hotel balance: ₹1,900.00/),
  ).toBeVisible();
  await page.getByText("Accounting tools", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry accounting", exact: true }),
  ).toBeVisible();
  await db
    .collection(stateCollection)
    .doc(bookingId)
    .update({ dirty: false, lastError: null });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByText("No booking issues to review", { exact: true }),
  ).toBeVisible();
  await page.getByText("Accounting health check", { exact: true }).click();
  await page
    .getByRole("button", { name: "Check accounting", exact: true })
    .click();
  await expect(
    page.getByText("Sources, journal and summaries reconcile."),
  ).toBeVisible();
  await page.getByRole("tab", { name: /Needs attention/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Payment history", exact: true }),
  ).toBeFocused();
  await expect(page.getByText("Received", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Accounting activity", { exact: true }),
  ).toBeVisible();
  await page.getByText("Accounting activity", { exact: true }).click();
  await page
    .locator("summary")
    .filter({ hasText: "Online payment received" })
    .first()
    .click();
  await page
    .locator("summary:visible")
    .filter({ hasText: "Journal & source details" })
    .click();
  await expect(
    page.getByText(`Source: paymentAttempts/${bookingId}-pay`, { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/accounting/admin-desktop.png",
    fullPage: true,
  });
  const adminApi = `/api/admin/accounting?propertyId=${hotel}`,
    ownerApi = `/api/partner/properties/${hotel}/accounting`;
  expect((await page.request.get(adminApi)).status()).toBe(200);
  await page
    .getByRole("link", { name: "Booking HK-ACCOUNTING", exact: true })
    .first()
    .click();
  await expect(page.getByText("HK-ACCOUNTING", { exact: true })).toBeVisible();
  await login(context, "owner");
  expect((await page.request.get(ownerApi)).status()).toBe(200);
  expect((await page.request.get(adminApi)).status()).toBe(403);
  expect(
    (
      await page.request.post(
        `/api/admin/accounting/commands?propertyId=${hotel}`,
        {
          data: { action: "retry", bookingId, requestId: crypto.randomUUID() },
        },
      )
    ).status(),
  ).toBe(403);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/partner/accounting?propertyId=${hotel}`);
  await expect(page).toHaveURL(new RegExp(`/partner/finances\\?.*propertyId=${hotel}.*tab=bookings`));
  await expect(
    page.getByRole("heading", { name: "Finances", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("₹1,900.00").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry accounting", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/accounting/owner-mobile.png",
    fullPage: true,
  });
  // Retrying an owner read must never fetch the admin-only hotel directory.
  const ownerAdminReads: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/admin/accounting")
      ownerAdminReads.push(request.url());
  });
  await page.route(`**/api/partner/properties/${hotel}/finances`, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "TEMPORARY_FAILURE",
          message: "Temporary accounting test failure.",
        },
      }),
    }),
  );
  await page.reload();
  await expect(
    page.getByRole("alert").filter({ hasText: "Unable to load hotel finances" }),
  ).toBeVisible();
  await page.unroute(`**/api/partner/properties/${hotel}/finances`);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByText("₹1,900.00").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "Unable to load hotel finances" }),
  ).toHaveCount(0);
  expect(ownerAdminReads).toEqual([]);
  await login(context, "staff");
  expect((await page.request.get(ownerApi)).status()).toBe(403);
  await page.goto(`/partner/finances?propertyId=${hotel}`);
  await expect(
    page.getByText(/Owner permission required|Property access required/i),
  ).toBeVisible();
  await login(context, "stranger");
  expect((await page.request.get(ownerApi)).status()).toBe(403);
  await login(context, "admin");
  await db.collection("users").doc(uid("admin")).update({ isActive: false });
  expect((await page.request.get(adminApi)).status()).toBe(401);
});
