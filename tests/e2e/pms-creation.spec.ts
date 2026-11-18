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
    "pms-creation-browser",
  ),
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
      "physicalUnitCalendars",
      "propertyMemberships",
      "propertyInvitations",
      "inventoryCalendars",
      "inventoryHolds",
      "inventoryBlocks",
      "bookings",
      "propertyPayments",
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

async function openForm(
  page: import("@playwright/test").Page,
  context: BrowserContext,
  role: string,
  purpose: "walk_in" | "reservation" = "walk_in",
) {
  await db
    .collection("properties")
    .doc(hotelA)
    .update({
      timezone: "Pacific/Kiritimati",
      "pms.allowEarlyWalkIns": true,
      "pms.inventoryVerification": {
        passed: true,
        checkedAt: Timestamp.now(),
        checkedBy: uid("owner"),
      },
    });
  await login(context, role);
  await page.goto(`/partner/reservations?propertyId=${hotelA}`);
  await page
    .getByRole("button", { name: "New reservation", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Add Manual Booking",
    exact: true,
  });
  await expect(
    dialog.getByLabel("Published rate", { exact: true }),
  ).toHaveValue(`${hotelA}-rate`, { timeout: 20000 });
  await dialog.getByLabel("Reservation purpose").selectOption(purpose);
  await dialog.getByLabel("Guest name", { exact: true }).fill("Phase2B Guest");
  await expect(
    dialog.getByText("Checking hotel availability and price…"),
  ).toHaveCount(0, { timeout: 15000 });
  if (purpose === "walk_in") {
    await expect
      .poll(
        async () =>
          await dialog
            .getByLabel("Physical room", { exact: true })
            .locator("option")
            .count(),
      )
      .toBeGreaterThan(1);
  }
  return dialog;
}
test("receptionist creates an assigned walk-in but cannot record a collection", async ({
  page,
  context,
}) => {
  await db
    .collection("physicalUnits")
    .doc(`${hotelA}-unit`)
    .update({ housekeepingStatus: "clean" });
  const dialog = await openForm(page, context, "receptionist");
  await expect(
    dialog.getByLabel("Payment status").locator('option[value="partial"]'),
  ).toBeDisabled();
  await expect(
    dialog
      .getByLabel("Physical room")
      .locator(`option[value="${hotelA}-unit"]`),
  ).toContainText("Ready now");
  await dialog.getByLabel("Physical room").selectOption(`${hotelA}-unit`);
  await page.screenshot({
    path: test.info().outputPath("reception-form.png"),
    fullPage: true,
  });
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/partner/bookings") &&
      r.request().method() === "POST" &&
      r.status() === 201,
  );
  await dialog
    .getByRole("button", { name: "Create Booking", exact: true })
    .click();
  const body = await (await response).json();
  expect(body).toMatchObject({
    collectedPaise: 0,
    balanceDuePaise: 100000,
    physicalUnitLabel: "101",
  });
  await expect(
    dialog.getByText("Booking Confirmed!", { exact: true }),
  ).toBeVisible();
  const b = (await db.collection("bookings").doc(body.bookingId).get()).data()!;
  expect(b).toMatchObject({
    bookingStatus: "confirmed",
    physicalUnitId: `${hotelA}-unit`,
    guestId: null,
    createdByStaffId: uid("receptionist"),
  });
  await dialog.getByRole("button", { name: /View Reservation/ }).click();
  await expect(
    page.getByRole("heading", { name: "Staying guests and registration" }),
  ).toBeVisible();
});
test("manager advance is atomic with assignment and a lost response replays the exact request", async ({
  page,
  context,
}) => {
  // Another date/room type avoids reusing the first test's occupied allocation.
  const dialog = await openForm(page, context, "manager", "reservation");
  await dialog.getByLabel("Reservation purpose").selectOption("reservation");
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Kiritimati",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + 3 * 86400000));
  const end = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
  for (const [label, value] of [
    ["Check-in date", date],
    ["Check-out date", end],
  ]) {
    await dialog.getByRole("button", { name: label, exact: true }).click();
    const picker = page.getByRole("dialog", { name: label, exact: true });
    const d = new Date(`${value}T12:00:00`);
    const day = new Intl.DateTimeFormat("en-US", { month: "long" }).format(d),
      number = d.getDate();
    await picker
      .getByRole("button", {
        name: new RegExp(`${day} ${number}(st|nd|rd|th), ${d.getFullYear()}`),
      })
      .click();
    await picker.getByRole("button", { name: "Apply", exact: true }).click();
  }
  await expect(
    dialog.getByText("Checking hotel availability and price…"),
  ).toHaveCount(0, { timeout: 15000 });
  await dialog.getByLabel("Physical room").selectOption(`${hotelA}-unit`);
  await dialog.getByLabel("Payment status").selectOption("partial");
  await dialog.getByLabel("Advance amount (₹)").fill("300.50");
  await dialog
    .getByLabel("Payment method", { exact: true })
    .selectOption("upi");
  await dialog
    .getByRole("button", { name: "Create Booking", exact: true })
    .click();
  await expect(
    dialog.getByText("Enter the UPI or card-terminal reference.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Advance amount (₹)")).toHaveValue("300.50");
  await dialog.getByLabel("Collection reference").fill("UPI-TEST-30050");
  let firstBody = "",
    firstKey = "",
    calls = 0,
    createdId = "";
  await page.route("**/api/partner/bookings", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    calls++;
    const raw = route.request().postData()!,
      key = route.request().headers()["idempotency-key"];
    if (calls === 1) {
      firstBody = raw;
      firstKey = key;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      createdId = (await response.json()).bookingId;
      await route.abort("failed");
    } else {
      expect(raw).toBe(firstBody);
      expect(key).toBe(firstKey);
      const interrupted = [429, 401, 403, 422][calls - 2];
      if (interrupted) {
        await route.fulfill({
          status: interrupted,
          contentType: "application/json",
          body: JSON.stringify({
            error: { message: `Retry interrupted (${interrupted})` },
          }),
        });
      } else await route.continue();
    }
  });
  await dialog
    .getByRole("button", { name: "Create Booking", exact: true })
    .click();
  await expect(
    dialog.getByText("Submission was not confirmed", { exact: false }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Advance amount (₹)")).toBeDisabled();
  await expect(dialog.getByLabel("Advance amount (₹)")).toHaveValue("300.50");
  for (const status of [429, 401, 403, 422]) {
    await dialog
      .getByRole("button", { name: "Create Booking", exact: true })
      .click();
    await expect(
      dialog.getByText(`Retry interrupted (${status})`, { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Submission was not confirmed", { exact: false }),
    ).toBeVisible();
    await expect(
      dialog.getByLabel("Guest name", { exact: true }),
    ).toBeDisabled();
    await expect(dialog.getByLabel("Advance amount (₹)")).toBeDisabled();
    await expect(
      dialog.getByLabel("Physical room", { exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Create Booking", exact: true }),
    ).toHaveText("Retry same reservation");
  }
  await dialog
    .getByRole("button", { name: "Create Booking", exact: true })
    .click();
  await expect(
    dialog.getByText("Booking Confirmed!", { exact: true }),
  ).toBeVisible();
  expect(calls).toBe(6);
  const sameReference = await db
    .collection("propertyPayments")
    .where("propertyId", "==", hotelA)
    .get();
  expect(
    sameReference.docs.filter((d) => d.get("reference") === "UPI-TEST-30050"),
  ).toHaveLength(1);
  const created = await db
    .collection("bookings")
    .where("propertyId", "==", hotelA)
    .get();
  expect(
    created.docs.filter((d) => d.get("createdByStaffId") === uid("manager")),
  ).toHaveLength(1);
  const b = (await db.collection("bookings").doc(createdId).get()).data()!;
  expect(b).toMatchObject({
    paidPaise: 30050,
    propertyLedgerPaise: 30050,
    balanceDuePaise: 69950,
    physicalUnitId: `${hotelA}-unit`,
    bookingStatus: "confirmed",
    paymentStatus: "partially_paid",
  });
  expect(
    (
      await db
        .collection("propertyPayments")
        .where("bookingId", "==", createdId)
        .get()
    ).size,
  ).toBe(1);
  const cashierContext = await page
    .context()
    .browser()!
    .newContext({ baseURL: "http://127.0.0.1:3014" });
  await login(cashierContext, "cashier");
  const cash = await cashierContext.request.get(
    `/api/partner/properties/${hotelA}/pms/department?q=${createdId}`,
  );
  expect(cash.status()).toBe(200);
  expect((await cash.json()).bookings[0].balancePaise).toBe(69950);
  await cashierContext.close();
});

test("a room conflict preserves guest input and warns before discarding changes", async ({
  page,
  context,
}) => {
  // Use the second isolated hotel so the earlier successful allocations do not interfere.
  await db
    .collection("properties")
    .doc(hotelB)
    .update({ timezone: "Pacific/Kiritimati", "pms.allowEarlyWalkIns": true });
  await login(context, "manager");
  await page.goto(`/partner/reservations?propertyId=${hotelB}`);
  await page
    .getByRole("button", { name: "New reservation", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Add Manual Booking",
    exact: true,
  });
  await expect(
    dialog.getByLabel("Published rate", { exact: true }),
  ).toHaveValue(`${hotelB}-rate`);
  await dialog.getByLabel("Reservation purpose").selectOption("walk_in");
  await dialog
    .getByLabel("Guest name", { exact: true })
    .fill("Keep This Guest");
  await expect
    .poll(async () =>
      dialog
        .getByLabel("Physical room", { exact: true })
        .locator("option")
        .count(),
    )
    .toBeGreaterThan(1);
  await expect(
    dialog
      .getByLabel("Physical room")
      .locator(`option[value="${hotelB}-unit"]`),
  ).toContainText("dirty");
  await dialog.getByLabel("Physical room").selectOption(`${hotelB}-unit`);
  await page.route("**/api/partner/bookings", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Another assignment overlaps this stay or turnover.",
      }),
    });
  });
  await dialog
    .getByRole("button", { name: "Create Booking", exact: true })
    .click();
  await expect(
    dialog.getByText("Another assignment overlaps this stay or turnover.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Guest name", { exact: true })).toHaveValue(
    "Keep This Guest",
  );
  await expect(dialog.getByLabel("Physical room")).toHaveValue(
    `${hotelB}-unit`,
  );
  await expect(dialog.getByLabel("Guest name", { exact: true })).toBeEnabled();
  page.once("dialog", (prompt) => prompt.dismiss());
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Guest name", { exact: true })).toHaveValue(
    "Keep This Guest",
  );
});
