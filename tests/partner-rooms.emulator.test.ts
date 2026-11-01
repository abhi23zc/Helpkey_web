import { beforeAll, afterAll, describe, it, expect } from "vitest";
const safe = /^(127\.0\.0\.1|localhost):\d+$/.test(
  process.env.FIRESTORE_EMULATOR_HOST || "",
);
describe.skipIf(!safe)("room workspace transactions", () => {
  let db: typeof import("@/lib/firebase/admin").adminDb,
    service: typeof import("@/lib/partner/rooms/service"),
    bookings: typeof import("@/lib/bookings");
  const properties: string[] = [],
    uid = `rooms-owner-${crypto.randomUUID()}`;
  const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const next = (n: number) =>
    new Date(Date.parse(day) + n * 86400000).toISOString().slice(0, 10);
  beforeAll(async () => {
    process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-bookings";
    delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    delete process.env.REDIS_URL;
    process.env.PARTNER_ROOMS_CALENDAR = "true";
    process.env.PARTNER_ROOMS_HOUSEKEEPING = "true";
    db = (await import("@/lib/firebase/admin")).adminDb;
    service = await import("@/lib/partner/rooms/service");
    bookings = await import("@/lib/bookings");
  }, 30000);
  afterAll(async () => {
    for (const propertyId of properties) {
      for (const name of [
        "roomTypes",
        "ratePlans",
        "rateDatePrices",
        "roomBulkPreviews",
        "propertyMemberships",
        "physicalUnits",
        "physicalUnitLabels",
        "physicalUnitCalendars",
        "bookings",
        "inventoryBlocks",
        "inventoryCalendars",
        "inventoryHolds",
        "bookingReferences",
        "bookingNotificationOutbox",
        "propertyPayments",
      ]) {
        const docs = await db
          .collection(name)
          .where("propertyId", "==", propertyId)
          .get();
        for (const d of docs.docs) await db.recursiveDelete(d.ref);
      }
      await db.recursiveDelete(db.collection("properties").doc(propertyId));
    }
    await db.terminate();
  }, 30000);
  async function fixture() {
    const propertyId = `rooms-${crypto.randomUUID()}`,
      roomTypeId = `${propertyId}-room`,
      ratePlanId = `${propertyId}-rate`,
      unitId = `${propertyId}-unit`;
    properties.push(propertyId);
    await db
      .collection("properties")
      .doc(propertyId)
      .set({
        slug: propertyId,
        name: "Test hotel",
        timezone: "Asia/Kolkata",
        currency: "INR",
        inventoryEngine: "interval_v1",
        bookingModes: ["overnight", "hourly"],
        status: "active",
        approvalStatus: "approved",
        isBookable: true,
      });
    await db
      .collection("propertyMemberships")
      .doc(`${propertyId}_${uid}`)
      .set({ propertyId, status: "active" });
    await db
      .collection("roomTypes")
      .doc(roomTypeId)
      .set({
        propertyId,
        name: "Double",
        status: "active",
        totalInventory: 2,
        maxAdults: 2,
        maxChildren: 0,
        bookingModes: ["overnight", "hourly"],
        cleaningBufferMinutes: 30,
      });
    await db.collection("ratePlans").doc(ratePlanId).set({
      propertyId,
      roomTypeId,
      name: "Flexible",
      status: "active",
      bookingMode: "overnight",
      pricingModel: "nightly",
      basePricePaise: 10000,
      taxBasisPoints: 1000,
      paymentMode: "pay_at_property",
    });
    await db
      .collection("physicalUnits")
      .doc(unitId)
      .set({ propertyId, roomTypeId, label: "101", status: "active" });
    return { propertyId, roomTypeId, ratePlanId, unitId };
  }
  async function change(
    f: Awaited<ReturnType<typeof fixture>>,
    cells: unknown[],
  ) {
    const p = await service.bulk(uid, f.propertyId, {
      action: "preview",
      input: { cells },
    });
    await service.bulk(uid, f.propertyId, {
      action: "apply",
      previewId: p.previewId,
    });
    return p;
  }
  it("prices each night, preserves booking snapshots, and restores base prices idempotently", async () => {
    const f = await fixture();
    const p = await change(f, [
      {
        roomTypeId: f.roomTypeId,
        ratePlanId: f.ratePlanId,
        date: day,
        basePricePaise: 20000,
      },
    ]);
    await service.bulk(uid, f.propertyId, {
      action: "apply",
      previewId: p.previewId,
    });
    const input = {
      propertySlug: f.propertyId,
      roomTypeId: f.roomTypeId,
      ratePlanId: f.ratePlanId,
      checkIn: day,
      checkOut: next(2),
      adults: 1,
      children: 0,
      infants: 0,
    };
    const quote = await bookings.quote(input);
    expect(quote.subtotalPaise).toBe(30000);
    expect(quote.totalPaise).toBe(33000);
    const manual = await bookings.createManualReservation(
      uid,
      {
        ...input,
        propertyId: f.propertyId,
        guestName: "Ada Guest",
        guestEmail: "ada@example.com",
        guestPhone: "+919876543210",
        expectedTotalPaise: 33000,
      },
      "date-quote",
    );
    await change(f, [
      {
        roomTypeId: f.roomTypeId,
        ratePlanId: f.ratePlanId,
        date: day,
        clearPrice: true,
      },
    ]);
    expect((await bookings.quote(input)).subtotalPaise).toBe(20000);
    expect(
      (await db.collection("bookings").doc(manual.id).get()).get("totalPaise"),
    ).toBe(33000);
  }, 30000);
  it("uses hourly arrival-date overrides across midnight and agrees with live search", async () => {
    const f = await fixture();
    await db
      .collection("ratePlans")
      .doc(f.ratePlanId)
      .update({
        bookingMode: "hourly",
        pricingModel: "duration",
        durationPrices: [{ hours: 3, pricePaise: 10000 }],
        allowMidnightCrossing: true,
      });
    await change(f, [
      {
        roomTypeId: f.roomTypeId,
        ratePlanId: f.ratePlanId,
        date: day,
        durationPrices: [{ hours: 3, pricePaise: 25000 }],
      },
    ]);
    const input = {
      roomTypeId: f.roomTypeId,
      ratePlanId: f.ratePlanId,
      bookingMode: "hourly" as const,
      checkIn: day,
      arrivalTime: "23:00",
      durationMinutes: 180,
      adults: 1,
      children: 0,
      infants: 0,
    };
    const quote = await bookings.quote({
      ...input,
      propertySlug: f.propertyId,
    });
    expect(quote.subtotalPaise).toBe(25000);
    expect(quote.departureTime).toBe("02:00");
    const { availableOffers } =
      await import("@/lib/booking/search-availability");
    const property = (
      await db.collection("properties").where("slug", "==", f.propertyId).get()
    ).docs[0];
    expect((await availableOffers(db, property, input))[0].totalPaise).toBe(
      quote.totalPaise,
    );
  }, 30000);
  it("rejects stale bulk previews and cross-property edits", async () => {
    const f = await fixture(),
      foreign = await fixture();
    const cells = [{ roomTypeId: f.roomTypeId, date: day, stopSell: true }];
    const p = await service.bulk(uid, f.propertyId, {
      action: "preview",
      input: { cells },
    });
    await db
      .collection("roomTypes")
      .doc(f.roomTypeId)
      .update({ name: "Changed" });
    await expect(
      service.bulk(uid, f.propertyId, {
        action: "apply",
        previewId: p.previewId,
      }),
    ).rejects.toThrow("DATA_CHANGED_PREVIEW_AGAIN");
    await expect(
      service.bulk(uid, f.propertyId, {
        action: "preview",
        input: { cells: [{ ...cells[0], roomTypeId: foreign.roomTypeId }] },
      }),
    ).rejects.toThrow("ROOM_NOT_AVAILABLE");
    await expect(
      service.workspace("stranger", f.propertyId, day, next(1)),
    ).rejects.toThrow();
  }, 30000);
  it("updates housekeeping with revision checks and checkout marks an assigned room dirty", async () => {
    const f = await fixture();
    await service.housekeeping(uid, f.propertyId, {
      unitId: f.unitId,
      status: "clean",
      revision: 0,
      note: "Ready",
    });
    await expect(
      service.housekeeping(uid, f.propertyId, {
        unitId: f.unitId,
        status: "inspected",
        revision: 0,
      }),
    ).rejects.toThrow("DATA_CHANGED_REFRESH");
    const ref = db.collection("bookings").doc();
    await ref.set({
      propertyId: f.propertyId,
      bookingStatus: "checked_in",
      physicalUnitId: f.unitId,
    });
    await bookings.transitionBooking(ref.id, uid, "checked_out");
    expect(
      (await db.collection("physicalUnits").doc(f.unitId).get()).get(
        "housekeepingStatus",
      ),
    ).toBe("dirty");
    expect((await ref.get()).get("bookingStatus")).toBe("checked_out");
  }, 30000);
  it("blocks both numbered room and aggregate capacity, then releases exactly once", async () => {
    const f = await fixture();
    const { resolveLocal } = await import("@/lib/booking/domain");
    const input = {
      unitId: f.unitId,
      roomTypeId: f.roomTypeId,
      startAt: new Date(
        resolveLocal(day, "10:00", "Asia/Kolkata"),
      ).toISOString(),
      endAt: new Date(resolveLocal(day, "12:00", "Asia/Kolkata")).toISOString(),
      quantity: 1,
      reason: "Repair air conditioner",
      requestId: crypto.randomUUID(),
    };
    const result = await service.maintenance(uid, f.propertyId, input);
    expect(await service.maintenance(uid, f.propertyId, input)).toEqual(result);
    expect(
      (
        await service.exactAvailability(uid, f.propertyId, {
          roomTypeId: f.roomTypeId,
          startDate: day,
          startTime: "10:00",
          endDate: day,
          endTime: "11:00",
        })
      ).available,
    ).toBe(1);
    await expect(
      service.maintenance(uid, f.propertyId, {
        ...input,
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toThrow("ROOM_ALREADY_ASSIGNED");
    const { releaseCapacityBlock } = await import("@/lib/booking/blocks");
    await releaseCapacityBlock(uid, f.propertyId, result.blockId);
    await releaseCapacityBlock(uid, f.propertyId, result.blockId);
    expect(
      (
        await service.exactAvailability(uid, f.propertyId, {
          roomTypeId: f.roomTypeId,
          startDate: day,
          startTime: "10:00",
          endDate: day,
          endTime: "11:00",
        })
      ).available,
    ).toBe(2);
    const calendars = await db
      .collection("physicalUnitCalendars")
      .where("unitId", "==", f.unitId)
      .get();
    expect(
      calendars.docs.every((d) => Object.keys(d.get("slots")).length === 0),
    ).toBe(true);
  }, 30000);
  it("serializes concurrent maintenance against a single remaining room", async () => {
    const f = await fixture();
    await db
      .collection("roomTypes")
      .doc(f.roomTypeId)
      .update({ totalInventory: 1 });
    const input = {
      roomTypeId: f.roomTypeId,
      startAt: `${day}T04:30:00Z`,
      endAt: `${day}T06:30:00Z`,
      quantity: 1,
      reason: "Maintenance",
    };
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        service.maintenance(uid, f.propertyId, {
          ...input,
          requestId: crypto.randomUUID(),
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  }, 30000);
  it("blocks new sales while retaining existing reservation allocations", async () => {
    const f = await fixture();
    await bookings.createManualReservation(
      uid,
      {
        propertyId: f.propertyId,
        roomTypeId: f.roomTypeId,
        ratePlanId: f.ratePlanId,
        checkIn: day,
        checkOut: next(1),
        adults: 1,
        children: 0,
        infants: 0,
        guestName: "Ada Guest",
      },
      "before-stop",
    );
    await change(f, [{ roomTypeId: f.roomTypeId, date: day, stopSell: true }]);
    await expect(
      bookings.quote({
        propertySlug: f.propertyId,
        roomTypeId: f.roomTypeId,
        ratePlanId: f.ratePlanId,
        checkIn: day,
        checkOut: next(1),
        adults: 1,
        children: 0,
        infants: 0,
      }),
    ).rejects.toThrow("SOLD_OUT_FOR_DATES");
    const calendar = await db
      .collection("inventoryCalendars")
      .doc(`${f.propertyId}_${f.roomTypeId}_${day}`)
      .get();
    expect(
      Math.max(
        ...Object.values(calendar.get("reserved") as Record<string, number>),
      ),
    ).toBe(1);
    await change(f, [{ roomTypeId: f.roomTypeId, date: day, stopSell: false }]);
    expect(
      (
        await service.exactAvailability(uid, f.propertyId, {
          roomTypeId: f.roomTypeId,
          startDate: day,
          startTime: "14:00",
          endDate: next(1),
          endTime: "11:00",
        })
      ).available,
    ).toBe(1);
  }, 30000);
  it("reprices amendments using calendar overrides", async () => {
    const f = await fixture();
    const booking = await bookings.createManualReservation(
      uid,
      {
        propertyId: f.propertyId,
        roomTypeId: f.roomTypeId,
        ratePlanId: f.ratePlanId,
        checkIn: day,
        checkOut: next(1),
        adults: 1,
        children: 0,
        infants: 0,
        guestName: "Ada Guest",
      },
      "amend-date",
    );
    await change(f, [
      {
        roomTypeId: f.roomTypeId,
        ratePlanId: f.ratePlanId,
        date: next(1),
        basePricePaise: 30000,
      },
    ]);
    const { previewAmendment } =
      await import("@/lib/partner/reservations/amendments");
    const preview = await previewAmendment(uid, booking.id, {
      roomTypeId: f.roomTypeId,
      ratePlanId: f.ratePlanId,
      checkIn: next(1),
      checkOut: next(2),
    });
    expect(JSON.stringify(preview)).toContain("33000");
  }, 30000);
});
