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

test("Today safe queues, workspace deep links, browser back and historical selection", async ({
  page,
  context,
}) => {
  await login(context, "owner");
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const bookingId = `${hotelA}-today`;
  await db
    .collection("bookings")
    .doc(bookingId)
    .set({
      propertyId: hotelA,
      guestId: uid("owner"),
      source: "manual_partner",
      confirmationCode: "TODAYTEST",
      leadGuest: { name: "Today Test Guest" },
      roomType: { id: `${hotelA}-room`, name: "Normal" },
      checkIn: day,
      checkOut: day,
      startAt: new Date(Date.now() - 3600000).toISOString(),
      endAt: new Date(Date.now() + 3600000).toISOString(),
      bookingStatus: "confirmed",
      totalPaise: 100000,
      paidPaise: 0,
      createdAt: Timestamp.now(),
      customizations: [],
    });
  await page.goto(`/partner/today?propertyId=${hotelA}`);
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Today Test Guest/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Today Test Guest/ }).click();
  await expect(
    page.getByRole("navigation", { name: "Reservation sections" }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("navigation", { name: "Reservation sections" }),
  ).toHaveCount(0);
  await page.goto(
    `/partner/today?propertyId=${hotelA}&date=2020-01-01&bookingId=${bookingId}&section=summary`,
  );
  await expect(
    page.getByRole("navigation", { name: "Reservation sections" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("navigation", { name: "Reservation sections" }),
  ).toBeVisible();
  const response = await page.request.get(
    `/api/partner/bookings/${bookingId}?propertyId=${hotelB}`,
  );
  expect(response.status()).toBe(404);
});

for (const role of ["receptionist", "manager", "owner"]) {
  test(`${role} opens booking notifications through the permitted Today workspace`, async ({
    page,
    context,
  }) => {
    await login(context, role);
    const bookingId = `${hotelA}-notify-${role}`,
      notice = `${prefix}-${role}-notice`;
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    await db
      .collection("bookings")
      .doc(bookingId)
      .set({
        propertyId: hotelA,
        confirmationCode: "NOTICE",
        leadGuest: { name: "Notification Guest" },
        roomType: { id: `${hotelA}-room`, name: "Normal" },
        checkIn: day,
        checkOut: day,
        startAt: new Date(Date.now() - 3600000).toISOString(),
        endAt: new Date(Date.now() + 3600000).toISOString(),
        bookingStatus: "confirmed",
        totalPaise: 100000,
        paidPaise: 0,
        createdAt: Timestamp.now(),
        customizations: [],
      });
    await db
      .collection("notifications")
      .doc(notice)
      .set({
        userId: uid(role),
        eventType: "booking.confirmed",
        title: "Review this reservation",
        body: "Open guest workspace",
        data: { bookingId, propertyId: hotelA },
        readAt: null,
        createdAt: Timestamp.now(),
      });
    try {
      await page.goto(`/partner/today?propertyId=${hotelA}`);
      await expect(
        page.getByRole("heading", { name: "Today", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: /^Notifications/ }).click();
      await page
        .getByRole("button", { name: /Review this reservation/ })
        .click();
      await expect(page).toHaveURL(
        new RegExp(`partner/today.*bookingId=${bookingId}`),
      );
      await expect(
        page.getByRole("navigation", { name: "Reservation sections" }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "Guest", exact: true })
          .getByRole("heading", { name: "Notification Guest", exact: true }),
      ).toBeVisible();
    } finally {
      await db.collection("notifications").doc(notice).delete();
    }
  });
}

test("operational policies apply immediately, expose combined blockers and protect lifecycle retries", async ({
  page,
  context,
}) => {
  await login(context, "owner");
  const id = `${hotelA}-policies`;
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await db
    .collection("bookings")
    .doc(id)
    .set({
      propertyId: hotelA,
      guestId: uid("owner"),
      source: "web",
      confirmationCode: "POLICYTEST",
      leadGuest: {
        name: "Policy Guest",
        email: "customer@example.test",
        adultGuestNames: ["Policy Guest"],
      },
      roomType: { id: `${hotelA}-room`, name: "Normal" },
      checkIn: day,
      checkOut: day,
      startAt: new Date(Date.now() - 3600000).toISOString(),
      endAt: new Date(Date.now() + 3600000).toISOString(),
      adults: 1,
      children: 1,
      infants: 1,
      bookingStatus: "confirmed",
      totalPaise: 100000,
      paidPaise: 0,
      createdAt: Timestamp.now(),
      customizations: [],
    });
  try {
    await page.goto(`/partner/settings/policies?propertyId=${hotelA}`);
    const editor = page
      .locator("form")
      .filter({
        has: page.getByRole("heading", {
          name: "Operational policies",
          exact: true,
        }),
      });
    await expect(editor).toBeVisible();
    for (const checkbox of await editor.getByRole("checkbox").all())
      await checkbox.check();
    await editor
      .getByRole("button", { name: "Save operational policies", exact: true })
      .click();
    await expect(editor.getByRole("status")).toHaveText(
      "Operational policies saved.",
    );
    await page.goto(
      `/partner/today?propertyId=${hotelA}&bookingId=${id}&section=summary`,
    );
    const blockers = page.getByRole("list", { name: "Action blockers" });
    await expect(blockers).toContainText("Assign an active physical room");
    await expect(blockers).toContainText("clean or inspected");
    await expect(blockers).toContainText(
      "0 adult(s), 1 child(ren) and 1 infant(s)",
    );
    await expect(
      page.getByRole("button", { name: "Check in", exact: true }),
    ).toBeDisabled();
    const direct = await page.request.post(
      `/api/partner/bookings/${id}/status`,
      { data: { status: "checked_in" } },
    );
    expect(direct.status()).toBe(422);
    expect((await direct.json()).error.eligibility.blockers).toHaveLength(3);
    const original = await page.request.get(`/api/partner/bookings/${id}`);
    const version = (await original.json()).actionEligibility.checked_in
      .eligibilityVersion;
    await blockers.getByRole("link", { name: "Review guests" }).click();
    await expect(
      page.getByRole("heading", { name: "Staying guests and registration" }),
    ).toBeVisible();
    // Editing a customer reservation uses canonical names without creating a customer link.
    const registration = await page.request.get(
      `/api/partner/bookings/${id}/guest-registration`,
    );
    const saved = await registration.json();
    expect(saved.registrationEditable).toBe(true);
    const edit = await page.request.post(
      `/api/partner/bookings/${id}/guest-registration`,
      {
        data: {
          revision: saved.revision,
          occupants: [
            { name: "Policy Guest", ageGroup: "adult" },
            { name: "Child Guest", ageGroup: "child" },
            { name: "Infant Guest", ageGroup: "infant" },
          ],
        },
      },
    );
    expect(edit.ok()).toBe(true);
    const stale = await page.request.post(
      `/api/partner/bookings/${id}/status`,
      {
        data: {
          status: "checked_in",
          expectedEligibilityVersion: version,
          idempotencyKey: "stale-policy-review",
        },
      },
    );
    expect(stale.status()).toBe(409);
    expect((await stale.json()).error.code).toBe("ELIGIBILITY_CHANGED");
    await page.goto(`/partner/settings/policies?propertyId=${hotelA}`);
    await expect(editor).toBeVisible();
    for (const checkbox of await editor.getByRole("checkbox").all())
      await checkbox.uncheck();
    await editor
      .getByRole("button", { name: "Save operational policies", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(editor.getByRole("status")).toHaveText(
      "Operational policies saved.",
    );
    const payload = {
      status: "checked_in",
      idempotencyKey: "policy-checkin-recovery",
    };
    expect(
      (
        await page.request.post(`/api/partner/bookings/${id}/status`, {
          data: payload,
        })
      ).ok(),
    ).toBe(true);
    const first = (await db.collection("bookings").doc(id).get())
      .get("actualCheckInAt")
      .toMillis();
    expect(
      (
        await page.request.post(`/api/partner/bookings/${id}/status`, {
          data: payload,
        })
      ).ok(),
    ).toBe(true);
    expect(
      (await db.collection("bookings").doc(id).get())
        .get("actualCheckInAt")
        .toMillis(),
    ).toBe(first);
    expect((await db.collection("bookings").doc(id).get()).get("guestId")).toBe(
      uid("owner"),
    );
    const recoveryId = `${id}-ui-recovery`;
    const recoveryBooking = (
      await db.collection("bookings").doc(id).get()
    ).data()!;
    await db
      .collection("bookings")
      .doc(recoveryId)
      .set({
        ...recoveryBooking,
        bookingStatus: "confirmed",
        confirmationCode: "POLICYRECOVERY",
        actualCheckInAt: null,
      });
    await page.goto(
      `/partner/today?propertyId=${hotelA}&bookingId=${recoveryId}&section=summary`,
    );
    await expect(
      page.getByRole("button", { name: "Check in", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Check in", exact: true }).click();
    await page.route(
      `**/api/partner/bookings/${recoveryId}/status`,
      async (route) => {
        await route.fetch();
        await route.abort("failed");
      },
      { times: 1 },
    );
    await page
      .getByRole("button", { name: "Confirm action", exact: true })
      .click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Retry confirms the same request key" }),
    ).toBeVisible();
    const recorded = (await db.collection("bookings").doc(recoveryId).get())
      .get("actualCheckInAt")
      .toMillis();
    // Trigger the same refresh as another operational write while preserving the pending request.
    await page.evaluate(() =>
      window.dispatchEvent(new Event("operational-data-changed")),
    );
    await expect(
      page.getByRole("button", { name: "Confirm action", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Confirm action", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Check out", exact: true }),
    ).toBeVisible();
    expect(
      (await db.collection("bookings").doc(recoveryId).get())
        .get("actualCheckInAt")
        .toMillis(),
    ).toBe(recorded);
    expect(
      (
        await db
          .collection("bookings")
          .doc(recoveryId)
          .collection("events")
          .get()
      ).size,
    ).toBe(1);
  } finally {
    await db
      .collection("properties")
      .doc(hotelA)
      .update({
        "pms.operationalPolicies": {
          requireAssignedRoom: false,
          requireCleanRoom: false,
          requireGuestRegistration: false,
          requireSettledBalance: false,
        },
      });
  }
});

test("pending refunds disable collection with the authoritative explanation", async ({
  page,
  context,
}) => {
  await login(context, "owner");
  const id = `${hotelA}-refund-blocker`,
    day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  await db
    .collection("bookings")
    .doc(id)
    .set({
      propertyId: hotelA,
      source: "web",
      guestId: uid("owner"),
      confirmationCode: "REFUNDBLOCK",
      leadGuest: { name: "Refund Guest", adultGuestNames: ["Refund Guest"] },
      roomType: { id: `${hotelA}-room`, name: "Normal" },
      checkIn: day,
      checkOut: day,
      startAt: new Date(Date.now() - 3600000).toISOString(),
      endAt: new Date(Date.now() + 3600000).toISOString(),
      bookingStatus: "checked_in",
      adults: 1,
      children: 0,
      infants: 0,
      totalPaise: 100000,
      paidPaise: 1000,
      refundDuePaise: 100,
      createdAt: Timestamp.now(),
      customizations: [],
    });
  await page.goto(
    `/partner/today?propertyId=${hotelA}&bookingId=${id}&section=payments`,
  );
  await expect(
    page.getByRole("button", { name: "Record collection", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Resolve pending refunds before collecting more money.", {
      exact: true,
    }),
  ).toBeVisible();
});
