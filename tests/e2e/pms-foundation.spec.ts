import { test, expect, type BrowserContext } from "@playwright/test";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
if (
  !/^(127\.0\.0\.1|localhost):\d+$/.test(
    process.env.FIRESTORE_EMULATOR_HOST || "",
  ) ||
  !/^(127\.0\.0\.1|localhost):\d+$/.test(
    process.env.FIREBASE_AUTH_EMULATOR_HOST || "",
  )
)
  throw new Error("Only explicit localhost emulators are allowed.");
const app = initializeApp({ projectId: "demo-helpkey-pms" }, "pms-browser"),
  db = getFirestore(app),
  auth = getAuth(app);
const prefix = `pms-browser-${crypto.randomUUID()}`,
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
      "propertyMemberships",
      "propertyInvitations",
      "inventoryCalendars",
      "inventoryHolds",
      "inventoryBlocks",
      "bookings",
      "propertyPayments",
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
test("owner sees both hotels, real setup state and independent public pause", async ({
  page,
  context,
}) => {
  await login(context, "owner");
  await page.goto(`/partner/settings?propertyId=${hotelA}`);
  await expect(
    page.getByRole("heading", { name: "PMS: Ready to use" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pause public bookings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Public bookings: Unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "PMS: Ready to use" }),
  ).toBeVisible();
  expect(
    (await db.collection("properties").doc(hotelB).get()).get("isBookable"),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Resume public bookings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Public bookings: Available" }),
  ).toBeVisible();
  await page
    .getByRole("combobox")
    .filter({ has: page.locator('option[value="none"]') })
    .selectOption("external");
  await page.getByRole("button", { name: "Save opening information" }).click();
  await expect(
    page.getByRole("heading", { name: "PMS: Setup in progress" }),
  ).toBeVisible();
  await page
    .locator("select")
    .filter({ has: page.locator('option[value="external"]') })
    .selectOption("none");
  await page.getByRole("button", { name: "Save opening information" }).click();
  await expect(
    page.getByRole("heading", { name: "PMS: Ready to use" }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("settings-desktop.png"),
    fullPage: true,
  });
});
test("dashboard with missing verification opens setup instead of remaining behind the loading screen", async ({ page, context }) => {
  await login(context, "owner");
  await db.collection("properties").doc(hotelA).update({ "pms.inventoryVerification": FieldValue.delete() });
  await page.goto(`/partner/dashboard?propertyId=${hotelA}`);
  await expect(page.getByRole("heading", { name: "Hotel operations unavailable" })).toBeVisible();
  await expect(page.getByText("Loading partner workspace", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Review PMS setup" }).click();
  await expect(page.getByRole("heading", { name: "PMS: Setup in progress" })).toBeVisible();
  await page.getByRole("button", { name: "Verify inventory", exact: true }).click();
  await expect(page.getByRole("heading", { name: "PMS: Ready to use" })).toBeVisible();
});
test("owner invites a verified account and sees acceptance in team history", async ({
  page,
  context,
  browser,
}) => {
  await login(context, "owner");
  await page.goto(`/partner/settings?propertyId=${hotelA}&section=team`);
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill(`${uid("newstaff")}@example.test`);
  await page
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  const invitation = page.getByRole("textbox", {
    name: "Private invitation link",
  });
  await expect(invitation).toBeVisible();
  const url = await invitation.inputValue();
  const checked = page.waitForResponse((r) => r.url().includes("/api/auth/me"));
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await checked;
  await expect(invitation).toHaveValue(url);
  const employeeContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3014",
  });
  await login(employeeContext, "newstaff");
  const employee = await employeeContext.newPage();
  await employee.goto(url);
  await employee
    .getByRole("button", { name: "Accept hotel invitation" })
    .click();
  await expect(employee).toHaveURL(
    new RegExp(`/partner/settings\\?propertyId=${hotelA}`),
  );
  await expect(
    employee.getByRole("heading", { name: "PMS: Ready to use" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("team invitation accepted", { exact: false }),
  ).toBeVisible();
  await employeeContext.close();
});
test("receptionist sees only the assigned hotel and direct privileged requests fail", async ({
  page,
  context,
}) => {
  await login(context, "receptionist");
  await page.goto(`/partner/reservations?propertyId=${hotelA}`);
  await expect(
    page.getByRole("heading", { name: "Reservations", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Overview", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Export", exact: true }),
  ).toBeDisabled();
  const foreign = await context.request.get(
    `/api/partner/properties/${hotelB}/pms`,
  );
  expect(foreign.status()).toBe(403);
  const financial = await context.request.get(
    `/api/partner/dashboard/overview?propertyId=${hotelA}&date=2026-11-13`,
  );
  expect(financial.status()).toBe(403);
  const exported = await context.request.get(
    `/api/partner/bookings/export?propertyId=${hotelA}`,
  );
  expect(exported.status()).toBe(403);
  await page.goto(`/partner/reservations?propertyId=${hotelB}`);
  await expect(
    page.getByText("You no longer have access to this hotel.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Reservations", exact: true }),
  ).toHaveCount(0);
});
test("housekeeping receives restricted room data and can update cleaning", async ({
  page,
  context,
}) => {
  await login(context, "housekeeper");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/partner/operations?propertyId=${hotelA}`);
  await expect(
    page.getByRole("heading", { name: "Housekeeping", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  const response = await context.request.get(
      `/api/partner/properties/${hotelA}/pms/department`,
    ),
    body = await response.json();
  expect(JSON.stringify(body)).not.toMatch(
    /leadGuest|guestPhone|paidPaise|razorpay|basePricePaise/,
  );
  await page.getByLabel("Cleaning status").selectOption("clean");
  await page.getByRole("button", { name: "Update cleaning status" }).click();
  await expect(
    page.getByText("Vacant · Cleaning: clean", { exact: false }),
  ).toBeVisible();
  expect(
    (
      await context.request.get(`/api/partner/bookings?propertyId=${hotelA}`)
    ).status(),
  ).toBe(403);
  await page.screenshot({
    path: test.info().outputPath("housekeeping-mobile.png"),
    fullPage: true,
  });
});
test("maintenance staff can block shared capacity and release it without guest access", async ({
  page,
  context,
}) => {
  await login(context, "maintenance");
  await page.goto(`/partner/operations?propertyId=${hotelA}`);
  await expect(
    page.getByRole("heading", { name: "Room maintenance", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: /Room/ })
    .selectOption(`${hotelA}-unit`);
  await page.getByLabel("Reason", { exact: true }).fill("Isolated repair test");
  const day = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel("Start", { exact: true }).fill(`${day}T12:00`);
  await page.getByLabel("End", { exact: true }).fill(`${day}T14:00`);
  await page
    .getByRole("button", { name: "Block room for maintenance" })
    .click();
  await expect(
    page.getByText("101 · Isolated repair test", { exact: false }),
  ).toBeVisible();
  const blocks = await db
    .collection("inventoryBlocks")
    .where("propertyId", "==", hotelA)
    .where("status", "==", "active")
    .get();
  expect(blocks.size).toBe(1);
  const calendars = await db
    .collection("inventoryCalendars")
    .where("propertyId", "==", hotelA)
    .get();
  expect(
    calendars.docs.some((d) =>
      Object.values(d.get("blocked") || {}).some((n) => Number(n) > 0),
    ),
  ).toBe(true);
  expect(
    (
      await context.request.get(`/api/partner/bookings?propertyId=${hotelA}`)
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.get(`/api/partner/properties/${hotelA}/pms/team`)
    ).status(),
  ).toBe(403);
  await page.getByRole("button", { name: "Release block" }).click();
  await expect(
    page.getByText("101 · Isolated repair test", { exact: false }),
  ).toHaveCount(0);
  expect((await blocks.docs[0].ref.get()).get("status")).toBe("released");
  expect(
    (await db.collection("roomTypes").doc(`${hotelA}-room`).get()).get(
      "totalInventory",
    ),
  ).toBe(1);
});
test("revocation removes an already-open reservation workspace", async ({
  page,
  context,
}) => {
  await login(context, "receptionist");
  await page.goto(`/partner/reservations?propertyId=${hotelA}`);
  await expect(
    page.getByRole("heading", { name: "Reservations", exact: true }),
  ).toBeVisible();
  const ref = db
    .collection("propertyMemberships")
    .doc(`${hotelA}_${uid("receptionist")}`);
  await ref.update({ status: "revoked", accessRevision: 1 });
  expect(
    (
      await context.request.get(`/api/partner/bookings?propertyId=${hotelA}`)
    ).status(),
  ).toBe(403);
  await expect(
    page.getByText("You no longer have access to this hotel.", {
      exact: false,
    }),
  ).toBeVisible({ timeout: 25000 });
  await expect(
    page.getByRole("heading", { name: "Reservations", exact: true }),
  ).toHaveCount(0);
  await ref.update({ status: "active", accessRevision: 2 });
});
test("account switching and browser history do not restore the previous private workspace", async ({
  page,
  context,
}) => {
  await login(context, "owner");
  await page.goto(`/partner/settings?propertyId=${hotelB}`);
  await expect(
    page.getByRole("heading", { name: "Hotel settings" }),
  ).toBeVisible();
  await page.evaluate(() =>
    sessionStorage.setItem(
      "arrival-draft:test-private",
      "PRIVATE ARRIVAL NOTES",
    ),
  );
  await page
    .getByRole("button", { name: "Open account menu for PMS owner" })
    .click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3014/");
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("arrival-draft:test-private"),
    ),
  ).toBeNull();
  await login(context, "housekeeper");
  await page.goto(`/partner/operations?propertyId=${hotelA}`);
  await expect(
    page.getByRole("heading", { name: "Housekeeping", exact: true }),
  ).toBeVisible();
  const accountChecked = page.waitForResponse(
    (r) => r.url().endsWith("/api/auth/me") && r.status() === 200,
  );
  await page.goBack();
  await accountChecked;
  await expect(page).toHaveURL("http://127.0.0.1:3014/");
  await expect(page.getByText("OWNER PRIVATE MESSAGE")).toHaveCount(0);
  await page.goto(`/partner/settings?propertyId=${hotelB}`);
  await expect(
    page.getByText("You no longer have access to this hotel.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByText("OWNER PRIVATE MESSAGE")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "PMS: Ready to use" }),
  ).toHaveCount(0);
});
test("admin restriction cannot be cleared by an owner", async ({
  context,
  browser,
}) => {
  await login(context, "admin");
  const blocked = await context.request.post(
    `/api/admin/properties/${hotelA}/pms`,
    { data: { disabled: true, reason: "Isolated test restriction" } },
  );
  expect(blocked.status()).toBe(200);
  const ownerContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3014",
  });
  await login(ownerContext, "owner");
  expect(
    (
      await ownerContext.request.post(`/api/partner/properties/${hotelA}/pms`, {
        data: { action: "resume" },
      })
    ).status(),
  ).toBe(403);
  const ownerPage = await ownerContext.newPage();
  await ownerPage.goto(`/partner/settings?propertyId=${hotelA}`);
  await expect(
    ownerPage.getByRole("heading", { name: "PMS: Temporarily disabled" }),
  ).toBeVisible();
  expect(
    (
      await context.request.post(`/api/admin/properties/${hotelA}/pms`, {
        data: { disabled: false, reason: "Isolated test completed" },
      })
    ).status(),
  ).toBe(200);
  await ownerContext.close();
});

test("cashier can collect a balance but cannot access refunds or guest contacts", async ({
  page,
  context,
}) => {
  await login(context, "cashier");
  await page.goto(`/partner/operations?propertyId=${hotelA}`);
  await expect(
    page.getByRole("heading", { name: "Cashier payments", exact: true }),
  ).toBeVisible();
  const payload = await (
    await context.request.get(
      `/api/partner/properties/${hotelA}/pms/department`,
    )
  ).json();
  expect(JSON.stringify(payload)).not.toMatch(
    /PRIVATE-CONTACT|leadGuest|phone|razorpay/,
  );
  await page.getByLabel("Amount (₹)").fill("100");
  await page
    .getByRole("button", { name: "Record collection", exact: true })
    .click();
  await expect(
    page.getByText("Balance ₹900.00", { exact: false }),
  ).toBeVisible();
  const receipts = await db
    .collection("propertyPayments")
    .where("bookingId", "==", `${prefix}-cashier-booking`)
    .get();
  expect(receipts.size).toBe(1);
  const refund = await context.request.post(
    `/api/partner/properties/${hotelA}/pms/department`,
    {
      headers: { "Idempotency-Key": crypto.randomUUID() },
      data: {
        action: "payment",
        input: {
          bookingId: `${prefix}-cashier-booking`,
          operation: {
            action: "refund",
            receiptId: receipts.docs[0].id,
            amountPaise: 100,
            reason: "Forbidden test refund",
            reference: "test",
          },
        },
      },
    },
  );
  expect(refund.status()).toBe(403);
});
test("staff assigned to two hotels can switch hotels without owner-only access", async ({
  page,
  context,
}) => {
  await login(context, "manager");
  await page.goto(`/partner/settings?propertyId=${hotelA}`);
  await expect(
    page.getByRole("heading", { name: "Hotel settings", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Selected hotel: PMS Alpha Hotel",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "PMS Beta Hotel", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`propertyId=${hotelB}`));
  await expect(
    page.getByRole("heading", { name: "PMS: Ready to use" }),
  ).toBeVisible();
  expect(
    (
      await context.request.get(`/api/partner/properties/${hotelB}/pms/team`)
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.get(
        `/api/partner/properties/${hotelB}/kyc/not-a-document`,
      )
    ).status(),
  ).not.toBe(200);
});
test("same-account foreground preserves a manual booking through an identity-check failure", async ({
  page,
  context,
}) => {
  await login(context, "owner");
  await page.goto(`/partner/reservations?propertyId=${hotelA}`);
  await page
    .getByRole("button", { name: "New reservation", exact: true })
    .click();
  const guest = page.getByRole("textbox", { name: "Guest name", exact: true });
  await guest.fill("Unfinished guest draft");
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "unavailable" }),
    }),
  );
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(
    page.getByRole("button", { name: "Retry account check" }),
  ).toBeVisible();
  await expect(guest).toBeHidden();
  await page.unroute("**/api/auth/me");
  await page.getByRole("button", { name: "Retry account check" }).click();
  await expect(guest).toBeVisible();
  await expect(guest).toHaveValue("Unfinished guest draft");
  const checked = page.waitForResponse((r) => r.url().includes("/api/auth/me"));
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await checked;
  await expect(guest).toHaveValue("Unfinished guest draft");
});
test("logout clears private information in another open tab", async ({
  page,
  context,
}) => {
  await login(context, "owner");
  await page.goto(`/partner/settings?propertyId=${hotelA}`);
  const second = await context.newPage();
  await second.goto(`/partner/settings?propertyId=${hotelB}`);
  await expect(
    second.getByRole("heading", { name: "PMS: Ready to use" }),
  ).toBeVisible();
  await page.bringToFront();
  await page
    .getByRole("button", { name: "Open account menu for PMS owner" })
    .click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3014/");
  await expect(
    second.getByRole("heading", { name: "PMS: Ready to use" }),
  ).toHaveCount(0);
  await expect(
    second.getByRole("heading", { name: "Hotel settings" }),
  ).toHaveCount(0);
  await second.close();
});
