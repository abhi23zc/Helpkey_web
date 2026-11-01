import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
const host = process.env.FIRESTORE_EMULATOR_HOST;
const safe = host && /^(127\.0\.0\.1|localhost):\d+$/.test(host);
describe.skipIf(!safe)("partner overview with isolated Firestore", () => {
  let db: typeof import("@/lib/firebase/admin").adminDb;
  let load: typeof import("@/lib/partner/dashboard/service").loadOverview;
  const uid = `dashboard-owner-${Date.now()}`,
    propertyId = `dashboard-property-${Date.now()}`;
  const date = Timestamp.fromDate(new Date("2026-10-31T05:00:00Z"));
  beforeAll(async () => {
    process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-bookings";
    delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    delete process.env.REDIS_URL;
    db = (await import("@/lib/firebase/admin")).adminDb;
    load = (await import("@/lib/partner/dashboard/service")).loadOverview;
    await db
      .collection("users")
      .doc(uid)
      .set({ roles: ["partner"], isActive: true, accountStatus: "active" });
    await db.collection("properties").doc(propertyId).set({
      name: "Test Hotel",
      status: "active",
      approvalStatus: "approved",
      isBookable: true,
      timezone: "Asia/Kolkata",
      inventoryEngine: "interval_v1",
    });
    await db
      .collection("propertyMemberships")
      .doc(`${propertyId}_${uid}`)
      .set({ propertyId, userId: uid, status: "active", role: "owner" });
    await db
      .collection("roomTypes")
      .doc(`${propertyId}-room`)
      .set({ propertyId, name: "Deluxe", totalInventory: 2, status: "active" });
    const batch = db.batch();
    for (let i = 0; i < 31; i++)
      batch.set(db.collection("bookings").doc(`${propertyId}-booking-${i}`), {
        propertyId,
        confirmationCode: `HK${i}`,
        bookingStatus: "confirmed",
        bookingMode: "hourly",
        checkIn: "2026-10-31",
        checkOut: "2026-10-31",
        startAt: "2026-10-31T04:00:00Z",
        endAt: "2026-10-31T10:00:00Z",
        totalPaise: 1000,
        paidPaise: i === 0 ? 1000 : 0,
        paidAt: i === 0 ? date : null,
        createdAt: date,
        roomType: { name: "Deluxe" },
      });
    batch.set(db.collection("paymentAttempts").doc(`${propertyId}-payment`), {
      bookingId: `${propertyId}-booking-0`,
      paymentId: `${propertyId}-payment`,
      amountPaise: 1000,
      status: "captured",
      createdAt: date,
    });
    batch.set(db.collection("paymentAttempts").doc(`${propertyId}-service`), {
      propertyId,
      bookingId: `${propertyId}-booking-0`,
      paymentId: `${propertyId}-service`,
      amountPaise: 200,
      status: "captured",
      stayQuote: true,
      createdAt: date,
    });
    batch.set(db.collection("refunds").doc(`${propertyId}-refund`), {
      propertyId,
      amountPaise: 100,
      status: "processed",
      processedAt: date,
    });
    batch.set(
      db
        .collection("inventoryCalendars")
        .doc(`${propertyId}_${propertyId}-room_2026-10-31`),
      { propertyId, date: "2026-10-31", stopSell: true, reserved: { "1": 1 } },
    );
    await batch.commit();
  }, 30000);
  afterAll(async () => {
    if (!db) return;
    for (const collection of [
      "bookings",
      "roomTypes",
      "refunds",
      "inventoryCalendars",
      "propertyMemberships",
      "paymentAttempts",
    ]) {
      const docs = await db
        .collection(collection)
        .where("propertyId", "==", propertyId)
        .get();
      for (const doc of docs.docs) await doc.ref.delete();
    }
    await db
      .collection("paymentAttempts")
      .doc(`${propertyId}-payment`)
      .delete();
    await db.collection("users").doc(uid).delete();
    await db.collection("properties").doc(propertyId).delete();
    await db.terminate();
  });
  it("returns full totals beyond a page, legacy captures, extras, refunds and stop-sell inventory", async () => {
    const result = await load(
      uid,
      { propertyId, date: "2026-10-31", range: "daily" },
      Date.parse("2026-10-31T05:00:00Z"),
    );
    expect(result.metrics).toMatchObject({
      arrivals: 31,
      departures: 31,
      bookedPaise: 31000,
      paidPaise: 1200,
      refundedPaise: 100,
      netPaise: 1100,
      serviceCollectedPaise: 200,
    });
    expect(result.availability[0]).toMatchObject({
      total: 2,
      remaining: 0,
      blocked: 2,
    });
    expect(result.upcomingReservations).toHaveLength(6);
  });
  it("rejects foreign property access", async () => {
    await expect(
      load(uid, {
        propertyId: "not-owned",
        date: "2026-10-31",
        range: "daily",
      }),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("keeps totals and operations inside the explicit range regardless of grouping", async () => {
    for (const range of ["daily", "weekly", "monthly"] as const) {
      const r = await load(
        uid,
        {
          propertyId,
          date: "2026-10-31",
          from: "2026-10-30",
          to: "2026-10-31",
          range,
        },
        Date.parse("2026-10-31T05:00Z"),
      );
      expect(r.period).toEqual({ start: "2026-10-30", end: "2026-10-31" });
      expect(r.metrics.arrivals).toBe(31);
      expect(r.operations.arrivals).toHaveLength(31);
      expect(r.metrics.netPaise).toBe(1100);
      expect(r.metrics.availableRoomHours).toBe(96);
      expect(r.availability).toHaveLength(2);
    }
  }, 30000);

  it("keeps live attention independent of the reporting period and preserves existing financial totals", async () => {
    const now = Date.parse("2026-10-31T05:00Z");
    const current = await load(
      uid,
      {
        propertyId,
        date: "2026-10-31",
        from: "2026-10-31",
        to: "2026-10-31",
        range: "daily",
      },
      now,
    );
    const future = await load(
      uid,
      {
        propertyId,
        date: "2026-11-29",
        from: "2026-11-01",
        to: "2026-11-29",
        range: "weekly",
      },
      now,
    );
    expect(future.metrics.bookedPaise).toBe(0);
    expect(future.metrics.netPaise).toBe(0);
    expect(future.attention).toEqual(current.attention);
    expect(future.attention.uniqueReservationCount).toBe(31);
    expect(future.alerts.find((a) => a.type === "overdue")?.href).toContain(
      "date=2026-10-31",
    );
    expect(future.alerts.find((a) => a.type === "overdue")?.href).not.toContain(
      "from=",
    );
  }, 30000);
  it("uses property-local today across UTC date boundaries", async () => {
    const result = await load(
      uid,
      {
        propertyId,
        date: "2026-10-31",
        from: "2026-10-30",
        to: "2026-10-31",
        range: "daily",
      },
      Date.parse("2026-10-31T19:00Z"),
    );
    expect(result.attention.today).toBe("2026-11-01");
    expect(result.attention.overdueArrivals).toBe(31);
    expect(result.period).toEqual({ start: "2026-10-30", end: "2026-10-31" });
  });
});
