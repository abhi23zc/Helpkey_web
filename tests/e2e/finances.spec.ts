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
) {
  throw Error("Local emulators required");
}

const app = initializeApp(
  { projectId: "demo-helpkey-finance" },
  "finances-browser",
);
const db = getFirestore(app);
const auth = getAuth(app);
const prefix = `fin-ui-${crypto.randomUUID()}`;
const hotel = `${prefix}-hotel`;
const hotel2 = `${prefix}-hotel2`;
const bReady = `${prefix}-ready`;
const bDues = `${prefix}-dues`;
const bUnassessed = `${prefix}-unassessed`;
const cookies = new Map<string, string>();
const uid = (role: string) => `${prefix}-${role}`;

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
  process.env.HOTEL_ACCOUNTING_START_AT = "2026-01-01T00:00:00Z";
  for (const role of ["admin", "owner", "staff"]) {
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

  for (const [id, name] of [
    [hotel, "Primary Finances Hotel"],
    [hotel2, "Secondary Finances Hotel"],
  ] as const) {
    await db.collection("properties").doc(id).set({
      ownerId: uid("owner"),
      partnerId: uid("owner"),
      name,
      slug: id,
      status: "active",
      approvalStatus: "approved",
      isBookable: true,
      timezone: "Asia/Kolkata",
      currency: "INR",
      address: { city: "Test City" },
    });
    await db
      .collection("propertyMemberships")
      .doc(`${id}_${uid("owner")}`)
      .set({
        propertyId: id,
        userId: uid("owner"),
        role: "owner",
        status: "active",
      });
  }
  await db
    .collection("propertyMemberships")
    .doc(`${hotel}_${uid("staff")}`)
    .set({
      propertyId: hotel,
      userId: uid("staff"),
      role: "manager",
      status: "active",
    });

  await db
    .collection("hotelFinanceSettingsV1")
    .doc(`hotel_${hotel}`)
    .set({
      revision: 1,
      settings: {
        commissionBasisPoints: 1000,
        minimumPayoutPaise: 50000,
        payoutCycle: "daily",
        payoutDelayDays: 0,
      },
    });

  for (const [bid, online, cash] of [
    [bReady, 210000, 0],
    [bUnassessed, 210000, 0],
    [bDues, 0, 210000],
  ] as const) {
    const f = accountingFixture(online, cash, true, 1000, bid, hotel);
    f.agreement.ownerId = uid("owner");
    f.agreement.terms.effective.payoutDelayDays = 0;
    f.b.actualCheckOutAt = "2026-11-24T00:00:00Z";
    f.b.createdAt = Timestamp.fromDate(new Date("2026-11-24T00:00:00Z"));
    const batch = db.batch();
    batch.create(db.collection("bookings").doc(bid), f.b);
    batch.create(db.collection("bookingFinanceAgreementsV1").doc(bid), f.agreement);
    if (f.proof) {
      batch.create(
        db
          .collection("bookingFinanceAgreementsV1")
          .doc(bid)
          .collection("proofs")
          .doc("checkout"),
        f.proof,
      );
    }
    for (const r of f.sources.online)
      batch.create(db.collection("paymentAttempts").doc(r.id), r);
    for (const r of f.sources.property)
      batch.create(db.collection("propertyPayments").doc(r.id), r);
    await batch.commit();
    await processAccounting(db, bid);
  }
});

