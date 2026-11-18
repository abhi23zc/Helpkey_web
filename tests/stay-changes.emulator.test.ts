import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  allocateIntervals,
  localParts,
  resolveLocal,
} from "@/lib/booking/domain";
import { allocationCounts } from "@/lib/booking/assignment-segments";
const safe = /^(127\.0\.0\.1|localhost):\d+$/.test(
  process.env.FIRESTORE_EMULATOR_HOST || "",
);
describe.skipIf(!safe)(
  "atomic in-house stay changes on disposable emulator hotels",
  { timeout: 30000 },
  () => {
    let db: typeof import("@/lib/firebase/admin").adminDb,
      service: typeof import("@/lib/partner/reservations/stay-changes"),
      billing: typeof import("@/lib/partner/billing/service");
    const prefix = `stay-change-${crypto.randomUUID()}`,
      hotels: string[] = [],
      owner = `${prefix}-owner`,
      desk = `${prefix}-desk`,
      outsider = `${prefix}-other`,
      timezone = "Asia/Kolkata";
    beforeAll(async () => {
      process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-pms";
      process.env.BACKGROUND_MODE = "legacy";
      process.env.REDIS_DISABLED = "1";
      delete process.env.PARTNER_RESERVATIONS_STAY_CHANGES;
      db = (await import("@/lib/firebase/admin")).adminDb;
      service = await import("@/lib/partner/reservations/stay-changes");
      billing = await import("@/lib/partner/billing/service");
      for (const id of [owner, desk, outsider])
        await db
          .collection("users")
          .doc(id)
          .set({ roles: ["partner"], isActive: true, accountStatus: "active" });
    });
    afterAll(async () => {
      vi.restoreAllMocks();
      for (const hotel of hotels) {
        for (const c of [
          "bookings",
          "physicalUnits",
          "physicalUnitCalendars",
          "roomTypes",
          "ratePlans",
          "rateDatePrices",
          "inventoryHolds",
          "inventoryCalendars",
          "inventoryBlocks",
          "propertyMemberships",
          "cancellationPolicies",
          "bookingNotificationOutbox",
          "propertyPayments",
          "paymentAttempts",
        ]) {
          const rows = await db
            .collection(c)
            .where("propertyId", "==", hotel)
            .get();
          await Promise.all(rows.docs.map((d) => db.recursiveDelete(d.ref)));
        }
        await db.recursiveDelete(db.collection("properties").doc(hotel));
      }
      for (const id of [owner, desk, outsider])
        await db.collection("users").doc(id).delete();
    });
    async function fixture() {
      const hotel = `${prefix}-${hotels.length}`,
        a = `${hotel}-a`,
        b = `${hotel}-b`,
        c = `${hotel}-c`,
        type = `${hotel}-base`,
        upgrade = `${hotel}-suite`,
        rate = `${hotel}-rate`,
        policy = `${hotel}-policy`,
        id = `${hotel}-booking`;
      hotels.push(hotel);
      const day = localParts(Date.now(), timezone).date,
        date = (offset: number) =>
          new Date(Date.parse(day) + offset * 86400000)
            .toISOString()
            .slice(0, 10);
      const startAt = new Date(
          resolveLocal(date(-1), "14:00", timezone),
        ).toISOString(),
        endAt = new Date(
          resolveLocal(date(1), "11:00", timezone),
        ).toISOString(),
        inventoryEndAt = new Date(Date.parse(endAt) + 1800000).toISOString(),
        allocations = allocateIntervals(startAt, inventoryEndAt, timezone);
      await db
        .collection("properties")
        .doc(hotel)
        .set({
          ownerId: owner,
          name: "Disposable hotel",
          address: { city: "Test", line1: "Test" },
          publicPhone: "1234",
          status: "active",
          approvalStatus: "approved",
          isBookable: true,
          inventoryEngine: "interval_v1",
          timezone,
          checkInTime: "14:00",
          checkOutTime: "11:00",
          cleaningBufferMinutes: 30,
          pms: {
            activatedAt: "test",
            teamReviewed: true,
            openingData: "none",
            inventoryVerification: { passed: true },
            operationalPolicies: { requireCleanRoom: true },
          },
        });
      for (const [uid, role] of [
        [owner, "owner"],
        [desk, "receptionist"],
      ])
        await db
          .collection("propertyMemberships")
          .doc(`${hotel}_${uid}`)
          .set({ propertyId: hotel, userId: uid, role, status: "active" });
      await db
        .collection("cancellationPolicies")
        .doc(policy)
        .set({ propertyId: hotel, status: "active" });
      for (const [rid, totalInventory] of [
        [type, 2],
        [upgrade, 1],
      ] as const) {
        await db
          .collection("roomTypes")
          .doc(rid)
          .set({
            propertyId: hotel,
            status: "active",
            name: rid === type ? "Base" : "Suite",
            totalInventory,
            maxAdults: 2,
            maxChildren: 1,
            maxOccupancy: 3,
            cleaningBufferMinutes: 30,
          });
        await db
          .collection("ratePlans")
          .doc(rid === type ? rate : `${rate}-suite`)
          .set({
            propertyId: hotel,
            roomTypeId: rid,
            status: "active",
            name: "Extension rate",
            basePricePaise: 10000,
            taxBasisPoints: 1000,
            customerFeePaise: 500,
            cancellationPolicyId: policy,
          });
      }
      for (const [uid, rid, label] of [
        [a, type, "101"],
        [b, type, "102"],
        [c, upgrade, "201"],
      ])
        await db.collection("physicalUnits").doc(uid).set({
          propertyId: hotel,
          roomTypeId: rid,
          label,
          status: "active",
          housekeepingStatus: "clean",
        });
      const booking = {
        propertyId: hotel,
        bookingStatus: "checked_in",
        inventoryEngine: "interval_v1",
        physicalUnitId: a,
        physicalUnitLabel: "101",
        roomType: { id: type, name: "Base" },
        ratePlan: { id: rate },
        physicalAllocations: allocations,
        timezone,
        startAt,
        endAt,
        inventoryEndAt,
        checkIn: date(-1),
        checkOut: date(1),
        departureTime: "11:00",
        bookingMode: "overnight",
        cleaningBufferMinutes: 30,
        totalPaise: 20000,
        paidPaise: 0,
        quantity: 1,
        adults: 1,
        currency: "INR",
        quoteSnapshot: {
          totalPaise: 20000,
          startAt,
          endAt,
          roomType: { id: type, name: "Base" },
        },
      };
      await db.collection("bookings").doc(id).set(booking);
      await db.collection("inventoryHolds").doc(id).set({
        propertyId: hotel,
        bookingId: id,
        roomTypeId: type,
        quantity: 1,
        status: "committed",
        allocations,
      });
      for (const row of allocations) {
        await db
          .collection("inventoryCalendars")
          .doc(`${hotel}_${type}_${row.date}`)
          .set({
            propertyId: hotel,
            roomTypeId: type,
            date: row.date,
            reserved: Object.fromEntries(row.intervals.map((k) => [k, 1])),
          });
        await db
          .collection("physicalUnitCalendars")
          .doc(`${a}_${row.date}`)
          .set({
            propertyId: hotel,
            unitId: a,
            date: row.date,
            slots: Object.fromEntries(row.intervals.map((k) => [k, id])),
          });
      }
      return { hotel, a, b, c, type, upgrade, rate, id, booking, date };
    }
    const confirm = (
      uid: string,
      id: string,
      token: string,
      key = crypto.randomUUID(),
    ) =>
      service.confirmStayChange(
        uid,
        id,
        { token, reason: "Guest agreed change" },
        key,
      );
    it("allows reception moves, preserves elapsed slots and turnover, posts no charge, replays after checkout", async () => {
      const f = await fixture(),
        p = await service.previewStayChange(desk, f.id, {
          action: "move",
          unitId: f.b,
        });
      expect(p).not.toHaveProperty("balanceDuePaise");
      const result = await confirm(desk, f.id, p.token, "exact");
      const b = (await db.collection("bookings").doc(f.id).get()).data()!;
      expect(b.assignmentSegments).toHaveLength(2);
      expect(b.physicalUnitId).toBe(f.b);
      expect(b.totalPaise).toBe(20000);
      expect(b.quoteSnapshot).toEqual(f.booking.quoteSnapshot);
      expect(
        (await db.collection("physicalUnits").doc(f.a).get()).get(
          "housekeepingStatus",
        ),
      ).toBe("dirty");
      const expected = allocationCounts(
        b.assignmentSegments.map(
          (s: {
            roomTypeId: string;
            allocations: ReturnType<typeof allocateIntervals>;
          }) => s,
        ),
      );
      for (const [key, value] of expected) {
        const [type, date, slot] = key.split("/");
        expect(
          (
            await db
              .collection("inventoryCalendars")
              .doc(`${f.hotel}_${type}_${date}`)
              .get()
          ).get(`reserved.${slot}`),
        ).toBe(value);
      }
      expect([...expected.values()]).toContain(2);
      expect(
        (
          await db
            .collection("bookings")
            .doc(f.id)
            .collection("billingEntries")
            .get()
        ).empty,
      ).toBe(true);
      expect(
        await db.runTransaction((tx) =>
          import("@/lib/partner/pms/inventory-verification").then((m) =>
            m.verifyPmsInventory(f.hotel, tx),
          ),
        ),
      ).toBe(true);
      await db
        .collection("bookings")
        .doc(f.id)
        .update({ bookingStatus: "checked_out" });
      expect(await confirm(desk, f.id, p.token, "exact")).toEqual(result);
      await expect(
        service.confirmStayChange(
          desk,
          f.id,
          { token: p.token, reason: "Different reason" },
          "exact",
        ),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    });
    it("rejects direct restricted actions, cross-hotel tokens and the old assignment path", async () => {
      const f = await fixture(),
        g = await fixture();
      for (const action of [
        {
          action: "category",
          unitId: f.c,
          settlement: "complimentary",
          adjustmentPaise: 0,
        },
        { action: "extend", departureDate: f.date(2) },
        {
          action: "early_departure",
          departure: "now",
          settlement: "retain",
          adjustmentPaise: 0,
        },
      ])
        await expect(
          service.previewStayChange(desk, f.id, action),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        service.previewStayChange(outsider, f.id, {
          action: "move",
          unitId: f.b,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const p = await service.previewStayChange(owner, f.id, {
        action: "move",
        unitId: f.b,
      });
      await expect(confirm(owner, g.id, p.token)).rejects.toMatchObject({
        code: "INVALID_PREVIEW",
      });
      await expect(
        (
          await import("@/lib/partner/reservations/operations")
        ).performOperation(
          desk,
          f.id,
          { action: "assign", unitId: f.b, revision: 0 },
          "old",
        ),
      ).rejects.toMatchObject({ code: "USE_STAY_CHANGE" });
    });
    it("blocks dirty, inactive, occupied and maintained destinations", async () => {
      const f = await fixture(),
        input = { action: "move", unitId: f.b };
      await db
        .collection("physicalUnits")
        .doc(f.b)
        .update({ housekeepingStatus: "dirty" });
      await expect(
        service.previewStayChange(owner, f.id, input),
      ).rejects.toMatchObject({ code: "ROOM_NOT_CLEAN" });
      await db
        .collection("physicalUnits")
        .doc(f.b)
        .update({ housekeepingStatus: "clean", status: "inactive" });
      await expect(
        service.previewStayChange(owner, f.id, input),
      ).rejects.toMatchObject({ code: "PMS_SETUP_REQUIRED" });
      await db
        .collection("physicalUnits")
        .doc(f.b)
        .update({ status: "active" });
      await db.collection("bookings").doc(`${f.id}-occupant`).set({
        propertyId: f.hotel,
        bookingStatus: "checked_in",
        physicalUnitId: f.b,
      });
      await expect(
        service.previewStayChange(owner, f.id, input),
      ).rejects.toMatchObject({ code: "ROOM_OCCUPIED" });
      await db.collection("bookings").doc(`${f.id}-occupant`).delete();
      await db.collection("inventoryBlocks").doc(`${f.hotel}-block`).set({
        propertyId: f.hotel,
        unitId: f.b,
        status: "active",
        startAt: new Date().toISOString(),
        endAt: f.booking.endAt,
      });
      await expect(
        service.previewStayChange(owner, f.id, input),
      ).rejects.toMatchObject({ code: "ROOM_MAINTENANCE" });
    });
    it("never repairs missing allocation evidence", async () => {
      const f = await fixture();
      await db
        .collection("bookings")
        .doc(f.id)
        .update({ physicalAllocations: [] });
      await expect(
        service.previewStayChange(owner, f.id, { action: "move", unitId: f.b }),
      ).rejects.toMatchObject({ code: "ASSIGNMENT_RECONCILIATION_REQUIRED" });
      expect(
        (await db.collection("bookings").doc(f.id).get()).get(
          "assignmentSegments",
        ),
      ).toBeUndefined();
    });
    it("rejects stale financial, document, price and inventory reviews without partial writes", async () => {
      for (const dependency of [
        "financial",
        "document",
        "price",
        "inventory",
      ]) {
        const f = await fixture(),
          input = { action: "extend", departureDate: f.date(2) },
          p = await service.previewStayChange(owner, f.id, input);
        if (dependency === "financial")
          await billing.commandFolio(
            owner,
            f.id,
            {
              action: "post",
              expectedRevision: 0,
              category: "other",
              description: "New hotel charge",
              amountPaise: 10,
              details: { explanation: "New charge" },
            },
            "new",
          );
        if (dependency === "document")
          await db
            .collection("bookings")
            .doc(f.id)
            .collection("invoiceWorkspace")
            .doc("state")
            .set({
              claims: { booking: 20000 },
              reductionClaims: {},
              credited: {},
            });
        if (dependency === "price")
          await db
            .collection("ratePlans")
            .doc(f.rate)
            .update({ basePricePaise: 12000 });
        if (dependency === "inventory") {
          const date = f.date(2);
          await db
            .collection("physicalUnitCalendars")
            .doc(`${f.a}_${date}`)
            .set({
              propertyId: f.hotel,
              slots: Object.fromEntries(
                allocateIntervals(
                  f.booking.endAt,
                  new Date(resolveLocal(date, "11:30", timezone)).toISOString(),
                  timezone,
                ).flatMap((a) =>
                  a.intervals.map((k) => [k, "another-booking"]),
                ),
              ),
            });
        }
        await expect(confirm(owner, f.id, p.token)).rejects.toBeDefined();
        const b = (await db.collection("bookings").doc(f.id).get()).data()!;
        expect(b.endAt).toBe(f.booking.endAt);
        expect(b.assignmentSegments).toBeUndefined();
      }
    });
    it("serializes competing moves and rechecks final cleaning capacity", async () => {
      const f = await fixture(),
        p = await service.previewStayChange(owner, f.id, {
          action: "move",
          unitId: f.b,
        }),
        q = await service.previewStayChange(owner, f.id, {
          action: "category",
          unitId: f.c,
          settlement: "charge",
          adjustmentPaise: 1000,
        });
      const results = await Promise.allSettled([
        confirm(owner, f.id, p.token),
        confirm(owner, f.id, q.token),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const g = await fixture(),
        r = await service.previewStayChange(owner, g.id, {
          action: "move",
          unitId: g.b,
        }),
        slot = allocateIntervals(
          new Date().toISOString(),
          new Date(Date.now() + 300000).toISOString(),
          timezone,
        )[0];
      await db
        .collection("inventoryCalendars")
        .doc(`${g.hotel}_${g.type}_${slot.date}`)
        .set(
          { blocked: Object.fromEntries(slot.intervals.map((k) => [k, 1])) },
          { merge: true },
        );
      await expect(confirm(owner, g.id, r.token)).rejects.toMatchObject({
        code: "STAY_CAPACITY_CONFLICT",
      });
      expect(
        (await db.collection("bookings").doc(g.id).get()).get("physicalUnitId"),
      ).toBe(g.a);
    });
    it("posts complimentary, charged and credited categories exactly once and links credit follow-up", async () => {
      for (const [settlement, adjustmentPaise] of [
        ["complimentary", 0],
        ["charge", 1200],
        ["credit", -800],
      ] as const) {
        const f = await fixture();
        await db
          .collection("bookings")
          .doc(f.id)
          .collection("invoiceWorkspace")
          .doc("state")
          .set({
            claims: { booking: 20000 },
            reductionClaims: {},
            credited: {},
          });
        const p = await service.previewStayChange(owner, f.id, {
          action: "category",
          unitId: f.c,
          settlement,
          adjustmentPaise,
        });
        expect(p.balanceDuePaise).toBe(20000 + adjustmentPaise);
        await confirm(owner, f.id, p.token, "same");
        await confirm(owner, f.id, p.token, "same");
        const entries = await db
          .collection("bookings")
          .doc(f.id)
          .collection("billingEntries")
          .get();
        expect(entries.size).toBe(adjustmentPaise ? 1 : 0);
        if (adjustmentPaise < 0) {
          const invoice = await (
            await import("@/lib/partner/invoices/service")
          ).reviewInvoice(owner, f.id);
          expect(
            invoice.reductions.find((r) => r.id === "booking")?.remainingPaise,
          ).toBe(800);
        }
        expect(
          (await db.collection("bookings").doc(f.id).get()).get("totalPaise"),
        ).toBe(20000);
      }
    });
    it("extends only the new interval at date prices and retains provider and original snapshots", async () => {
      const f = await fixture();
      await db
        .collection("ratePlans")
        .doc(f.rate)
        .update({ datePricingEnabled: true });
      const priceRef = (await import("@/lib/booking/date-prices")).datePriceRef(
        f.hotel,
        f.rate,
        f.date(1),
      );
      await priceRef.set({ propertyId: f.hotel, basePricePaise: 15000 });
      const p = await service.previewStayChange(owner, f.id, {
        action: "extend",
        departureDate: f.date(2),
      });
      expect(p.adjustmentPaise).toBe(16500);
      await confirm(owner, f.id, p.token);
      const b = (await db.collection("bookings").doc(f.id).get()).data()!;
      expect(b.totalPaise).toBe(20000);
      expect(b.billingNetPaise).toBe(16500);
      expect(b.quoteSnapshot).toEqual(f.booking.quoteSnapshot);
      expect(b.assignmentSegments).toHaveLength(1);
      const oldSlots = f.booking.physicalAllocations.flatMap(
          (a) => a.intervals,
        ),
        newSlots = b.physicalAllocations.flatMap(
          (a: { intervals: string[] }) => a.intervals,
        );
      expect(oldSlots.every((k) => newSlots.includes(k))).toBe(true);
    });
    it("shortens without checkout or refund and blocks unresolved service times", async () => {
      const f = await fixture();
      await db
        .collection("bookings")
        .doc(f.id)
        .update({
          customizations: [
            {
              id: "service",
              status: "confirmed",
              inputs: { serviceAt: f.booking.endAt },
            },
          ],
        });
      await expect(
        service.previewStayChange(owner, f.id, {
          action: "early_departure",
          departure: "now",
          settlement: "retain",
          adjustmentPaise: 0,
        }),
      ).rejects.toMatchObject({ code: "RESOLVE_SERVICE_COMMITMENTS" });
      await db.collection("bookings").doc(f.id).update({ customizations: [] });
      const p = await service.previewStayChange(owner, f.id, {
        action: "early_departure",
        departure: "now",
        settlement: "reduce",
        adjustmentPaise: -5000,
      });
      await confirm(owner, f.id, p.token);
      const b = (await db.collection("bookings").doc(f.id).get()).data()!;
      expect(b.bookingStatus).toBe("checked_in");
      expect(b.refundedPaise).toBeUndefined();
      expect(b.billingNetPaise).toBe(-5000);
      expect(b.physicalAllocations[0]).toEqual(
        f.booking.physicalAllocations[0],
      );
      await expect(
        service.previewStayChange(owner, f.id, {
          action: "early_departure",
          departure: new Date(Date.now() - 1000).toISOString(),
          settlement: "retain",
          adjustmentPaise: 0,
        }),
      ).rejects.toMatchObject({ code: "STAY_CHANGE_NOT_ALLOWED" });
    });
    it("rolls back all inventory and financial writes when a final atomic create fails", async () => {
      const f = await fixture(),
        p = await service.previewStayChange(owner, f.id, {
          action: "category",
          unitId: f.c,
          settlement: "charge",
          adjustmentPaise: 1000,
        }),
        key = "collision";
      const id = createHash("sha256")
        .update(JSON.stringify(`${owner}\0${f.id}\0stay-change\0${key}`))
        .digest("hex");
      await db
        .collection("bookings")
        .doc(f.id)
        .collection("events")
        .doc(id)
        .set({ type: "test_collision" });
      await expect(confirm(owner, f.id, p.token, key)).rejects.toBeDefined();
      const b = (await db.collection("bookings").doc(f.id).get()).data()!;
      expect(b.physicalUnitId).toBe(f.a);
      expect(b.assignmentSegments).toBeUndefined();
      expect(b.billingNetPaise).toBeUndefined();
      expect(
        (
          await db
            .collection("bookings")
            .doc(f.id)
            .collection("billingEntries")
            .get()
        ).empty,
      ).toBe(true);
      expect(
        (await db.collection("inventoryHolds").doc(f.id).get()).get(
          "allocations",
        ),
      ).toEqual(f.booking.physicalAllocations);
    });
    it("awards the last destination to only one competing in-house stay", async () => {
      const f = await fixture(),
        second = `${f.id}-second`;
      await db
        .collection("bookings")
        .doc(second)
        .set({ ...f.booking, physicalUnitId: f.b, physicalUnitLabel: "102" });
      await db.collection("inventoryHolds").doc(second).set({
        propertyId: f.hotel,
        bookingId: second,
        roomTypeId: f.type,
        quantity: 1,
        status: "committed",
        allocations: f.booking.physicalAllocations,
      });
      for (const row of f.booking.physicalAllocations) {
        await db
          .collection("inventoryCalendars")
          .doc(`${f.hotel}_${f.type}_${row.date}`)
          .update({
            reserved: Object.fromEntries(row.intervals.map((k) => [k, 2])),
          });
        await db
          .collection("physicalUnitCalendars")
          .doc(`${f.b}_${row.date}`)
          .set({
            propertyId: f.hotel,
            slots: Object.fromEntries(row.intervals.map((k) => [k, second])),
          });
      }
      const input = {
        action: "category",
        unitId: f.c,
        settlement: "complimentary",
        adjustmentPaise: 0,
      };
      const [p, q] = await Promise.all([
        service.previewStayChange(owner, f.id, input),
        service.previewStayChange(owner, second, input),
      ]);
      const results = await Promise.allSettled([
        confirm(owner, f.id, p.token),
        confirm(owner, second, q.token),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (
          await db
            .collection("bookings")
            .where("propertyId", "==", f.hotel)
            .where("physicalUnitId", "==", f.c)
            .get()
        ).size,
      ).toBe(1);
    });
    it("extends a cross-midnight hourly stay without repricing consumed hours", async () => {
      const f = await fixture(),
        fixedNow = resolveLocal("2030-01-01", "23:00", timezone),
        startAt = new Date(
          resolveLocal("2030-01-01", "22:00", timezone),
        ).toISOString(),
        endAt = new Date(
          resolveLocal("2030-01-02", "00:00", timezone),
        ).toISOString(),
        inventoryEndAt = new Date(Date.parse(endAt) + 1800000).toISOString(),
        allocations = allocateIntervals(startAt, inventoryEndAt, timezone);
      for (const c of ["inventoryCalendars", "physicalUnitCalendars"]) {
        const docs = await db
          .collection(c)
          .where("propertyId", "==", f.hotel)
          .get();
        for (const d of docs.docs) await d.ref.delete();
      }
      await db
        .collection("properties")
        .doc(f.hotel)
        .update({ bookingModes: ["overnight", "hourly"] });
      await db
        .collection("roomTypes")
        .doc(f.type)
        .update({ bookingModes: ["hourly"] });
      await db
        .collection("roomTypes")
        .doc(f.upgrade)
        .update({ bookingModes: ["overnight"] });
      await db
        .collection("ratePlans")
        .doc(f.rate)
        .update({
          bookingMode: "hourly",
          pricingModel: "duration",
          durationPrices: [{ hours: 2, pricePaise: 1200 }],
          allowMidnightCrossing: true,
          operatingWindow: { start: "20:00", end: "04:00" },
        });
      await db.collection("bookings").doc(f.id).update({
        bookingMode: "hourly",
        startAt,
        endAt,
        inventoryEndAt,
        checkIn: "2030-01-01",
        checkOut: "2030-01-02",
        durationMinutes: 120,
        physicalAllocations: allocations,
      });
      await db.collection("inventoryHolds").doc(f.id).update({ allocations });
      for (const row of allocations) {
        await db
          .collection("inventoryCalendars")
          .doc(`${f.hotel}_${f.type}_${row.date}`)
          .set({
            propertyId: f.hotel,
            reserved: Object.fromEntries(row.intervals.map((k) => [k, 1])),
          });
        await db
          .collection("physicalUnitCalendars")
          .doc(`${f.a}_${row.date}`)
          .set({
            propertyId: f.hotel,
            slots: Object.fromEntries(row.intervals.map((k) => [k, f.id])),
          });
      }
      const clock = vi.spyOn(Date, "now").mockReturnValue(fixedNow);
      try {
        const p = await service.previewStayChange(owner, f.id, {
          action: "extend",
          additionalMinutes: 120,
        });
        expect(p.adjustmentPaise).toBe(1320);
        await confirm(owner, f.id, p.token);
        const b = (await db.collection("bookings").doc(f.id).get()).data()!;
        expect(b.endAt).toBe(
          new Date(resolveLocal("2030-01-02", "02:00", timezone)).toISOString(),
        );
        expect(b.totalPaise).toBe(20000);
        expect(b.durationMinutes).toBe(240);
      } finally {
        clock.mockRestore();
      }
    });
    it("requires fresh review of pending captures and blocks documented reduction reversal", async () => {
      const f = await fixture(),
        p = await service.previewStayChange(owner, f.id, {
          action: "move",
          unitId: f.b,
        });
      await db
        .collection("paymentAttempts")
        .doc(`${f.id}-capture`)
        .set({
          bookingId: f.id,
          propertyId: f.hotel,
          status: "captured",
          amountPaise: 100,
          paymentId: `${f.id}-capture`,
        });
      await expect(confirm(owner, f.id, p.token)).rejects.toMatchObject({
        code: "BILLING_RECONCILIATION_REQUIRED",
      });
      await db.collection("paymentAttempts").doc(`${f.id}-capture`).delete();
      const q = await service.previewStayChange(owner, f.id, {
        action: "category",
        unitId: f.c,
        settlement: "credit",
        adjustmentPaise: -1000,
      });
      const result = await confirm(owner, f.id, q.token);
      await db
        .collection("bookings")
        .doc(f.id)
        .collection("invoiceWorkspace")
        .doc("state")
        .set({
          claims: { booking: 20000 },
          reductionClaims: { booking: 1000 },
          credited: {},
        });
      await expect(
        billing.commandFolio(
          owner,
          f.id,
          {
            action: "void",
            expectedRevision: 1,
            originalEntryId: result.id,
            reason: "Attempt to reverse documented credit",
          },
          "void",
        ),
      ).rejects.toMatchObject({ code: "DEBIT_NOTE_REQUIRED" });
      expect(
        (await db.collection("bookings").doc(f.id).get()).get(
          "billingNetPaise",
        ),
      ).toBe(-1000);
    });
    it("redacts saved financial figures after a replay actor loses financial visibility", async () => {
      const f = await fixture(),
        p = await service.previewStayChange(owner, f.id, {
          action: "move",
          unitId: f.b,
        });
      expect(await confirm(owner, f.id, p.token, "visibility")).toHaveProperty(
        "balanceDuePaise",
      );
      await db
        .collection("propertyMemberships")
        .doc(`${f.hotel}_${owner}`)
        .update({ role: "receptionist" });
      const result = await confirm(owner, f.id, p.token, "visibility");
      expect(result).not.toHaveProperty("balanceDuePaise");
      expect(result).not.toHaveProperty("adjustmentPaise");
    });
    it("expires reviews and retains quarter-hour evidence when the commit clock advances", async () => {
      const f = await fixture(),
        now = Date.now(),
        clock = vi.spyOn(Date, "now").mockReturnValue(now);
      try {
        const p = await service.previewStayChange(owner, f.id, {
          action: "move",
          unitId: f.b,
        });
        clock.mockReturnValue(now + 300001);
        await expect(confirm(owner, f.id, p.token)).rejects.toMatchObject({
          code: "PREVIEW_EXPIRED",
        });
        clock.mockReturnValue(now);
        const q = await service.previewStayChange(owner, f.id, {
          action: "move",
          unitId: f.b,
        });
        clock.mockReturnValue(now + 1000);
        await confirm(owner, f.id, q.token);
        const b = (await db.collection("bookings").doc(f.id).get()).data()!;
        expect(b.assignmentSegments[0].endAt).toBe(
          new Date(now + 1000).toISOString(),
        );
      } finally {
        clock.mockRestore();
      }
    });
  },
);
