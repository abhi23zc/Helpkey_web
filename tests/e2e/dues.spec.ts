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
  "dues-browser",
);
const db = getFirestore(app),
  auth = getAuth(app),
  prefix = `dues-ui-${crypto.randomUUID()}`,
  hotel = `${prefix}-hotel`,
  bookingId = `${prefix}-A`,
  secondId = `${prefix}-B`;
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
      name: "Dues Browser Hotel",
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
  await db
    .collection("hotelFinanceSettingsV1")
    .doc(`hotel_${hotel}`)
    .set({
      revision: 1,
      settings: {
        duesLimit: { type: "limited", amountPaise: 50000 },
        duesWarningPaise: 40000,
        duesGraceDays: 7,
      },
    });
  for (const [id, rate, reference] of [
    [bookingId, 1000, "HK-DUES-A"],
    [secondId, 1500, "HK-DUES-B"],
  ] as const) {
    const f = accountingFixture(0, 210000, true, rate, id, hotel);
    f.agreement.ownerId = uid("owner");
    await db
      .collection("bookings")
      .doc(id)
      .set({
        ...f.b,
        actualCheckOutAt: Timestamp.fromDate(new Date("2026-11-24T00:00:00Z")),
        createdAt: Timestamp.now(),
        confirmationCode: reference,
        guestId: uid("stranger"),
      });
    await db.collection("bookingFinanceAgreementsV1").doc(id).set(f.agreement);
    await db
      .collection("bookingFinanceAgreementsV1")
      .doc(id)
      .collection("proofs")
      .doc("checkout")
      .set(f.proof!);
    await db
      .collection("propertyPayments")
      .doc(f.sources.property[0].id)
      .set(f.sources.property[0]);
    await processAccounting(db, id);
  }
});
test.afterAll(async () => {
  for (const id of [bookingId, secondId]) {
    for (const name of [
      journalCollection,
      "paymentAttempts",
      "refunds",
      "propertyPayments",
    ]) {
      const rows = await db.collection(name).where("bookingId", "==", id).get();
      await Promise.all(rows.docs.map((d) => db.recursiveDelete(d.ref)));
    }
    for (const name of [
      "bookings",
      "bookingFinanceAgreementsV1",
      stateCollection,
    ])
      await db.recursiveDelete(db.collection(name).doc(id));
    for (const name of ["projectionOutbox", "projectionJobs"]) {
      const rows = await db.collection(name).where("entityId", "==", id).get();
      await Promise.all(rows.docs.map((d) => db.recursiveDelete(d.ref)));
    }
  }
  for (const name of [
    "hotelDuesPaymentsV1",
    "hotelDuesCorrectionsV1",
    "hotelDuesReferencesV1",
    "hotelDuesConfirmationsV1",
    "hotelDuesRequestsV1",
  ]) {
    const rows = await db
      .collection(name)
      .where("propertyId", "==", hotel)
      .get();
    await Promise.all(rows.docs.map((d) => db.recursiveDelete(d.ref)));
  }
  for (const role of ["owner", "staff"])
    await db
      .collection("propertyMemberships")
      .doc(`${hotel}_${uid(role)}`)
      .delete();
  for (const role of ["admin", "owner", "staff", "stranger"]) {
    await db.collection("users").doc(uid(role)).delete();
    await auth.deleteUser(uid(role));
  }
  await db.collection("hotelFinanceSettingsV1").doc(`hotel_${hotel}`).delete();
  await db.collection("properties").doc(hotel).delete();
});
test("partial payment, correction, linked replacement and owner/mobile history", async ({
  page,
  context,
}) => {
  await login(context, "admin");
  await page.goto(`/admin/dues?propertyId=${hotel}`);
  await expect(
    page.getByRole("heading", { name: "Hotel Dues", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("₹500.00", { exact: true }).first(),
  ).toBeVisible();
  await page.getByLabel("Select HK-DUES-A", { exact: true }).check();
  await page.getByLabel("Select HK-DUES-B", { exact: true }).check();
  await page
    .getByRole("button", { name: "Record payment received", exact: true })
    .click();
  await page.getByLabel("Payment date", { exact: true }).fill("2026-11-24");
  await page
    .getByLabel("Transaction reference", { exact: true })
    .fill("LOCAL-DUES-350");
  await page
    .getByRole("button", { name: "Review allocation", exact: true })
    .click();
  await expect(page.getByRole("status").first()).toContainText(
    "Enter an amount in rupees",
  );
  await page
    .getByLabel("Amount received in rupees", { exact: true })
    .fill("350");
  await page
    .getByRole("button", { name: "Review allocation", exact: true })
    .click();
  const confirmation = page.getByRole("region", {
    name: "Payment confirmation",
    exact: true,
  });
  await expect(confirmation).toContainText("Dues Browser Hotel");
  await expect(confirmation).toContainText("₹350.00");
  await expect(confirmation).toContainText("Remaining dues ₹150.00");
  await page.screenshot({
    path: "test-results/dues/admin-confirmation.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Confirm payment received", exact: true })
    .click();
  await expect(page.getByRole("status").first()).toHaveText(
    "Payment received recorded. No bank transaction was initiated.",
  );
  await page
    .getByRole("button", { name: "Correct recording", exact: true })
    .click();
  await page
    .getByLabel("Correction reason", { exact: true })
    .fill("Allocated to wrong bookings in local test");
  await page
    .getByRole("button", { name: "Review correction", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Correction confirmation", exact: true }),
  ).toContainText("does not return money through a bank");
  await page
    .getByRole("button", { name: "Confirm correction", exact: true })
    .click();
  await expect(page.getByRole("status").first()).toContainText(
    "recording corrected",
  );
  await page
    .getByRole("button", { name: "Record replacement", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review allocation", exact: true })
    .click();
  await expect(confirmation).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm payment received", exact: true })
    .click();
  await expect(page.getByRole("status").first()).toContainText(
    "Payment received recorded",
  );
  const adminApi = `/api/admin/dues?propertyId=${hotel}`,
    ownerApi = `/api/partner/properties/${hotel}/dues`;
  const view = await (await page.request.get(adminApi)).json();
  expect(view.totals).toMatchObject({
    outstandingPaise: 15000,
    paymentsReceivedPaise: 35000,
  });
  expect(
    (
      await page.request.get(
        `/api/admin/dues/${view.payments[0].id}?propertyId=${hotel}`,
      )
    ).status(),
  ).toBe(200);
  await login(context, "owner");
  expect((await page.request.get(ownerApi)).status()).toBe(200);
  expect((await page.request.get(adminApi)).status()).toBe(403);
  expect(
    (await page.request.get(`${ownerApi}/${view.payments[0].id}`)).status(),
  ).toBe(200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/partner/dues?propertyId=${hotel}`);
  await expect(
    page.getByRole("heading", { name: "Hotel Dues", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("₹150.00", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record payment received", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Payment history", exact: true }).click();
  await expect(page.getByText(/LOCAL-DUES-350/).first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/dues/owner-mobile.png",
    fullPage: true,
  });
  await login(context, "staff");
  expect((await page.request.get(ownerApi)).status()).toBe(403);
  expect(
    (
      await page.request.post(`/api/admin/dues/commands?propertyId=${hotel}`, {
        data: {
          action: "preview_correction",
          paymentId: view.payments[0].id,
          reason: "Forbidden correction",
          requestId: crypto.randomUUID(),
        },
      })
    ).status(),
  ).toBe(403);
  await login(context, "stranger");
  expect((await page.request.get(ownerApi)).status()).toBe(403);
  const guest = await page.request.get(`/api/bookings/${bookingId}`);
  expect(guest.status()).toBe(200);
  expect(await guest.text()).not.toMatch(/hotelDues|LOCAL-DUES-350|HKD-/);
  // Another admin clears the selected booking after this browser prepared a confirmation.
  await login(context, "admin");
  await page.goto(`/admin/dues?propertyId=${hotel}`);
  await page.getByLabel("Select HK-DUES-B", { exact: true }).check();
  await page
    .getByRole("button", { name: "Record payment received", exact: true })
    .click();
  await page
    .getByLabel("Amount received in rupees", { exact: true })
    .fill("100");
  await page.getByLabel("Payment date", { exact: true }).fill("2026-11-24");
  await page
    .getByLabel("Transaction reference", { exact: true })
    .fill("LOCAL-STALE-PREVIEW");
  await page
    .getByRole("button", { name: "Review allocation", exact: true })
    .click();
  await expect(confirmation).toBeVisible();
  const otherPreviewResponse = await page.request.post(
    `/api/admin/dues/commands?propertyId=${hotel}`,
    {
      data: {
        action: "preview_payment",
        requestId: crypto.randomUUID(),
        payment: {
          bookingIds: [secondId],
          amountRupees: "150",
          paymentDate: "2026-11-24",
          method: "upi",
          transactionReference: "LOCAL-CONCURRENT-CLEAR",
          notes: "Local fixture",
        },
      },
    },
  );
  expect(otherPreviewResponse.status()).toBe(200);
  const otherPreview = await otherPreviewResponse.json();
  expect(
    (
      await page.request.post(`/api/admin/dues/commands?propertyId=${hotel}`, {
        data: {
          action: "record_payment",
          requestId: crypto.randomUUID(),
          confirmationId: otherPreview.confirmation.id,
        },
      })
    ).status(),
  ).toBe(200);
  await page
    .getByRole("button", { name: "Confirm payment received", exact: true })
    .click();
  await expect(page.getByRole("status").first()).toContainText(
    "Outstanding dues or supporting evidence changed",
  );
  await expect(confirmation).toHaveCount(0);
  await expect(
    page.getByText(/0 selected bookings · Maximum amount/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review allocation", exact: true }),
  ).toBeDisabled();
});
