import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
const safe = /^(127\.0\.0\.1|localhost):\d+$/.test(
  process.env.FIRESTORE_EMULATOR_HOST || "",
);
describe.skipIf(!safe)("partner reservations transactions", () => {
  let db: typeof import("@/lib/firebase/admin").adminDb;
  let ops: typeof import("@/lib/partner/reservations/operations");
  let amendments: typeof import("@/lib/partner/reservations/amendments");
  let bookings: typeof import("@/lib/bookings");
  let list: typeof import("@/lib/partner/reservations/list").listReservations;
  const ids: string[] = [],
    uid = `reservation-owner-${crypto.randomUUID()}`;
  const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const nextDay = (n: number) =>
    new Date(Date.parse(`${day}T12:00Z`) + n * 86400000)
      .toISOString()
      .slice(0, 10);
  beforeAll(async () => {
    process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-bookings";
    delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    delete process.env.REDIS_URL;
    db = (await import("@/lib/firebase/admin")).adminDb;
    ops = await import("@/lib/partner/reservations/operations");
    amendments = await import("@/lib/partner/reservations/amendments");
    bookings = await import("@/lib/bookings");
    list = (await import("@/lib/partner/reservations/list")).listReservations;
    await db
      .collection("users")
      .doc(uid)
      .set({ roles: ["partner"], accountStatus: "active", isActive: true });
  }, 30000);
  afterAll(async () => {
    for (const propertyId of ids) {
      const rows = await db
        .collection("bookings")
        .where("propertyId", "==", propertyId)
        .get();
      for (const row of rows.docs) {
        await db.recursiveDelete(row.ref);
      }
      for (const name of [
        "roomTypes",
        "ratePlans",
        "propertyMemberships",
        "inventoryCalendars",
        "inventoryHolds",
        "bookingNotificationOutbox",
        "bookingReferences",
        "physicalUnits",
        "physicalUnitLabels",
        "physicalUnitCalendars",
        "propertyPayments",
        "paymentAttempts",
        "refunds",
      ]) {
        const records = await db
          .collection(name)
          .where("propertyId", "==", propertyId)
          .get();
        for (const record of records.docs) await record.ref.delete();
      }
      await db.collection("properties").doc(propertyId).delete();
    }
    await db.collection("users").doc(uid).delete();
    await db.terminate();
  }, 30000);
  async function fixture(capacity = 2) {
    const propertyId = `reservations-${crypto.randomUUID()}`;
    ids.push(propertyId);
    const roomTypeId = `${propertyId}-room`,
      ratePlanId = `${propertyId}-rate`;
    await db.collection("properties").doc(propertyId).set({
      name: "Test Hotel",
      slug: propertyId,
      timezone: "Asia/Kolkata",
      currency: "INR",
      inventoryEngine: "interval_v1",
      status: "active",
      approvalStatus: "approved",
      isBookable: true,
    });
    await db
      .collection("propertyMemberships")
      .doc(`${propertyId}_${uid}`)
      .set({ userId: uid, propertyId, status: "active", role: "owner" });
    await db.collection("roomTypes").doc(roomTypeId).set({
      propertyId,
      name: "Deluxe",
      status: "active",
      totalInventory: capacity,
      maxAdults: 2,
      maxChildren: 0,
    });
    await db.collection("ratePlans").doc(ratePlanId).set({
      propertyId,
      roomTypeId,
      name: "Flexible",
      status: "active",
      bookingMode: "overnight",
      pricingModel: "nightly",
      basePricePaise: 10000,
      paymentMode: "pay_at_property",
    });
    const input = {
      propertyId,
      roomTypeId,
      ratePlanId,
      checkIn: day,
      checkOut: nextDay(1),
      guestName: "Ada Guest",
      guestEmail: "ada@example.com",
      guestPhone: "+919876543210",
      adults: 1,
      children: 0,
      infants: 0,
    };
    const create = (key = crypto.randomUUID()) =>
      bookings.createManualReservation(uid, input, key);
    return { propertyId, roomTypeId, ratePlanId, input, create };
  }
  it("paginates, counts and exports all matching rows and restores property date scope", async () => {
    const f = await fixture();
    const batch = db.batch();
    for (let i = 0; i < 31; i++)
      batch.set(db.collection("bookings").doc(`${f.propertyId}-${i}`), {
        propertyId: f.propertyId,
        checkIn: day,
        checkOut: nextDay(1),
        bookingStatus: "confirmed",
        paymentStatus: "pay_at_property",
        roomType: { id: f.roomTypeId, name: "Deluxe" },
        totalPaise: 10000,
        paidPaise: 0,
        createdAt: Timestamp.now(),
        confirmationCode: `TEST${i}`,
        searchTokens: ["ada"],
        leadGuest: { name: "Ada Guest" },
      });
    await batch.commit();
    const first = await list(uid, {
      propertyId: f.propertyId,
      date: day,
      limit: 20,
    });
    expect(first.bookings).toHaveLength(20);
    expect("totalCount" in first && first.totalCount).toBe(31);
    if (!("nextCursor" in first)) throw new Error("Missing cursor");
    const second = await list(uid, {
      propertyId: f.propertyId,
      date: day,
      limit: 20,
      cursor: first.nextCursor,
    });
    expect(second.bookings).toHaveLength(11);
    expect(
      new Set([...first.bookings, ...second.bookings].map((b) => b.id)).size,
    ).toBe(31);
    // Global operation views still calculate departure counts for the header
    // date, even when the selected operation has no matching reservations.
    const global = await list(uid, {
      propertyId: f.propertyId,
      date: nextDay(1),
      scope: "all",
      view: "overdue",
    });
    expect(global.bookings).toHaveLength(0);
    expect("tabCounts" in global && global.tabCounts?.departures).toBe(31);
    const exported = await list(
      uid,
      { propertyId: f.propertyId, date: day },
      true,
    );
    expect(exported.bookings).toHaveLength(31);
    const empty = await list(uid, {
      propertyId: f.propertyId,
      date: nextDay(2),
    });
    expect(empty.bookings).toHaveLength(0);
    await expect(
      list(uid, {
        propertyId: f.propertyId,
        date: nextDay(1),
        cursor: first.nextCursor,
      }),
    ).rejects.toThrow("Filters changed");
    await expect(
      list("foreign", { propertyId: f.propertyId, date: day }),
    ).rejects.toThrow("Property access");
  }, 30000);
  it("persists private notes idempotently without exposing them in customer booking serialization", async () => {
    const f = await fixture();
    const b = await f.create();
    await ops.performOperation(
      uid,
      b.id,
      { action: "note", text: "Private desk note" },
      "note",
    );
    await ops.performOperation(
      uid,
      b.id,
      { action: "note", text: "Private desk note" },
      "note",
    );
    const activity = await ops.bookingOperations(uid, b.id);
    expect(activity.events.filter((e) => e.type === "staff_note")).toHaveLength(
      1,
    );
    const record = (await db.collection("bookings").doc(b.id).get()).data()!;
    expect(
      JSON.stringify(bookings.serializeBooking(b.id, record)),
    ).not.toContain("Private desk note");
    await expect(
      ops.performOperation("foreign", b.id, { action: "note", text: "x" }, "x"),
    ).rejects.toThrow("Property access");
  });
  it("prevents concurrent assignments of one physical room and releases it on cancellation", async () => {
    const f = await fixture(),
      a = await f.create(),
      b = await f.create();
    const unit = await ops.saveUnit(uid, {
      propertyId: f.propertyId,
      roomTypeId: f.roomTypeId,
      label: "101",
    });
    const results = await Promise.allSettled(
      [a, b].map((row) =>
        ops.performOperation(
          uid,
          row.id,
          { action: "assign", unitId: unit.id, revision: 0 },
          row.id,
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const winner = results[0].status === "fulfilled" ? a : b;
    await expect(
      ops.saveUnit(uid, {
        id: unit.id,
        propertyId: f.propertyId,
        roomTypeId: f.roomTypeId,
        label: "101",
        status: "inactive",
      }),
    ).rejects.toThrow("Remove active room assignments");
    await bookings.releaseBookingHold(
      winner.id,
      uid,
      "cancelled",
      "PARTNER_CANCELLED",
    );
    const calendars = await db
      .collection("physicalUnitCalendars")
      .where("unitId", "==", unit.id)
      .get();
    expect(
      calendars.docs.every(
        (d) => !Object.values(d.get("slots")).includes(winner.id),
      ),
    ).toBe(true);
    const loser = winner.id === a.id ? b : a;
    await ops.performOperation(
      uid,
      loser.id,
      { action: "assign", unitId: unit.id, revision: 0 },
      "retry",
    );
  }, 30000);
  it("keeps room labels unique across renames and permits reuse of a freed label", async () => {
    const f = await fixture();
    const a = await ops.saveUnit(uid, {
      propertyId: f.propertyId,
      roomTypeId: f.roomTypeId,
      label: "101",
    });
    await ops.saveUnit(uid, {
      id: a.id,
      propertyId: f.propertyId,
      roomTypeId: f.roomTypeId,
      label: "102",
    });
    const b = await ops.saveUnit(uid, {
      propertyId: f.propertyId,
      roomTypeId: f.roomTypeId,
      label: "101",
    });
    expect(a.id).not.toBe(b.id);
    await expect(
      ops.saveUnit(uid, {
        id: b.id,
        propertyId: f.propertyId,
        roomTypeId: f.roomTypeId,
        label: "102",
      }),
    ).rejects.toThrow();
  });
  it("records concurrent retry-safe collections, rejects overpayment, and preserves reversals", async () => {
    const f = await fixture(),
      b = await f.create();
    const input = { action: "collect", amountPaise: 4000, method: "cash" };
    await Promise.all([
      ops.performOperation(uid, b.id, input, "collect"),
      ops.performOperation(uid, b.id, input, "collect"),
    ]);
    expect(
      (await db.collection("bookings").doc(b.id).get()).get("paidPaise"),
    ).toBe(4000);
    await expect(
      ops.performOperation(
        uid,
        b.id,
        { ...input, amountPaise: 7000 },
        "overpay",
      ),
    ).rejects.toThrow("outstanding balance");
    const receipt = (await ops.bookingOperations(uid, b.id)).payments[0];
    await ops.performOperation(
      uid,
      b.id,
      {
        action: "reverse",
        receiptId: receipt.id,
        reason: "Incorrect collection",
      },
      "reverse",
    );
    expect(
      (await db.collection("bookings").doc(b.id).get()).get("paidPaise"),
    ).toBe(0);
    expect((await ops.bookingOperations(uid, b.id)).payments).toHaveLength(2);
    await expect(
      ops.performOperation(
        uid,
        b.id,
        { action: "reverse", receiptId: receipt.id, reason: "Again" },
        "again",
      ),
    ).rejects.toThrow();
  }, 30000);
  it("caps property refunds and keeps online refunds pending until provider processing", async () => {
    const f = await fixture(),
      b = await f.create();
    await ops.performOperation(
      uid,
      b.id,
      {
        action: "collect",
        amountPaise: 4000,
        method: "upi",
        reference: "UPI-1",
      },
      "cash",
    );
    const receipt = (await ops.bookingOperations(uid, b.id)).payments[0];
    await ops.performOperation(
      uid,
      b.id,
      {
        action: "refund",
        receiptId: receipt.id,
        amountPaise: 1000,
        reason: "Guest adjustment",
        reference: "RETURN-1",
      },
      "refund",
    );
    await expect(
      ops.performOperation(
        uid,
        b.id,
        {
          action: "refund",
          receiptId: receipt.id,
          amountPaise: 4000,
          reason: "More",
          reference: "RETURN-2",
        },
        "over",
      ),
    ).rejects.toThrow("unrefunded receipt");
    await db.collection("paymentAttempts").doc(`${b.id}-online`).set({
      bookingId: b.id,
      propertyId: f.propertyId,
      amountPaise: 2000,
      status: "captured",
      createdAt: Timestamp.now(),
    });
    await db.collection("bookings").doc(b.id).update({ paidPaise: 6000 });
    await ops.performOperation(
      uid,
      b.id,
      {
        action: "refund",
        receiptId: `${b.id}-online`,
        amountPaise: 500,
        reason: "Guest adjustment",
      },
      "online-refund",
    );
    const record = (await db.collection("bookings").doc(b.id).get()).data()!;
    expect(record.refundedPaise).toBe(1000);
    expect(record.refundDuePaise).toBe(500);
  });
  it("creates an identifiable receipt for paid manual bookings", async () => {
    const f = await fixture();
    const b = await bookings.createManualReservation(
      uid,
      { ...f.input, paymentMethod: "paid", collectionMethod: "cash" },
      "paid",
    );
    expect((await ops.bookingOperations(uid, b.id)).payments[0]).toMatchObject({
      amountPaise: 10000,
      method: "cash",
      type: "collection",
    });
  });
  it("amends the last available room without counting its existing allocation twice", async () => {
    const f = await fixture(1),
      b = await f.create();
    const preview = await amendments.previewAmendment(uid, b.id, {
      roomTypeId: f.roomTypeId,
      ratePlanId: f.ratePlanId,
      checkIn: day,
      checkOut: nextDay(2),
    });
    expect(preview.totalPaise).toBe(20000);
    await amendments.confirmAmendment(
      uid,
      b.id,
      { token: preview.token },
      "amend",
    );
    await amendments.confirmAmendment(
      uid,
      b.id,
      { token: preview.token },
      "amend",
    );
    const record = (await db.collection("bookings").doc(b.id).get()).data()!;
    expect(record.checkOut).toBe(nextDay(2));
    expect(record.reservationRevision).toBe(1);
    expect(record.totalPaise).toBe(20000);
    const calendars = await db
      .collection("inventoryCalendars")
      .where("propertyId", "==", f.propertyId)
      .get();
    expect(
      calendars.docs.every((d) =>
        Object.values(d.get("reserved")).every((n) => n === 0 || n === 1),
      ),
    ).toBe(true);
  }, 30000);
  it("rejects stale amendment prices and amendments after check-in without partial changes", async () => {
    const f = await fixture(),
      b = await f.create();
    const input = {
      roomTypeId: f.roomTypeId,
      ratePlanId: f.ratePlanId,
      checkIn: day,
      checkOut: nextDay(2),
    };
    const preview = await amendments.previewAmendment(uid, b.id, input);
    await db
      .collection("ratePlans")
      .doc(f.ratePlanId)
      .update({ basePricePaise: 15000 });
    await expect(
      amendments.confirmAmendment(uid, b.id, { token: preview.token }, "stale"),
    ).rejects.toThrow("fresh price");
    expect(
      (await db.collection("bookings").doc(b.id).get()).get("checkOut"),
    ).toBe(nextDay(1));
    await db
      .collection("bookings")
      .doc(b.id)
      .update({ bookingStatus: "checked_in" });
    await expect(amendments.previewAmendment(uid, b.id, input)).rejects.toThrow(
      "Only future confirmed",
    );
  });
  it("searches exact booking IDs and scoped tokens while keeping daily metrics independent of search", async () => {
    const f = await fixture(),
      b = await f.create();
    const exact = await list(uid, {
      propertyId: f.propertyId,
      date: day,
      q: b.id,
    });
    expect(exact.bookings.map((row) => row.id)).toEqual([b.id]);
    const missing = await list(uid, {
      propertyId: f.propertyId,
      date: day,
      q: "unmatched",
    });
    expect(missing.bookings).toHaveLength(0);
    expect("metrics" in missing && missing.metrics?.arrivals).toBe(1);
  }, 30000);
  it("atomically moves a booking to a different room type and clears its physical assignment", async () => {
    const f = await fixture(1),
      b = await f.create();
    const unit = await ops.saveUnit(uid, {
      propertyId: f.propertyId,
      roomTypeId: f.roomTypeId,
      label: "201",
    });
    await ops.performOperation(
      uid,
      b.id,
      { action: "assign", unitId: unit.id, revision: 0 },
      "assign",
    );
    const otherRoom = `${f.propertyId}-suite`,
      otherRate = `${f.propertyId}-suite-rate`;
    await db.collection("roomTypes").doc(otherRoom).set({
      propertyId: f.propertyId,
      name: "Suite",
      status: "active",
      totalInventory: 1,
      maxAdults: 2,
    });
    await db.collection("ratePlans").doc(otherRate).set({
      propertyId: f.propertyId,
      roomTypeId: otherRoom,
      name: "Suite rate",
      status: "active",
      bookingMode: "overnight",
      pricingModel: "nightly",
      basePricePaise: 20000,
      paymentMode: "pay_at_property",
    });
    const preview = await amendments.previewAmendment(uid, b.id, {
      roomTypeId: otherRoom,
      ratePlanId: otherRate,
      checkIn: day,
      checkOut: nextDay(1),
    });
    expect(preview.assignmentCleared).toBe(true);
    await amendments.confirmAmendment(
      uid,
      b.id,
      { token: preview.token },
      "suite",
    );
    const record = (await db.collection("bookings").doc(b.id).get()).data()!;
    expect(record.roomType.id).toBe(otherRoom);
    expect(record.physicalUnitId).toBeNull();
    const old = await db
      .collection("inventoryCalendars")
      .where("propertyId", "==", f.propertyId)
      .where("roomTypeId", "==", f.roomTypeId)
      .get();
    expect(
      old.docs.every((d) =>
        Object.values(d.get("reserved")).every((n) => n === 0),
      ),
    ).toBe(true);
  });
  it("limits mixed-source cancellation refunds to actual provider collections", async () => {
    const f = await fixture(),
      b = await f.create();
    await db.collection("bookings").doc(b.id).update({
      paymentMethod: "online",
      paidPaise: 4000,
      razorpayPaymentId: "provider-mixed",
      paymentStatus: "partially_paid",
    });
    await ops.performOperation(
      uid,
      b.id,
      { action: "collect", amountPaise: 3000, method: "cash" },
      "mixed",
    );
    await bookings.releaseBookingHold(
      b.id,
      uid,
      "cancelled",
      "PARTNER_CANCELLED",
    );
    expect(
      (await db.collection("refunds").doc(`${b.id}_cancellation`).get()).get(
        "amountPaise",
      ),
    ).toBe(4000);
  });
  it("gates financial writes independently of saved notes and read-only history", async () => {
    const f = await fixture(),
      b = await f.create();
    process.env.PARTNER_RESERVATIONS_PAYMENTS = "false";
    try {
      await expect(
        ops.performOperation(
          uid,
          b.id,
          { action: "collect", amountPaise: 100, method: "cash" },
          "off",
        ),
      ).rejects.toThrow("not been enabled");
      await ops.performOperation(
        uid,
        b.id,
        { action: "note", text: "Still available" },
        "on",
      );
      expect(
        (await ops.bookingOperations(uid, b.id)).events.some(
          (e) => e.text === "Still available",
        ),
      ).toBe(true);
    } finally {
      delete process.env.PARTNER_RESERVATIONS_PAYMENTS;
    }
  });
  it("counts arrivals across the selected range instead of only the legacy anchor date", async () => {
    const f = await fixture();
    await f.create();
    await bookings.createManualReservation(uid, { ...f.input, checkIn: nextDay(1), checkOut: nextDay(2) }, crypto.randomUUID());
    const result = await list(uid, { propertyId: f.propertyId, date: day, scope: "range", from: day, to: nextDay(1), view: "arrivals" });
    expect(result.bookings).toHaveLength(2); expect(result.metrics?.arrivals).toBe(2); expect(result.metrics?.departures).toBe(1);
    const exported = await list(uid, { propertyId: f.propertyId, date: day, scope: "range", from: day, to: nextDay(1), view: "arrivals" }, true);
    expect(exported.bookings).toHaveLength(2);
  }, 30000);

});
