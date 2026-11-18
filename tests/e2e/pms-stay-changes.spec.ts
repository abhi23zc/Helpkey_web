import {
  allocateIntervals,
  localParts,
  resolveLocal,
} from "../../lib/booking/domain";
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
    "pms-stay-changes-browser",
  ),
  db = getFirestore(app),
  auth = getAuth(app);
const prefix = `stay-change-browser-${crypto.randomUUID()}`,
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

async function stayBooking() {
  const id = `${prefix}-stay-${crypto.randomUUID()}`,
    type = `${hotelA}-room`,
    a = `${hotelA}-unit`,
    b = `${hotelA}-second`,
    timezone = "Asia/Kolkata";
  await db.collection("roomTypes").doc(type).update({ totalInventory: 2 });
  await db.collection("physicalUnits").doc(b).set({
    propertyId: hotelA,
    roomTypeId: type,
    label: "102",
    status: "active",
    housekeepingStatus: "clean",
  });
  const day = localParts(Date.now(), timezone).date;
  const tomorrow = new Date(Date.parse(day) + 86400000)
    .toISOString()
    .slice(0, 10);
  const startAt = new Date(Date.now() - 3600000).toISOString(),
    endAt = new Date(resolveLocal(tomorrow, "11:00", timezone)).toISOString(),
    inventoryEndAt = new Date(Date.parse(endAt) + 1800000).toISOString(),
    allocations = allocateIntervals(startAt, inventoryEndAt, timezone);
  await db
    .collection("bookings")
    .doc(id)
    .set({
      propertyId: hotelA,
      guestId: uid("owner"),
      source: "manual_partner",
      confirmationCode: "STAYCHANGETEST",
      leadGuest: { name: "In-house Test Guest" },
      roomType: { id: type, name: "Normal" },
      ratePlan: { id: `${hotelA}-rate` },
      physicalUnitId: a,
      physicalUnitLabel: "101",
      physicalAllocations: allocations,
      inventoryEngine: "interval_v1",
      checkIn: day,
      checkOut: tomorrow,
      startAt,
      endAt,
      inventoryEndAt,
      cleaningBufferMinutes: 30,
      timezone,
      bookingMode: "overnight",
      bookingStatus: "checked_in",
      quantity: 1,
      totalPaise: 100000,
      paidPaise: 0,
      adults: 1,
      currency: "INR",
      customizations: [],
      createdAt: Timestamp.now(),
    });
  await db.collection("inventoryHolds").doc(id).set({
    propertyId: hotelA,
    bookingId: id,
    roomTypeId: type,
    allocations,
    quantity: 1,
    status: "committed",
  });
  for (const row of allocations) {
    await db
      .collection("inventoryCalendars")
      .doc(`${hotelA}_${type}_${row.date}`)
      .set({
        propertyId: hotelA,
        roomTypeId: type,
        date: row.date,
        reserved: Object.fromEntries(row.intervals.map((k) => [k, 1])),
      });
    await db
      .collection("physicalUnitCalendars")
      .doc(`${a}_${row.date}`)
      .set({
        propertyId: hotelA,
        unitId: a,
        date: row.date,
        slots: Object.fromEntries(row.intervals.map((k) => [k, id])),
      });
  }
  return { id, a, b };
}
test("keyboard move, lost response across reload, exact retry and current room history", async ({
  page,
  context,
}) => {
  await login(context, "owner");
  const f = await stayBooking();
  await page.goto(
    `/partner/today?propertyId=${hotelA}&bookingId=${f.id}&section=assignment`,
  );
  const form = page.getByRole("region", { name: "In-house stay changes" });
  await expect(
    form.getByRole("heading", { name: "In-house stay changes" }),
  ).toBeVisible();
  await form.getByLabel("Destination room").selectOption(f.b);
  await form
    .getByLabel("Reason", { exact: true })
    .fill("Guest requested quieter room");
  await form
    .getByRole("button", { name: "Review change", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(form.getByText(/101 · Normal → 102 · Normal/)).toBeVisible();
  await form.screenshot({
    path: `/tmp/helpkey-phase3c-${test.info().project.name}.png`,
  });
  const bodies: string[] = [],
    keys: string[] = [];
  let attempt = 0;
  await page.route(
    `**/api/partner/bookings/${f.id}/stay-change`,
    async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.continue();
        return;
      }
      bodies.push(route.request().postData()!);
      keys.push(route.request().headers()["idempotency-key"]);
      attempt++;
      if (attempt === 1) {
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        await route.abort("failed");
      } else if (attempt === 2)
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "TEST_ERROR",
              message: "Temporary permission error",
            },
          }),
        });
      else await route.continue();
    },
  );
  await form.getByRole("button", { name: "Confirm move room" }).click();
  await expect(
    form.getByRole("button", { name: "Retry saved submission" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    form.getByRole("button", { name: "Retry saved submission" }),
  ).toBeVisible();
  await form.getByRole("button", { name: "Retry saved submission" }).click();
  await expect(form.getByText(/Temporary permission error/)).toBeVisible();
  await form.getByRole("button", { name: "Retry saved submission" }).click();
  await expect(form.getByText(/Stay change recorded/)).toBeVisible();
  expect(new Set(bodies).size).toBe(1);
  expect(new Set(keys).size).toBe(1);
  const b = (await db.collection("bookings").doc(f.id).get()).data()!;
  expect(b.physicalUnitId).toBe(f.b);
  expect(b.assignmentSegments).toHaveLength(2);
  await form.getByText("Room assignment history", { exact: true }).click();
  await expect(form.getByText(/101 · Normal:/)).toBeVisible();
  await expect(form.getByText(/102 · Normal:/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("early departure retains charge through an explicit review and separate checkout", async ({
  page,
  context,
}) => {
  await login(context, "owner");
  const f = await stayBooking();
  await page.goto(
    `/partner/today?propertyId=${hotelA}&bookingId=${f.id}&section=assignment`,
  );
  const form = page.getByRole("region", { name: "In-house stay changes" });
  await form
    .getByLabel("Action", { exact: true })
    .selectOption("early_departure");
  await form.getByLabel("Settlement", { exact: true }).selectOption("retain");
  await form
    .getByLabel("Reason", { exact: true })
    .fill("Guest leaving earlier as agreed");
  await form
    .getByRole("button", { name: "Review change", exact: true })
    .click();
  await expect(form.getByText(/No checkout, refund, collection/)).toBeVisible();
  await form
    .getByRole("button", { name: "Confirm record early departure" })
    .click();
  await expect(form.getByText(/Stay change recorded/)).toBeVisible();
  const b = (await db.collection("bookings").doc(f.id).get()).data()!;
  expect(b.bookingStatus).toBe("checked_in");
  expect(b.billingNetPaise ?? 0).toBe(0);
  expect(b.refundedPaise ?? 0).toBe(0);
});
