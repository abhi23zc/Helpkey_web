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
  "payout-browser",
);
const db = getFirestore(app),
  auth = getAuth(app),
  prefix = `payout-ui-${crypto.randomUUID()}`,
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
      name: "Payout Browser Hotel",
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
  f.agreement.terms.effective.payoutDelayDays = 0;
  await db
    .collection("hotelFinanceSettingsV1")
    .doc(`hotel_${hotel}`)
    .set({
      revision: 1,
      settings: { minimumPayoutPaise: 0, payoutCycle: "daily" },
    });
  await db
    .collection("bookings")
    .doc(bookingId)
    .set({
      ...f.b,
      actualCheckOutAt: Timestamp.fromDate(new Date("2026-11-24T00:00:00Z")),
      createdAt: Timestamp.now(),
      confirmationCode: "HK-PAYOUT",
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
  for (const name of ["hotelPayoutsV1", "hotelPayoutRequestsV1"]) {
    const rows = await db
      .collection(name)
      .where("propertyId", "==", hotel)
      .get();
    await Promise.all(rows.docs.map((d) => db.recursiveDelete(d.ref)));
  }
  for (const name of ["hotelPayoutAssessmentsV1", "hotelPayoutReservationsV1"])
    await db.recursiveDelete(db.collection(name).doc(bookingId));
  await db.collection("hotelFinanceSettingsV1").doc(`hotel_${hotel}`).delete();
  await db.collection("properties").doc(hotel).delete();
  for (const name of ["hotelPrivateBanksV1", "hotelPayoutReadinessV1"])
    await db.recursiveDelete(db.collection(name).doc(hotel));
  await db.recursiveDelete(db.collection("partnerProfiles").doc(uid("owner")));
  for (const role of ["admin", "owner", "staff", "stranger"]) {
    await db.collection("users").doc(uid(role)).delete();
    await auth.deleteUser(uid(role));
  }
});
test("admin prepares, cancels and records a local payment; owner and staff permissions hold on mobile", async ({
  page,
  context,
}) => {
  await login(context, "admin");
  await page.goto(`/admin/payouts?propertyId=${hotel}`);
  await expect(
    page.getByRole("heading", { name: "Payout Browser Hotel", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: /Needs attention/ }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Ready to pay", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Awaiting eligibility", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Paid to date", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Online collections awaiting settlement:"),
  ).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/payouts/admin-needs-attention.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: /Needs attention/ }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: /^Ready/ })).toBeFocused();
  await expect(
    page.getByText("No bookings ready to pay", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /Needs attention/ }).click();
  await page.getByText("Review deductions", { exact: true }).last().click();
  await page
    .getByRole("button", { name: "Save deduction review", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Review commission tax" }),
  ).toBeVisible();
  for (const label of [
    "Commission tax",
    "Statutory deductions",
    "Gateway fees",
    "Other adjustments",
  ]) {
    await page
      .getByLabel(`${label} status`, { exact: true })
      .selectOption(
        label === "Statutory deductions"
          ? "not_applicable"
          : label === "Gateway fees"
            ? "amount"
            : "zero",
      );
    await page
      .getByLabel(`${label} reason`, { exact: true })
      .fill("Verified local fixture only");
    if (label === "Gateway fees")
      await page
        .getByLabel(`${label} amount in rupees`, { exact: true })
        .fill("0");
  }
  await page
    .getByLabel("Gateway fees amount in rupees", { exact: true })
    .fill("10.001");
  await page
    .getByRole("button", { name: "Save deduction review", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Enter a valid rupee amount" }),
  ).toBeVisible();
  await page
    .getByLabel("Gateway fees amount in rupees", { exact: true })
    .fill("20.00");
  await page
    .getByRole("button", { name: "Save deduction review", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Assessment saved");
  await expect(page.getByRole("tab", { name: /^Ready/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByLabel("Select HK-PAYOUT", { exact: true }).check();
  await expect(
    page.getByRole("button", { name: "Review payout", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/payouts/admin-ready.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Review payout", exact: true })
    .click();
  const preparation = page.getByRole("region", {
    name: "Payout preparation review",
  });
  await expect(preparation).toContainText("₹1,880.00");
  expect(
    (await db.collection("hotelPayoutReservationsV1").doc(bookingId).get())
      .exists,
  ).toBe(false);
  await page.getByLabel("Select HK-PAYOUT", { exact: true }).uncheck();
  await expect(preparation).toHaveCount(0);
  await page.getByLabel("Select HK-PAYOUT", { exact: true }).check();
  await page
    .getByRole("button", { name: "Review payout", exact: true })
    .click();
  await expect(preparation).toBeVisible();
  await db
    .collection("hotelFinanceSettingsV1")
    .doc(`hotel_${hotel}`)
    .update({ "settings.minimumPayoutPaise": 1 });
  await page
    .getByRole("button", { name: "Confirm preparation", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed since your review" }),
  ).toBeVisible();
  await expect(preparation).toHaveCount(0);
  expect(
    (await db.collection("hotelPayoutReservationsV1").doc(bookingId).get())
      .exists,
  ).toBe(false);
  await page
    .getByRole("button", { name: "Review payout", exact: true })
    .click();
  await expect(preparation).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm preparation", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Payout prepared");
  await page.getByText("Cancel this prepared payout", { exact: true }).click();
  await page
    .getByLabel("Cancellation reason", { exact: true })
    .fill("Cancel local batch to verify release");
  await page
    .getByRole("button", { name: "Cancel payout", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Payout cancelled");
  await page.getByRole("tab", { name: /^Ready/ }).click();
  await page.getByLabel("Select HK-PAYOUT", { exact: true }).check();
  await page
    .getByRole("button", { name: "Review payout", exact: true })
    .click();
  await expect(preparation).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm preparation", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Payout prepared");
  await page.getByText("Record payment", { exact: true }).click();
  await page.getByLabel("Payment date", { exact: true }).fill("2026-11-24");
  await page
    .getByLabel("Transaction reference (required)", { exact: true })
    .fill("LOCAL-BROWSER-PAYMENT");
  await page
    .getByRole("checkbox", { name: /I acknowledge the current bank details/ })
    .check();
  await page
    .getByRole("button", { name: "Review payment", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Payment confirmation" }),
  ).toContainText("₹1,880.00");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/payouts/admin-confirmation.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Confirm recorded payment", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "External payment recorded. No transfer was initiated.",
  );
  const adminApi = `/api/admin/payouts?propertyId=${hotel}`,
    ownerApi = `/api/partner/properties/${hotel}/payouts`;
  const paid = (await (await page.request.get(adminApi)).json()).payouts.find(
    (p: { status: string }) => p.status === "Paid",
  );
  expect(
    (
      await page.request.get(
        `/api/admin/payouts/${paid.id}?propertyId=${hotel}`,
      )
    ).status(),
  ).toBe(200);
  const adminStatement = `/api/admin/payouts/${paid.id}/statement?propertyId=${hotel}`;
  const adminStatementResponse = await page.request.get(adminStatement);
  expect(adminStatementResponse.status()).toBe(200);
  expect(
    (
      await page.request.get(
        `/api/admin/payouts/${paid.id}/statement?propertyId=${hotel}-other`,
      )
    ).status(),
  ).toBe(404);
  expect(adminStatementResponse.headers()["cache-control"]).toContain(
    "no-store",
  );
  const statementHtml = await adminStatementResponse.text();
  expect(statementHtml).toContain("₹1,880.00");
  expect(statementHtml).toContain("₹20.00");
  expect(statementHtml).not.toMatch(
    /Verified local fixture only|fingerprint|actorId|hotelRevision/,
  );
  const statementPage = await context.newPage();
  await statementPage.goto(adminStatement);
  await expect(
    statementPage.getByRole("heading", {
      name: "Settlement statement",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    statementPage.getByText("LOCAL-BROWSER-PAYMENT", { exact: true }),
  ).toBeVisible();
  await statementPage.screenshot({
    path: "test-results/payouts/settlement-statement.png",
    fullPage: true,
  });
  await statementPage.emulateMedia({ media: "print" });
  await expect(
    statementPage.getByRole("button", {
      name: "Print / Save as PDF",
      exact: true,
    }),
  ).toBeHidden();
  await statementPage.pdf({
    path: "test-results/payouts/settlement-statement.pdf",
    printBackground: true,
    preferCSSPageSize: true,
  });
  const savedPayout = (
    await db.collection("hotelPayoutsV1").doc(paid.id).get()
  ).data()!;
  const longId = `${prefix}-long-statement`;
  await db
    .collection("hotelPayoutsV1")
    .doc(longId)
    .set({
      ...savedPayout,
      id: longId,
      status: "Cancelled",
      payment: null,
      reference: "HKP-LONG-STATEMENT",
      grossPaise: savedPayout.grossPaise * 50,
      deductionsPaise: savedPayout.deductionsPaise * 50,
      finalPaise: savedPayout.finalPaise * 50,
      bookings: Array.from({ length: 50 }, (_, i) => ({
        ...savedPayout.bookings[0],
        bookingId: `${bookingId}-print-${i}`,
        reference: `LONG-BOOKING-${i + 1}-REFERENCE-FOR-PRINT-LAYOUT`,
      })),
    });
  await statementPage.goto(
    `/api/admin/payouts/${longId}/statement?propertyId=${hotel}`,
  );
  await statementPage.pdf({
    path: "test-results/payouts/settlement-statement-many.pdf",
    printBackground: true,
    preferCSSPageSize: true,
  });
  expect(await statementPage.locator("tbody tr").count()).toBe(100);
  await statementPage.close();
  await login(context, "owner");
  expect((await page.request.get(ownerApi)).status()).toBe(200);
  expect((await page.request.get(adminApi)).status()).toBe(403);
  expect((await page.request.get(`${ownerApi}/${paid.id}`)).status()).toBe(200);
  const ownerStatement = `${ownerApi}/${paid.id}/statement`;
  expect((await page.request.get(ownerStatement)).status()).toBe(200);
  expect(await (await page.request.get(ownerStatement)).text()).toBe(
    statementHtml,
  );
  expect((await page.request.get(adminStatement)).status()).toBe(403);
  expect(
    (
      await page.request.post(
        `/api/admin/payouts/preview?propertyId=${hotel}`,
        { data: { bookingIds: [bookingId] } },
      )
    ).status(),
  ).toBe(403);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/partner/payouts?propertyId=${hotel}`);
  await expect(
    page.getByRole("heading", { name: "Hotel Payouts", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/LOCAL-BROWSER-PAYMENT/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review payout", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/payouts/owner-mobile.png",
    fullPage: true,
  });
  await login(context, "staff");
  expect((await page.request.get(ownerApi)).status()).toBe(403);
  expect((await page.request.get(ownerStatement)).status()).toBe(403);
  expect(
    (
      await page.request.post(
        `/api/admin/payouts/commands?propertyId=${hotel}`,
        {
          data: {
            action: "prepare",
            bookingIds: [bookingId],
            requestId: crypto.randomUUID(),
          },
        },
      )
    ).status(),
  ).toBe(403);
  await login(context, "stranger");
  expect((await page.request.get(ownerApi)).status()).toBe(403);
  expect((await page.request.get(ownerStatement)).status()).toBe(403);
  const customerResponse = await page.request.get(`/api/bookings/${bookingId}`);
  expect(customerResponse.status()).toBe(200);
  expect(await customerResponse.text()).not.toMatch(
    /hotelPayout|LOCAL-BROWSER-PAYMENT|HKP-/,
  );
});

test("admin readiness and owner private bank editor work on desktop and mobile", async ({
  page,
  context,
}) => {
  await login(context, "admin");
  const api = `/api/admin/properties/${hotel}/payout-readiness`;
  await page.goto(`/admin/properties/${hotel}/payout-readiness`);
  await expect(
    page.getByRole("heading", { name: "Setup incomplete" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit business details", exact: true })
    .click();
  for (const [label, value] of [
    ["Business name", "Browser Fixture Company"],
    ["Business email", "office@example.test"],
    ["Business phone", "+919876543210"],
    ["Address line 1", "123 Fixture Road"],
    ["City", "Pune"],
    ["State", "Maharashtra"],
    ["Postal code", "411001"],
    ["Country code", "IN"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page
    .getByRole("button", { name: "Save business details", exact: true })
    .click();
  await expect(
    page.getByText("Browser Fixture Company", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Update bank details", exact: true })
    .click();
  for (const [label, value] of [
    ["Account holder name", "Browser Fixture Owner"],
    ["Account number", "001234567890"],
    ["Confirm account number", "001234567890"],
    ["IFSC", "HDFC0001234"],
    ["Bank name", "Browser Fixture Bank"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page
    .getByLabel("Confirm account number", { exact: true })
    .fill("001234567891");
  await page
    .getByRole("button", { name: "Save bank details", exact: true })
    .click();
  await expect(
    page.getByLabel("Confirm account number", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByText("Account numbers must match.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Confirm account number", { exact: true })
    .fill("001234567890");
  await page
    .getByRole("button", { name: "Save bank details", exact: true })
    .click();
  await expect(page.getByText(/•••• 7890/)).toBeVisible();
  expect(await (await page.request.get(api)).text()).not.toContain(
    "001234567890",
  );
  await page
    .getByLabel(/Describe the external admin check/)
    .fill("Checked account externally for this fixture");
  await page
    .getByRole("button", { name: "Mark bank details Reviewed", exact: true })
    .click();
  await expect(
    page.getByText("Checked account externally for this fixture", {
      exact: false,
    }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/payouts/readiness-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page
        .locator("main")
        .first()
        .evaluate((el) => getComputedStyle(el).paddingLeft),
    )
    .toBe("0px");
  await expect
    .poll(() =>
      page
        .locator("main main")
        .evaluate((el) => el.getBoundingClientRect().width),
    )
    .toBeGreaterThan(300);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/payouts/readiness-mobile.png",
    fullPage: true,
  });
  await login(context, "owner");
  const ownerApi = `/api/partner/properties/${hotel}/bank-details`;
  await page.goto(`/partner/settings/bank?propertyId=${hotel}`);
  await expect(
    page.getByRole("heading", { name: "Bank details", exact: true }),
  ).toBeVisible();
  // A bank number must stay hidden if focus was lost while reveal was in flight.
  let releaseReveal!: () => void;
  let revealArrived!: () => void;
  const heldReveal = new Promise<void>((resolve) => {
    releaseReveal = resolve;
  });
  const revealRequested = new Promise<void>((resolve) => {
    revealArrived = resolve;
  });
  const revealRoute = `**/api/partner/properties/${hotel}/bank-details/reveal`;
  await page.route(revealRoute, async (route) => {
    const response = await route.fetch();
    revealArrived();
    await heldReveal;
    await route.fulfill({ response });
  });
  await page
    .getByRole("button", {
      name: "Reveal account number for 30 seconds",
      exact: true,
    })
    .click();
  await revealRequested;
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  releaseReveal();
  await expect(
    page.getByRole("button", {
      name: "Reveal account number for 30 seconds",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(page.getByText(/001234567890/)).toHaveCount(0);
  await page.unroute(revealRoute);
  await page
    .getByRole("button", {
      name: "Reveal account number for 30 seconds",
      exact: true,
    })
    .click();
  await expect(page.getByText(/001234567890/)).toBeVisible();
  await page
    .getByRole("button", { name: "Hide account number", exact: true })
    .click();
  await expect(page.getByText(/001234567890/)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Update bank details", exact: true })
    .click();
  for (const [label, value] of [
    ["Account holder name", "Browser Fixture Owner"],
    ["Account number", "001234567890"],
    ["Confirm account number", "001234567890"],
    ["IFSC", "HDFC0001234"],
    ["Bank name", "Changed By Owner"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page
    .getByRole("button", { name: "Save bank details", exact: true })
    .click();
  await expect(page.getByText(/Changed By Owner/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/payouts/bank-owner-mobile.png",
    fullPage: true,
  });
  await login(context, "staff");
  expect((await page.request.get(ownerApi)).status()).toBe(403);
  expect(
    (
      await page.request.post(`${ownerApi}/reveal`, {
        data: { expectedBankVersion: "irrelevant" },
      })
    ).status(),
  ).toBe(403);
  expect((await page.request.get(api)).status()).toBe(403);
  await login(context, "admin");
  const view = await (await page.request.get(api)).json();
  expect(view.reviewed.bank).toBe(false);
  const response = await page.request.post(`${api}/reveal`, {
    data: { expectedBankVersion: view.bankVersion },
  });
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect((await response.json()).accountNumber).toBe("001234567890");
  await db.collection("users").doc(uid("admin")).update({ isActive: false });
  try {
    expect([401, 403]).toContain((await page.request.get(api)).status());
  } finally {
    await db.collection("users").doc(uid("admin")).update({ isActive: true });
  }
  await login(context, "stranger");
  const guest = await page.request.get(`/api/bookings/${bookingId}`);
  expect(guest.status()).toBe(200);
  expect(await guest.text()).not.toMatch(
    /001234567890|encryptedAccount|dataFingerprint|Browser Fixture Bank|Changed By Owner/,
  );
});