test.afterAll(async () => {
  for (const bid of [bReady, bDues, bUnassessed]) {
    for (const col of [
      journalCollection,
      "paymentAttempts",
      "propertyPayments",
      "refunds",
    ]) {
      const snap = await db.collection(col).where("bookingId", "==", bid).get();
      await Promise.all(snap.docs.map((d) => db.recursiveDelete(d.ref)));
    }
    for (const col of [
      "bookings",
      "bookingFinanceAgreementsV1",
      stateCollection,
      "hotelPayoutAssessmentsV1",
      "hotelPayoutReservationsV1",
      "hotelOwnerFinanceBookingsV1",
    ]) {
      await db.recursiveDelete(db.collection(col).doc(bid));
    }
  }
  for (const col of [
    "hotelDuesPaymentsV1",
    "hotelDuesCorrectionsV1",
    "hotelDuesReferencesV1",
    "hotelDuesConfirmationsV1",
    "hotelDuesRequestsV1",
    "hotelDuesReportsV1",
    "hotelDuesReportRequestsV1",
    "hotelOwnerFinanceActivityV1",
  ]) {
    const snap = await db.collection(col).where("propertyId", "==", hotel).get();
    await Promise.all(snap.docs.map((d) => db.recursiveDelete(d.ref)));
  }
  for (const id of [hotel, hotel2]) {
    await db.collection("hotelOwnerFinanceOverviewV1").doc(id).delete().catch(() => {});
    await db.collection("properties").doc(id).delete().catch(() => {});
    await db.collection("hotelFinanceSettingsV1").doc(`hotel_${id}`).delete().catch(() => {});
  }
  for (const role of ["admin", "owner", "staff"]) {
    await auth.deleteUser(uid(role)).catch(() => {});
    await db.collection("users").doc(uid(role)).delete().catch(() => {});
  }
});

test("unified owner finances desktop/mobile layouts, redirects, detail drawers, and owner-report/admin-verification flow", async ({
  page,
  context,
}) => {
  await login(context, "owner");

  // 1. Old links redirect cleanly preserving hotel
  await page.goto(`/partner/accounting?propertyId=${hotel}`);
  await expect(page).toHaveURL(new RegExp(`/partner/finances\\?.*propertyId=${hotel}.*tab=bookings`));
  await expect(page.getByRole("heading", { name: "Finances", exact: true })).toBeVisible();

  // Sidebar has single Finances entry and none of the old three entries
  await expect(page.getByRole("link", { name: "Finances" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Accounting" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Payouts" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Hotel Dues" })).toHaveCount(0);

  // Unassessed deduction is labeled explicitly before deductions and never exposes internal metadata
  await expect(page.getByText(/Includes amounts before unassessed deductions/i)).toBeVisible();
  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toMatch(/sourceFingerprint|hotelAccountingJournalV1/);

  // Keyboard navigation & desktop detail drawer
  await page.getByRole("button", { name: `Inspect ${bUnassessed}`, exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("owner-finances-desktop.png"), fullPage: true });

  // Mobile layout check (no horizontal overflow)
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator("main").first().evaluate(
    (element) => getComputedStyle(element).paddingLeft,
  )).toBe("0px");
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  )).toBe(true);
  await page.screenshot({ path: test.info().outputPath("owner-finances-mobile.png"), fullPage: true });

  // Owner submits a reported dues payment
  await page.getByRole("button", { name: "Report payment" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Amount paid (₹)").fill("200");
  await page.getByLabel("Payment date").fill("2026-11-25");
  await page.getByLabel("Transaction reference").fill("E2E-UTR-200");
  await page.getByRole("button", { name: "Review details" }).click();
  await page.getByRole("button", { name: "Submit payment report" }).click();
  await expect(page.getByText(/awaiting Helpkey verification/i)).toBeVisible();
  await expect(page.getByRole("dialog", { name: /^Reported payment / })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Hotel switching clears hotel-specific state and loads secondary hotel
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: /Selected hotel:/i }).click();
  await page.getByRole("button", { name: "Secondary Finances Hotel" }).click();
  await expect(page.getByText("Secondary Finances Hotel").first()).toBeVisible();

  // Admin verifies and records the reported payment
  await login(context, "admin");
  await page.goto(`/admin/dues?propertyId=${hotel}`);
  await page.getByRole("tab", { name: /Reported payments/i }).click();
  await expect(page.getByText("E2E-UTR-200")).toBeVisible();
  await page.getByRole("button", { name: "Record reported payment" }).click();
  await page.getByRole("button", { name: "Review report allocation" }).click();
  await page.getByRole("button", { name: "Confirm payment received" }).click();
  await expect(page.getByText(/Payment received recorded/i)).toBeVisible();

  // Owner sees Recorded report & confirmed dues receipt
  await login(context, "owner");
  await page.goto(`/partner/finances?propertyId=${hotel}&tab=reports`);
  await expect(page.getByText("Recorded").first()).toBeVisible();
  await page.getByRole("tab", { name: "Payments", exact: true }).click();
  await expect(page.getByText("E2E-UTR-200")).toBeVisible();
});
