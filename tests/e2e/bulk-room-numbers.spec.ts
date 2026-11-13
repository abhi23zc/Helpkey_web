import { test, expect } from "@playwright/test";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (
  ![
    process.env.FIRESTORE_EMULATOR_HOST,
    process.env.FIREBASE_AUTH_EMULATOR_HOST,
  ].every((v) => /^(127\.0\.0\.1|localhost):\d+$/.test(v || ""))
)
  throw new Error("Local emulators required.");
const app = initializeApp({ projectId: "demo-helpkey-pms" }, "bulk-browser"),
  db = getFirestore(app),
  auth = getAuth(app);
const prefix = `bulk-browser-${crypto.randomUUID()}`,
  uid = `${prefix}-owner`,
  propertyId = prefix,
  roomTypeId = `${prefix}-room`;
let cookie: string;
test.beforeAll(async () => {
  const email = `${uid}@example.test`;
  await auth.createUser({
    uid,
    email,
    password: "EmulatorOnly-Test123!",
    emailVerified: true,
  });
  await db
    .collection("users")
    .doc(uid)
    .set({
      uid,
      fullName: "Bulk Owner",
      email,
      emailVerified: true,
      roles: ["partner"],
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
  cookie = await auth.createSessionCookie((await response.json()).idToken, {
    expiresIn: 86400000,
  });
  await db
    .collection("properties")
    .doc(propertyId)
    .set({
      ownerId: uid,
      partnerId: uid,
      name: "Isolated Bulk Hotel",
      slug: prefix,
      status: "active",
      approvalStatus: "approved",
      isBookable: true,
      inventoryEngine: "interval_v1",
      bookingModes: ["overnight"],
      timezone: "Asia/Kolkata",
      checkInTime: "14:00",
      checkOutTime: "11:00",
      address: { line1: "Test Road", city: "Test City" },
      publicPhone: "+919876543210",
      pms: {
        version: 1,
        activatedAt: Timestamp.now(),
        openingData: "none",
        teamReviewed: true,
        inventoryVerification: {
          passed: true,
          checkedAt: Timestamp.now(),
          checkedBy: uid,
        },
      },
    });
  await db
    .collection("propertyMemberships")
    .doc(`${propertyId}_${uid}`)
    .set({ propertyId, userId: uid, role: "owner", status: "active" });
  await db
    .collection("roomTypes")
    .doc(roomTypeId)
    .set({
      propertyId,
      name: "Normal",
      status: "active",
      totalInventory: 50,
      maxAdults: 2,
      maxChildren: 0,
    });
});
test.afterAll(async () => {
  for (const name of [
    "roomTypes",
    "physicalUnits",
    "physicalUnitLabels",
    "physicalUnitBulkOperations",
    "propertyMemberships",
  ]) {
    const docs = await db
      .collection(name)
      .where("propertyId", "==", propertyId)
      .get();
    await Promise.all(docs.docs.map((d) => db.recursiveDelete(d.ref)));
  }
  await db.recursiveDelete(db.collection("properties").doc(propertyId));
  await db.collection("users").doc(uid).delete();
  await auth.deleteUser(uid);
});
test("desktop and mobile bulk preview, failure preservation, retry and single entry", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "helpkey_session",
      value: cookie,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(`/partner/settings?propertyId=${propertyId}&section=rooms`);
  await page
    .getByRole("button", { name: "Add multiple room numbers", exact: true })
    .click();
  await page
    .getByLabel("Room type for multiple numbers")
    .selectOption(roomTypeId);
  await page.getByLabel("First number").fill("001");
  await page.getByLabel("Last number").fill("050");
  await page
    .getByRole("button", { name: "Preview room numbers", exact: true })
    .click();
  await expect(
    page.getByText("50 new room numbers · 50 capacity remaining"),
  ).toBeVisible();
  await expect(
    page.getByText("Capacity remaining after adding: 0", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("bulk-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("bulk-mobile.png"),
    fullPage: true,
  });
  let retryBody: unknown;
  await page.route("**/api/partner/physical-units/bulk", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "create" && !retryBody) {
      retryBody = body;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "TEMPORARY", message: "Temporary failure. Retry." },
        }),
      });
    } else {
      if (body.action === "create") expect(body).toEqual(retryBody);
      await route.continue();
    }
  });
  await page
    .getByRole("button", { name: "Add 50 room numbers", exact: true })
    .click();
  await expect(page.getByRole("alert").filter({ hasText: "Temporary failure" })).toBeVisible();
  await expect(page.getByLabel("First number")).toHaveValue("001");
  await expect(page.getByLabel("Last number")).toHaveValue("050");
  await page
    .getByRole("button", { name: "Add 50 room numbers", exact: true })
    .click();
  await expect(
    page.getByText("Added 50 room numbers. Sellable capacity is unchanged."),
  ).toBeVisible();
  expect(
    (await db.collection("roomTypes").doc(roomTypeId).get()).get(
      "totalInventory",
    ),
  ).toBe(50);
  await page.getByLabel("Entry method").selectOption("list");
  await page
    .getByLabel("Room numbers (commas or one per line)")
    .fill("001, 001\nA101");
  await page
    .getByRole("button", { name: "Preview room numbers", exact: true })
    .click();
  await expect(
    page.getByText("Repeated entries (skipped): 001", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Exceeds capacity by 1.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add 1 room numbers", exact: true }),
  ).toBeDisabled();
  // Existing single-room form remains available and uses the same uniqueness checks.
  const single = page
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Add room number", exact: true }),
    });
  await single.getByRole("combobox").selectOption(roomTypeId);
  await single.getByLabel("Room number", { exact: true }).fill("001");
  await single.getByRole("button").click();
  await expect(
    page.getByRole("alert").filter({ hasText: "DUPLICATE_ROOM_LABEL" }),
  ).toBeVisible();
});
