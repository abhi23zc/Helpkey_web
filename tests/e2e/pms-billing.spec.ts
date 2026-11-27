import { seller } from "../fixtures/invoices";
import { test, expect, type BrowserContext } from "@playwright/test";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (
  !/^(127\.0\.0\.1|localhost):\d+$/.test(
    process.env.FIRESTORE_EMULATOR_HOST || "",
  ) ||
  !/^(127\.0\.0\.1|localhost):\d+$/.test(
    process.env.FIREBASE_AUTH_EMULATOR_HOST || "",
  )
)
  throw new Error("Only explicit localhost emulators are allowed.");
const app = initializeApp(
    { projectId: "demo-helpkey-pms" },
    "pms-billing-browser",
  ),
  db = getFirestore(app),
  auth = getAuth(app);
const prefix = `billing-browser-${crypto.randomUUID()}`,
  hotelA = `${prefix}-a`,
  hotelB = `${prefix}-b`;
const people = [
  "owner",
  "admin",
  "manager",
  "receptionist",
  "cashier",
  "housekeeper",
  "maintenance",
  "newstaff",
] as const;
const uid = (role: string) => `${prefix}-${role}`;
const cookies = new Map<string, string>();
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
  test.setTimeout(60000);
  for (const role of people) {
    const email = `${uid(role)}@example.test`;
    await auth.createUser({
      uid: uid(role),
      email,
      password: "EmulatorOnly-Test123!",
      emailVerified: true,
    });
    await db
      .collection("users")
      .doc(uid(role))
      .set({
        uid: uid(role),
        fullName: `PMS ${role}`,
        email,
        emailVerified: true,
        roles:
          role === "newstaff"
            ? ["customer"]
            : role === "admin"
              ? ["admin"]
              : ["partner"],
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
          password: "EmulatorOnly-Test123!",
          returnSecureToken: true,
        }),
      },
    );
    const body = await response.json();
    if (!body.idToken) throw new Error("Emulator sign-in failed");
    cookies.set(
      role,
      await auth.createSessionCookie(body.idToken, { expiresIn: 86400000 }),
    );
  }
  for (const [id, name] of [
    [hotelA, "PMS Alpha Hotel"],
    [hotelB, "PMS Beta Hotel"],
  ]) {
    await db
      .collection("properties")
      .doc(id)
      .set({
        ownerId: uid("owner"),
        partnerId: uid("owner"),
        name,
        slug: id,
        status: "active",
        approvalStatus: "approved",
        isBookable: true,
        inventoryEngine: "interval_v1",
        bookingModes: ["overnight"],
        timezone: "Asia/Kolkata",
        checkInTime: "14:00",
        checkOutTime: "11:00",
        address: { line1: "Emulator Road", city: "Test City" },
        publicPhone: "+919876543210",
        pms: {
          version: 1,
          activatedAt: Timestamp.now(),
          openingData: "none",
          teamReviewed: true,
          inventoryVerification: {
            passed: true,
            checkedAt: Timestamp.now(),
            checkedBy: uid("owner"),
          },
        },
      });
    await db.collection("roomTypes").doc(`${id}-room`).set({
      propertyId: id,
      name: "Normal",
      status: "active",
      totalInventory: 1,
      maxAdults: 2,
      maxChildren: 0,
    });
    await db
      .collection("ratePlans")
      .doc(`${id}-rate`)
      .set({
        propertyId: id,
        roomTypeId: `${id}-room`,
        name: "Standard",
        status: "active",
        bookingMode: "overnight",
        pricingModel: "nightly",
        basePricePaise: 100000,
        cancellationPolicyId: `${id}-policy`,
      });
    await db
      .collection("cancellationPolicies")
      .doc(`${id}-policy`)
      .set({ propertyId: id, name: "Flexible", status: "active" });
    await db
      .collection("physicalUnits")
      .doc(`${id}-unit`)
      .set({
        propertyId: id,
        roomTypeId: `${id}-room`,
        label: id === hotelA ? "101" : "201",
        status: "active",
        housekeepingStatus: "dirty",
        revision: 0,
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
  for (const role of [
    "manager",
    "receptionist",
    "cashier",
    "housekeeper",
    "maintenance",
  ])
    await db
      .collection("propertyMemberships")
      .doc(`${hotelA}_${uid(role)}`)
      .set({
        propertyId: hotelA,
        userId: uid(role),
        role,
        status: "active",
        accessRevision: 0,
      });
  await db
    .collection("propertyMemberships")
    .doc(`${hotelB}_${uid("manager")}`)
    .set({
      propertyId: hotelB,
      userId: uid("manager"),
      role: "manager",
      status: "active",
    });
  await db
    .collection("bookings")
    .doc(`${prefix}-cashier-booking`)
    .set({
      propertyId: hotelA,
      guestId: uid("owner"),
      source: "manual_partner",
      confirmationCode: "TESTCASHIER",
      leadGuest: {
        name: "Cashier Test Guest",
        email: "PRIVATE-CONTACT@example.test",
        phone: "+919876543210",
      },
      bookingStatus: "checked_out",
      inventoryReleased: true,
      totalPaise: 100000,
      paidPaise: 0,
      refundedPaise: 0,
      createdAt: Timestamp.now(),
    });
  await db
    .collection("notifications")
    .doc(`${prefix}-owner-notification`)
    .set({
      userId: uid("owner"),
      eventType: "test",
      title: "OWNER PRIVATE MESSAGE",
      body: "Private owner information",
      data: {},
      readAt: null,
      createdAt: Timestamp.now(),
    });
});
test.afterAll(async () => {
  test.setTimeout(60000);
  for (const id of [hotelA, hotelB]) {
    for (const collection of [
      "roomTypes",
      "ratePlans",
      "cancellationPolicies",
      "physicalUnits",
      "physicalUnitCalendars",
      "propertyMemberships",
      "propertyInvitations",
      "inventoryCalendars",
      "inventoryHolds",
      "inventoryBlocks",
      "bookings",
      "propertyPayments",
      "paymentAttempts",
      "refunds",
      "invoices",
      "bookingReferences",
      "bookingNotificationOutbox",
    ]) {
      const docs = await db
        .collection(collection)
        .where("propertyId", "==", id)
        .get();
      for (const doc of docs.docs) await db.recursiveDelete(doc.ref);
    }
    await db.recursiveDelete(db.collection("properties").doc(id));
  }
  await db
    .collection("notifications")
    .doc(`${prefix}-owner-notification`)
    .delete();
  for (const role of people) {
    await db.collection("users").doc(uid(role)).delete();
    await auth.deleteUser(uid(role));
  }
});

async function billingBooking() {
  const id = `${prefix}-billing-${crypto.randomUUID()}`;
  const day = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  await db
    .collection("bookings")
    .doc(id)
    .set({
      propertyId: hotelA,
      guestId: uid("owner"),
      source: "manual_partner",
      confirmationCode: "BILLINGTEST",
      leadGuest: { name: "Billing Guest" },
      roomType: { id: `${hotelA}-room`, name: "Normal" },
      checkIn: day,
      checkOut: day,
      startAt: new Date(Date.now() - 3600000).toISOString(),
      endAt: new Date(Date.now() + 3600000).toISOString(),
      bookingStatus: "confirmed",
      totalPaise: 100000,
      subtotalPaise: 100000,
      paidPaise: 0,
      createdAt: Timestamp.now(),
      customizations: [],
    });
  return id;
}
test("posting review, retained draft, lost-response retries and matching printable statement", async ({
  page,
  context,
}) => {
  await login(context, "owner");
  const id = await billingBooking();
  await page.goto(
    `/partner/reservations?propertyId=${hotelA}&bookingId=${id}&section=billing`,
  );
  const folio = page.getByRole("region", { name: "Folio and billing" });
  await expect(
    folio.getByRole("heading", { name: "Folio / Billing" }),
  ).toBeVisible();
  await folio.getByLabel("Final amount (₹)").focus();
  await page.keyboard.type("20.50");
  await folio
    .getByLabel("Description", { exact: true })
    .fill("Laundry final amount");
  await folio
    .getByLabel("Charge details")
    .fill("Two garments cleaned by hotel");
  await folio.getByRole("button", { name: "Review entry" }).focus();
  await page.keyboard.press("Enter");
  await expect(folio.getByText(/Review: post/)).toBeVisible();
  const path = `**/api/partner/bookings/${id}/folio`;
  const payloads: string[] = [],
    keys: string[] = [];
  let attempt = 0;
  await page.route(path, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    payloads.push(route.request().postData()!);
    keys.push(route.request().headers()["idempotency-key"]);
    attempt++;
    if (attempt === 1) {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort("failed");
    } else if (attempt < 6)
      await route.fulfill({
        status: [429, 401, 403, 422][attempt - 2],
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "TEST_RETRY", message: "Retry retained request" },
        }),
      });
    else await route.continue();
  });
  await folio.getByRole("button", { name: "Confirm posting" }).click();
  await expect(
    folio.getByRole("button", { name: "Retry saved request" }),
  ).toBeVisible();
  for (let n = 0; n < 4; n++) {
    await folio.getByRole("button", { name: "Retry saved request" }).click();
    await expect(
      folio.getByLabel("Description", { exact: true }),
    ).toBeDisabled();
    await expect(
      folio.getByRole("button", { name: "Retry saved request" }),
    ).toBeEnabled();
  }
  await folio.getByRole("button", { name: "Retry saved request" }).click();
  await expect(
    folio.getByRole("button", { name: "Review entry" }),
  ).toBeVisible();
  expect(new Set(payloads).size).toBe(1);
  expect(new Set(keys).size).toBe(1);
  expect(
    (await db.collection("bookings").doc(id).collection("billingEntries").get())
      .size,
  ).toBe(1);
  await expect(
    folio.getByText("₹1,020.50", { exact: true }).first(),
  ).toBeVisible();
  const popupPromise = page.waitForEvent("popup");
  await folio.getByRole("button", { name: "Print statement" }).click();
  const popup = await popupPromise;
  await expect(
    popup.getByText("Itemized billing statement — not a tax invoice."),
  ).toBeVisible();
  await expect(popup.locator("pre")).toContainText("₹1,020.50");
  await expect(popup.locator("pre")).toContainText(
    "Supplemental services (separate pool)",
  );
  await popup.close();
  await folio.screenshot({
    path: `/tmp/helpkey-phase3a-folio-${page.viewportSize()?.width}.png`,
  });
  await folio
    .getByLabel("Description", { exact: true })
    .fill("Retained unsaved draft");
  await page
    .getByRole("navigation", { name: "Reservation sections" })
    .getByRole("button", { name: "payments", exact: true })
    .click();
  await expect(folio.getByLabel("Description", { exact: true })).toHaveValue(
    "Retained unsaved draft",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("cashier opens a private read-only folio within Operations", async ({
  page,
  context,
}) => {
  await login(context, "cashier");
  await page.goto(`/partner/operations?propertyId=${hotelA}`);
  await page
    .getByRole("heading", { name: /Cashier Test Guest/ })
    .locator("..")
    .getByText("Folio / Billing", { exact: true })
    .click();
  const folio = page.getByRole("region", { name: "Folio and billing" });
  await expect(
    folio.getByRole("heading", { name: "Folio / Billing" }),
  ).toBeVisible();
  await expect(folio.getByRole("button", { name: "Review entry" })).toHaveCount(
    0,
  );
  await expect(page.getByText("PRIVATE-CONTACT@example.test")).toHaveCount(0);
  const denied = await page.request.get(
    `/api/partner/bookings/${prefix}-cashier-booking?propertyId=${hotelA}`,
  );
  expect(denied.status()).toBe(403);
});

test("returns a hotel cash receipt on an online-paid booking without exposing provider receipts", async ({
  page,
  context,
}) => {
  await login(context, "owner");
  const id = await billingBooking();
  const onlineId = `${id}-online`;
  await db
    .collection("bookings")
    .doc(id)
    .update({
      source: "web",
      paymentMethod: "online",
      paidPaise: 100000,
      propertyLedgerPaise: 0,
      paymentStatus: "paid",
      razorpayPaymentId: onlineId,
    });
  await db
    .collection("paymentAttempts")
    .doc(onlineId)
    .set({
      bookingId: id,
      propertyId: hotelA,
      paymentId: onlineId,
      amountPaise: 100000,
      status: "captured",
    });
  await page.goto(
    `/partner/reservations?propertyId=${hotelA}&bookingId=${id}&section=payments`,
  );
  await expect(
    page.getByRole("heading", { name: "Payment records", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refund payment", exact: true }),
  ).toHaveCount(0);
  const post = await page.request.post(`/api/partner/bookings/${id}/folio`, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: {
      action: "post",
      expectedRevision: 0,
      category: "laundry",
      description: "Laundry charge",
      amountPaise: 2000,
      details: { explanation: "Two garments cleaned" },
    },
  });
  expect(post.ok(), await post.text()).toBeTruthy();
  const collect = await page.request.post(
    `/api/partner/bookings/${id}/operations`,
    {
      headers: { "Idempotency-Key": crypto.randomUUID() },
      data: { action: "collect", amountPaise: 2000, method: "cash" },
    },
  );
  expect(collect.ok(), await collect.text()).toBeTruthy();
  const cash = (
    await db.collection("propertyPayments").where("bookingId", "==", id).get()
  ).docs.find((d) => d.get("type") === "collection")!;
  const entries = await db
    .collection("bookings")
    .doc(id)
    .collection("billingEntries")
    .get();
  const voided = await page.request.post(`/api/partner/bookings/${id}/folio`, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: {
      action: "void",
      expectedRevision: 1,
      originalEntryId: entries.docs[0].id,
      reason: "Laundry cancelled",
    },
  });
  expect(voided.ok(), await voided.text()).toBeTruthy();
  await page.reload();
  await page
    .getByRole("button", { name: "Refund payment", exact: true })
    .click();
  const form = page.getByRole("region", { name: "Collections and refunds" });
  const original = form.getByLabel("Original receipt", { exact: true });
  await expect(original.locator("option")).toHaveCount(2);
  await expect(original.locator(`option[value="${onlineId}"]`)).toHaveCount(0);
  await original.selectOption(cash.id);
  await form.getByLabel("Amount (₹)", { exact: true }).fill("20");
  await form
    .getByLabel("Payment / return reference")
    .fill("Cash returned to guest");
  await form
    .getByLabel("Reason", { exact: true })
    .fill("Cancelled laundry returned");
  await form
    .getByRole("button", { name: "Review refund", exact: true })
    .click();
  await expect(
    form.getByRole("group", { name: "Confirm payment action" }),
  ).toContainText("has already been returned to the guest");
  await form
    .getByRole("button", { name: "Confirm payment action", exact: true })
    .click();
  await expect(
    page.getByText("Payment record saved.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refund payment", exact: true }),
  ).toHaveCount(0);
  const booking = (await db.collection("bookings").doc(id).get()).data()!;
  expect(booking.propertyRefundedPaise).toBe(2000);
  const folio = await page.request.get(`/api/partner/bookings/${id}/folio`);
  const body = await folio.json();
  expect((body.data ?? body).warnings).toEqual([]);
  expect((body.data ?? body).reservation.refundableExcessPaise).toBe(0);
  expect(
    (await db.collection("refunds").where("bookingId", "==", id).get()).empty,
  ).toBeTruthy();
});

