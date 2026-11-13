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

test("walk-in creation uses hotel time on a foreign-timezone device and preserves input through retry", async ({
  page,
  context,
}) => {
  await db
    .collection("properties")
    .doc(hotelA)
    .update({
      "pms.allowEarlyWalkIns": true,
      timezone: "Pacific/Kiritimati",
      "pms.inventoryVerification": {
        passed: true,
        checkedAt: Timestamp.now(),
        checkedBy: uid("owner"),
      },
    });
  await login(context, "receptionist");
  await page.goto(`/partner/reservations?propertyId=${hotelA}`);
  await page
    .getByRole("button", { name: "New reservation", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Add Manual Booking",
    exact: true,
  });
  await expect(dialog.getByLabel("Reservation purpose")).toBeEnabled({
    timeout: 15000,
  });
  await dialog.getByLabel("Reservation purpose").selectOption("walk_in");
  await dialog
    .getByRole("button", { name: "Check-in date", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Check-in date",
    exact: true,
  });
  await picker.getByRole("button", { name: "Today", exact: true }).click();
  await expect(
    picker.getByRole("button", { name: "Apply", exact: true }),
  ).toBeEnabled();
  await picker.getByRole("button", { name: "Apply", exact: true }).click();
  await dialog.getByLabel("Guest name", { exact: true }).fill("Priya Actual");
  await dialog
    .getByLabel("Accompanying adult names", { exact: false })
    .fill("Ravi Actual");
  await dialog.getByLabel("Adults", { exact: true }).fill("2");
  await dialog.getByText("Someone else made this booking").click();
  await dialog.getByLabel("Booking contact name").fill("Travel Booker");
  await dialog.getByLabel("Booking contact email").fill("booker@example.test");
  await dialog
    .getByLabel("Room category", { exact: true })
    .selectOption(`${hotelA}-room`);
  await dialog
    .getByLabel("Published rate", { exact: true })
    .selectOption(`${hotelA}-rate`);
  await expect(
    dialog.getByText("Review occupancy:", { exact: false }),
  ).toBeVisible({ timeout: 20000 });
  const expectedDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Kiritimati",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await expect(
    dialog.getByLabel(`Recorded arrival time (${expectedDate})`),
  ).toBeVisible();
  let failed = false;
  await page.route("**/api/partner/bookings", async (route) => {
    if (route.request().method() === "POST" && !failed) {
      failed = true;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Temporary test failure" } }),
      });
    } else await route.continue();
  });
  await dialog
    .getByRole("button", { name: "Create Booking", exact: true })
    .click();
  await expect(dialog.getByText("Temporary test failure")).toBeVisible();
  await expect(dialog.getByLabel("Guest name", { exact: true })).toHaveValue(
    "Priya Actual",
  );
  await page.screenshot({
    path: test.info().outputPath("walk-in-form.png"),
    fullPage: true,
  });
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/partner/bookings") &&
      r.request().method() === "POST" &&
      r.status() === 201,
  );
  await dialog
    .getByRole("button", { name: "Create Booking", exact: true })
    .click();
  const body = await (await saved).json();
  await expect(
    dialog.getByText("Booking Confirmed!", { exact: true }),
  ).toBeVisible();
  const b = (await db.collection("bookings").doc(body.bookingId).get()).data()!;
  expect(b.checkIn).toBe(expectedDate);
  expect(b.guestId).toBeNull();
  expect(b.createdByStaffId).toBe(uid("receptionist"));
  expect(b.bookingStatus).toBe("confirmed");
  expect(b.leadGuest.adultGuestNames).toEqual(["Priya Actual", "Ravi Actual"]);
  expect(b.bookingContact.name).toBe("Travel Booker");
  await page.screenshot({
    path: test.info().outputPath("walk-in-confirmed.png"),
    fullPage: true,
  });
  await dialog.getByRole("button", { name: /View Reservation/ }).click();
  await expect(
    page.getByRole("heading", { name: "Staying guests and registration" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText("Registration complete.", { exact: true }),
  ).toBeVisible();
});
test("pending invitations remain visible and cancellable after reopening", async ({
  page,
  context,
}) => {
  await login(context, "owner");
  const rows = await db
    .collection("bookings")
    .where("propertyId", "==", hotelA)
    .get();
  const target = rows.docs.find((d) => d.get("identityVersion") === 2)!;
  const response = await context.request.post(
    `/api/partner/bookings/${target.id}/customer-link`,
    {
      data: { action: "invite", email: `${uid("newstaff")}@example.test` },
    },
  );
  expect(response.ok()).toBeTruthy();
  const { token } = await response.json();
  await page.goto(
    `/partner/reservations?propertyId=${hotelA}&bookingId=${target.id}`,
  );
  await expect(
    page.getByText("Invitation pending", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("Private customer invitation", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Cancel invitation", exact: true })
    .click();
  await expect(
    page.getByText("Invitation cancelled.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel invitation", exact: true }),
  ).toHaveCount(0);
  expect(
    (await target.ref.collection("customerLinks").doc("current").get()).get(
      "status",
    ),
  ).toBe("cancelled");
  await login(context, "newstaff");
  const rejected = await context.request.post(
    `/api/bookings/${target.id}/customer-link`,
    { data: { token, accept: true } },
  );
  expect(rejected.status()).toBe(403);
});
test("verified customer invitation previews then links explicitly, exposes trips only to its recipient", async ({
  context,
  browser,
}) => {
  await login(context, "owner");
  const rows = await db
    .collection("bookings")
    .where("propertyId", "==", hotelA)
    .get();
  const target = rows.docs.find((d) => d.get("identityVersion") === 2)!;
  expect(target).toBeTruthy();
  const invite = await context.request.post(
    `/api/partner/bookings/${target.id}/customer-link`,
    { data: { action: "invite", email: `${uid("newstaff")}@example.test` } },
  );
  expect(invite.status()).toBe(200);
  const body = await invite.json();
  const customerContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3014",
  });
  await login(customerContext, "newstaff");
  const customer = await customerContext.newPage();
  await customer.goto(
    `/reservation-invitations/${target.id}#token=${body.token}`,
  );
  await customer.getByRole("button", { name: "Review invitation" }).click();
  await expect(
    customer.getByText("Priya Actual", { exact: false }),
  ).toBeVisible();
  expect((await target.ref.get()).get("guestId")).toBeNull();
  await customer.evaluate(() => {
    location.hash = `token=${"a".repeat(43)}`;
  });
  await expect(
    customer.getByRole("button", { name: "Review invitation" }),
  ).toBeVisible();
  await expect(
    customer.getByRole("button", { name: "Accept and link reservation" }),
  ).toHaveCount(0);
  await customer.evaluate((token) => {
    location.hash = `token=${token}`;
  }, body.token);
  await customer.getByRole("button", { name: "Review invitation" }).click();
  await expect(
    customer.getByRole("button", { name: "Accept and link reservation" }),
  ).toBeVisible();
  await customer
    .getByRole("button", { name: "Accept and link reservation" })
    .click();
  await expect(
    customer.getByRole("link", { name: "View reservation" }),
  ).toBeVisible();
  expect(
    (await customerContext.request.get(`/api/bookings/${target.id}`)).status(),
  ).toBe(200);
  expect(
    (await context.request.get(`/api/bookings/${target.id}`)).status(),
  ).toBe(404);
  expect((await target.ref.get()).get("guestId")).toBe(uid("newstaff"));
  const customerTrips = await (
    await customerContext.request.get("/api/bookings/mine")
  ).json();
  expect(customerTrips.bookings.map((b: { id: string }) => b.id)).toContain(
    target.id,
  );
  await login(context, "receptionist");
  const staffTrips = await (
    await context.request.get("/api/bookings/mine")
  ).json();
  expect(staffTrips.bookings.map((b: { id: string }) => b.id)).not.toContain(
    target.id,
  );
  await customerContext.close();
});
test("guest registration retains failed edits and rejects stale revisions", async ({
  page,
  context,
}) => {
  await login(context, "owner");
  const rows = await db
    .collection("bookings")
    .where("propertyId", "==", hotelA)
    .get();
  const target = rows.docs.find((d) => d.get("identityVersion") === 2)!;
  await page.goto(
    `/partner/reservations?propertyId=${hotelA}&bookingId=${target.id}`,
  );
  const lead = page.getByLabel("Lead staying adult", { exact: true });
  await expect(lead).toBeVisible({ timeout: 15000 });
  const originalName = await lead.inputValue();
  await lead.fill("Priya Corrected");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("alertdialog", { name: "Unsaved reservation changes" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(lead).toHaveValue("Priya Corrected");
  await page
    .getByRole("button", {
      name: "Reload saved guest details (replaces unsaved registration)",
      exact: true,
    })
    .click();
  await expect(lead).toHaveValue(originalName);
  await lead.fill("Priya Corrected");
  let releaseSave!: () => void;
  const saveBlocked = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  let reportStarted!: () => void;
  const saveStarted = new Promise<void>((resolve) => {
    reportStarted = resolve;
  });
  let failed = false;
  await page.route("**/guest-registration", async (route) => {
    if (route.request().method() === "POST" && !failed) {
      failed = true;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Temporary registration failure" },
        }),
      });
    } else {
      if (route.request().method() === "POST") {
        reportStarted();
        await saveBlocked;
      }
      await route.continue();
    }
  });
  await page
    .getByRole("button", { name: "Save guest registration", exact: true })
    .click();
  await expect(
    page.getByText("Temporary registration failure", { exact: false }),
  ).toBeVisible();
  await expect(lead).toHaveValue("Priya Corrected");
  await page
    .getByRole("button", { name: "Save guest registration", exact: true })
    .click();
  await saveStarted;
  try {
    await expect(lead).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { name: "Staying guests and registration" }),
    ).toBeVisible();
    await expect(
      page.getByRole("alertdialog", { name: "Unsaved reservation changes" }),
    ).toHaveCount(0);
  } finally {
    releaseSave();
  }
  await expect
    .poll(async () => (await target.ref.get()).get("leadGuest.name"))
    .toBe("Priya Corrected");
  await expect(
    page.getByRole("button", { name: "Reload saved details", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Guest registration saved.", { exact: true }),
  ).toBeVisible();
  await expect(lead).toBeEnabled();
  await expect(
    page
      .getByRole("region", { name: "Guest", exact: true })
      .getByRole("heading", { name: "Priya Corrected", exact: true }),
  ).toBeVisible();
  await target.ref.update({ reservationRevision: 2 });
  await lead.fill("Unfinished Conflict Draft");
  await page
    .getByRole("button", { name: "Save guest registration", exact: true })
    .click();
  await expect(
    page.getByText("Guest details changed in another session.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(lead).toHaveValue("Unfinished Conflict Draft");
  await page
    .getByRole("button", { name: "Reload saved details", exact: true })
    .click();
  await expect(lead).toHaveValue("Priya Corrected");
});
