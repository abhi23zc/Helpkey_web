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
    "pms-closing-browser",
  ),
  db = getFirestore(app),
  auth = getAuth(app);
const prefix = `pms-closing-${crypto.randomUUID()}`,
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
      "cashierShifts",
      "cashierActiveShifts",
      "cashierShiftRequests",
      "dailyClosings",
      "dailyClosingRequests",
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
    await db.collection("hotelClosingState").doc(id).delete();
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

test("cashier opens and closes by keyboard, lost response recovers across reload, manager prints permanent daily report", async ({
  page,
  context,
}) => {
  await login(context, "cashier");
  await page.goto(`/partner/cashier-shifts?propertyId=${hotelA}`);
  await expect(
    page.getByRole("heading", { name: "My shift and shift history" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Daily closing", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Opening cash physically counted (₹)").fill("100.01");
  await page
    .getByRole("button", { name: "Open my shift", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Counted cash (₹)")).toBeVisible();
  await page.getByLabel("Counted cash (₹)").fill("100.00");
  await page
    .getByRole("button", { name: "Confirm shift closing", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Explain the surplus or shortage" }),
  ).toBeVisible();
  await expect(page.getByLabel("Counted cash (₹)")).toHaveValue("100.00");
  await page
    .getByLabel("Discrepancy explanation (required for a difference)")
    .fill("One paise shortage counted");
  let dropped = false;
  await page.route("**/api/partner/cashier-shifts", async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Confirm shift closing", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry saved request" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Retry saved request" }).click();
  await expect(
    page.getByText("Shift recorded.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `/tmp/helpkey-closing-${test.info().project.name}.png`,
    fullPage: true,
  });
  const closed = await db
    .collection("cashierShifts")
    .where("propertyId", "==", hotelA)
    .get();
  expect(closed.size).toBe(1);
  expect(closed.docs[0].get("snapshot.differencePaise")).toBe(-1);
  await login(context, "manager");
  await page.goto(`/partner/daily-closing?propertyId=${hotelA}`);
  await expect(
    page.getByRole("heading", { name: "Daily closing", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Closing note").fill("Manager reviewed balances");
  await page
    .getByRole("button", { name: "Confirm permanent daily report" })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Acknowledge" }),
  ).toBeVisible();
  await expect(page.getByLabel("Closing note")).toHaveValue(
    "Manager reviewed balances",
  );
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Confirm permanent daily report" })
    .click();
  await expect(
    page.getByText("Daily report saved permanently.", { exact: true }),
  ).toBeVisible();
  const reports = await db
    .collection("dailyClosings")
    .where("propertyId", "==", hotelA)
    .get();
  expect(reports.size).toBe(1);
  const printed = await page.request.get(
    `/api/partner/daily-closing/print?propertyId=${hotelA}&id=${reports.docs[0].id}`,
  );
  expect(printed.ok()).toBe(true);
  expect(await printed.text()).toContain(
    "Information available when closed at",
  );
  const printPage = await context.newPage();
  await printPage.goto(
    `/api/partner/daily-closing/print?propertyId=${hotelA}&id=${reports.docs[0].id}`,
  );
  await printPage.emulateMedia({ media: "print" });
  await printPage.screenshot({
    path: `/tmp/helpkey-closing-print-${test.info().project.name}.png`,
    fullPage: true,
  });
  await printPage.close();
  await login(context, "cashier");
  expect(
    (
      await page.request.get(
        `/api/partner/daily-closing/print?propertyId=${hotelA}&id=${reports.docs[0].id}`,
      )
    ).status(),
  ).toBe(403);
});