test("invoice settings, explicit review, immutable printing, lost-response recovery and credit-note allocation", async ({ page, context }) => {
  await login(context, "owner");
  await page.goto(`/partner/settings?propertyId=${hotelA}&section=invoices`);
  const settings = page.getByRole("heading", { name: "Invoice settings", exact: true }).locator("..");
  await expect(settings).toBeVisible();
  for (const [label, value] of Object.entries({ "Legal business name": seller.legalName, "Registered address": seller.address, "State": seller.state, "State code": seller.stateCode, "Business contact details": seller.contact, "Authorized signatory": seller.signatory, "Signatory designation": seller.signatoryDesignation, "Document footer": seller.footer })) await settings.getByLabel(label, { exact: true }).fill(value);
  await settings.getByRole("checkbox", { name: "I have confirmed registration status", exact: false }).check();
  await settings.getByRole("button", { name: "Save invoice settings" }).click();
  await expect(settings.getByRole("checkbox", { name: "I have confirmed registration status", exact: false })).not.toBeChecked();
  const id = await billingBooking();
  const originalBooking = (await db.collection("bookings").doc(id).get()).data();
  await page.goto(`/partner/reservations?propertyId=${hotelA}&bookingId=${id}&section=billing`);
  const invoices = page.getByRole("region", { name: "Invoices", exact: true });
  await invoices.getByText("Customer billing and document details", { exact: true }).click();
  await invoices.getByRole("button", { name: "Edit document details" }).click();
  for (const [label, value] of Object.entries({ "Billing recipient name": "Explicit Corporate Recipient", "Billing address": "Billing Road", "Customer state": "Maharashtra", "Customer state code": "27", "Delivery address": "Hotel", "SAC (6 digits)": "996311", "Place of supply": "Maharashtra", "Place of supply state code": "27", "Taxable value (₹)": "1000", "Accountant confirmation / source evidence": "Accountant confirmed original source records" })) await invoices.getByLabel(label, { exact: true }).fill(value);
  // Refreshing the reservation preserves explicitly entered billing identity.
  await invoices.getByRole("button", { name: "Refresh documents" }).click();
  await expect(invoices.getByLabel("Billing recipient name", { exact: true })).toHaveValue("Explicit Corporate Recipient");
  await invoices.getByRole("checkbox", { name: "I confirm the billing recipient", exact: false }).check();
  await invoices.getByRole("button", { name: "Save document details" }).click();
  await invoices.getByRole("button", { name: "Review invoice", exact: true }).click();
  const keys: string[] = [], payloads: string[] = [];
  let attempt = 0;
  await page.route(`**/api/partner/bookings/${id}/invoices`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]); payloads.push(route.request().postData()!); attempt++;
    if (attempt === 1) { const response = await route.fetch(); expect(response.ok(), await response.text()).toBe(true); await route.abort("failed"); }
    else if (attempt < 6) await route.fulfill({ status: [429, 401, 403, 422][attempt - 2], contentType: "application/json", body: JSON.stringify({ error: { code: "TEST_RETRY", message: "Retry retained request" } }) });
    else await route.continue();
  });
  await invoices.getByRole("button", { name: "Issue invoice", exact: true }).click();
  await expect(invoices.getByRole("button", { name: "Resolve issuance" })).toBeVisible();
  await page.reload();
  for (let n = 0; n < 5; n++) { await invoices.getByRole("button", { name: "Resolve issuance" }).click(); if (n < 4) await expect(invoices.getByRole("button", { name: "Resolve issuance" })).toBeEnabled(); }
  await expect(invoices.getByText(/Invoice issued:/)).toBeVisible();
  expect(new Set(keys).size).toBe(1); expect(new Set(payloads).size).toBe(1);
  await page.unroute(`**/api/partner/bookings/${id}/invoices`);
  const docs = await db.collection("invoices").where("bookingId", "==", id).get(); expect(docs.size).toBe(1);
  const doc = docs.docs[0];
  expect((await db.collection("bookings").doc(id).get()).data()).toEqual(originalBooking);
  const popupPromise = page.waitForEvent("popup"); await invoices.getByRole("button", { name: "Print", exact: true }).click(); const popup = await popupPromise;
  await expect(popup.getByRole("heading", { name: "Ordinary invoice", exact: true })).toBeVisible();
  await expect(popup.getByText("Bill to: Explicit Corporate Recipient")).toBeVisible();
  await popup.close();
  const credit = await page.request.post(`/api/partner/bookings/${id}/folio`, { headers: { "idempotency-key": crypto.randomUUID() }, data: { action: "credit", expectedRevision: 0, amountPaise: 1000, category: "other", description: "Goodwill reduction", reason: "Approved goodwill", details: { explanation: "Accountant agreed goodwill" } } }); expect(credit.ok(), await credit.text()).toBe(true);
  await invoices.getByRole("button", { name: "Refresh documents" }).click();
  await invoices.getByText("Create credit note", { exact: true }).click();
  await invoices.getByLabel("Original invoice", { exact: true }).selectOption(doc.id);
  const reduction = await db.collection("bookings").doc(id).collection("billingEntries").get();
  await invoices.getByLabel("Saved folio reduction").selectOption(`entry:${reduction.docs[0].id}`);
  await invoices.getByLabel("Reason", { exact: true }).fill("Partial goodwill allocation");
  await invoices.getByRole("checkbox", { name: "Allocate to this line" }).check();
  await invoices.getByLabel("Taxable value (₹)", { exact: true }).fill("5");
  await invoices.getByRole("button", { name: "Review credit note", exact: true }).click();
  await invoices.getByRole("button", { name: "Issue credit note", exact: true }).click();
  await expect(invoices.getByText(/Credit note issued:/)).toBeVisible();
  expect((await db.collection("bookings").doc(id).get()).get("billingNetPaise")).toBe(-1000);
  expect((await db.collection("bookings").doc(id).get()).get("paidPaise")).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await invoices.screenshot({ path: `/tmp/helpkey-phase3b-invoices-${page.viewportSize()?.width}.png` });
  await login(context, "cashier");
  expect((await page.request.get(`/api/partner/bookings/${id}/invoices/${doc.id}/print`)).status()).toBe(200);
  expect((await page.request.post(`/api/partner/bookings/${id}/invoices`, { headers: { "idempotency-key": "cashier-denied" }, data: { action: "invoice", expectedVersion: "0".repeat(64) } })).status()).toBe(403);
  await login(context, "receptionist"); expect((await page.request.get(`/api/partner/bookings/${id}/invoices/${doc.id}/print`)).status()).toBe(403);
});
