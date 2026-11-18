import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { operationalPolicies } from "@/lib/partner/reservations/operational-policies";
const safe = /^(127\.0\.0\.1|localhost):\d+$/.test(
  process.env.FIRESTORE_EMULATOR_HOST || "",
);
describe.skipIf(!safe)(
  "operational policies on disposable emulator hotels",
  () => {
    let db: typeof import("@/lib/firebase/admin").adminDb;
    let transition: typeof import("@/lib/bookings").transitionBooking;
    let setup: typeof import("@/lib/partner/pms/setup");
    let guests: typeof import("@/lib/partner/guests/service");
    let facts: typeof import("@/lib/partner/reservations/eligibility-server").loadEligibilityFacts;
    let evaluate: typeof import("@/lib/partner/reservations/eligibility").reservationEligibility;
    const prefix = `policy-${crypto.randomUUID()}`,
      hotel = `${prefix}-hotel`,
      owner = `${prefix}-owner`,
      desk = `${prefix}-desk`,
      unit = `${prefix}-unit`;
    let counter = 0;
    beforeAll(async () => {
      process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-pms";
      process.env.BACKGROUND_MODE = "legacy";
      process.env.PUBLIC_RESPONSE_CACHE_DISABLED = "0";
      process.env.HELPKEY_ENV = prefix;
      db = (await import("@/lib/firebase/admin")).adminDb;
      transition = (await import("@/lib/bookings")).transitionBooking;
      setup = await import("@/lib/partner/pms/setup");
      guests = await import("@/lib/partner/guests/service");
      facts = (await import("@/lib/partner/reservations/eligibility-server"))
        .loadEligibilityFacts;
      evaluate = (await import("@/lib/partner/reservations/eligibility"))
        .reservationEligibility;
      for (const [id, role] of [
        [owner, "owner"],
        [desk, "receptionist"],
      ]) {
        await db
          .collection("users")
          .doc(id)
          .set({ roles: ["partner"], isActive: true, accountStatus: "active" });
        await db
          .collection("propertyMemberships")
          .doc(`${hotel}_${id}`)
          .set({ propertyId: hotel, userId: id, status: "active", role });
      }
      await db
        .collection("properties")
        .doc(hotel)
        .set({
          ownerId: owner,
          status: "active",
          approvalStatus: "approved",
          isBookable: true,
          timezone: "Asia/Kolkata",
        });
    });
    afterAll(async () => {
      for (const name of [
        "bookings",
        "physicalUnits",
        "propertyMemberships",
        "inventoryBlocks",
        "bookingNotificationOutbox",
        "propertyPayments",
      ]) {
        const rows = await db
          .collection(name)
          .where("propertyId", "==", hotel)
          .get();
        await Promise.all(rows.docs.map((d) => db.recursiveDelete(d.ref)));
      }
      for (const id of [owner, desk])
        await db.collection("users").doc(id).delete();
      await db.recursiveDelete(db.collection("properties").doc(hotel));
      const redis = (await import("@/lib/redis")).getRedis();
      if (redis) {
        let cursor = "0";
        do {
          const result = await redis.scan(
            cursor,
            "MATCH",
            `helpkey:${prefix}:*`,
            "COUNT",
            100,
          );
          cursor = result[0];
          if (result[1].length) await redis.del(...result[1]);
        } while (cursor !== "0");
        await redis.quit();
      }
    });
    async function policies(p: object = {}) {
      const current = (await setup.setupStatus(owner, hotel)).policyRevision;
      return setup.updatePms(owner, hotel, {
        action: "operationalPolicies",
        revision: current,
        policies: { ...operationalPolicies(), ...p },
      });
    }
    async function booking(extra: object = {}) {
      const id = `${prefix}-booking-${counter++}`;
      const now = Date.now();
      await db
        .collection("bookings")
        .doc(id)
        .set({
          propertyId: hotel,
          bookingStatus: "confirmed",
          startAt: new Date(now - 3600000).toISOString(),
          endAt: new Date(now + 3600000).toISOString(),
          checkIn: new Date(now).toISOString().slice(0, 10),
          checkOut: new Date(now).toISOString().slice(0, 10),
          timezone: "Asia/Kolkata",
          roomType: { id: "r" },
          adults: 1,
          children: 0,
          infants: 0,
          source: "manual_partner",
          identityVersion: 2,
          occupants: [{ name: "Guest Name", ageGroup: "adult" }],
          totalPaise: 10000,
          paidPaise: 0,
          guestId: null,
          ...extra,
        });
      return id;
    }
    it("defaults off, audits policies, protects setup and checks revision", async () => {
      expect(
        (await setup.setupStatus(owner, hotel)).operationalPolicies,
      ).toEqual(operationalPolicies());
      const saved = await policies({ requireAssignedRoom: true });
      expect(saved.policyRevision).toBe(1);
      await expect(
        setup.updatePms(owner, hotel, {
          action: "operationalPolicies",
          revision: 0,
          policies: operationalPolicies(),
        }),
      ).rejects.toMatchObject({
        code: "POLICY_REVISION_CONFLICT",
        status: 409,
      });
      await expect(
        setup.updatePms(desk, hotel, {
          action: "operationalPolicies",
          revision: 1,
          policies: operationalPolicies(),
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
      const history = await db
        .collection("properties")
        .doc(hotel)
        .collection("pmsEvents")
        .get();
      expect(history.docs[0].get("before.requireAssignedRoom")).toBe(false);
      expect(history.docs[0].get("after.requireAssignedRoom")).toBe(true);
      expect(
        (await db.collection("properties").doc(hotel).get()).get(
          "pms.operationalPolicies.updatedAt",
        ),
      ).toBeInstanceOf(Timestamp);
    });
    it("enforces immediately on existing bookings and cannot be bypassed by omitting versions", async () => {
      await policies();
      const id = await booking({ occupants: [] });
      await policies({
        requireAssignedRoom: true,
        requireCleanRoom: true,
        requireGuestRegistration: true,
      });
      await expect(transition(id, owner, "checked_in")).rejects.toMatchObject({
        status: 422,
        eligibility: {
          blockers: [
            { code: "ASSIGNED_ROOM_REQUIRED" },
            { code: "CLEAN_ROOM_REQUIRED" },
            { code: "GUEST_REGISTRATION_REQUIRED" },
          ],
        },
      });
      expect(
        (await db.collection("bookings").doc(id).get()).get("bookingStatus"),
      ).toBe("confirmed");
      await policies();
      await transition(id, owner, "checked_in");
    });
    it.each(["dirty", "unknown", "clean", "inspected"])(
      "reads current room condition %s",
      async (condition) => {
        await policies({ requireCleanRoom: true });
        await db
          .collection("physicalUnits")
          .doc(unit)
          .set({
            propertyId: hotel,
            roomTypeId: "r",
            status: "active",
            housekeepingStatus: condition,
          });
        const id = await booking({ physicalUnitId: unit });
        if (["clean", "inspected"].includes(condition)) {
          await transition(id, owner, "checked_in");
          await db
            .collection("bookings")
            .doc(id)
            .update({ bookingStatus: "checked_out" });
        } else
          await expect(
            transition(id, owner, "checked_in"),
          ).rejects.toMatchObject({ code: "CLEAN_ROOM_REQUIRED" });
      },
    );
    it.each([
      { status: "inactive" },
      { propertyId: "wrong" },
      { roomTypeId: "wrong" },
    ])("rejects invalid room ownership/type/status %j", async (patch) => {
      await policies({ requireAssignedRoom: true });
      await db
        .collection("physicalUnits")
        .doc(unit)
        .set({
          propertyId: hotel,
          roomTypeId: "r",
          status: "active",
          ...patch,
        });
      await expect(
        transition(
          await booking({ physicalUnitId: unit }),
          owner,
          "checked_in",
        ),
      ).rejects.toMatchObject({ code: "ASSIGNED_ROOM_REQUIRED" });
    });
    it("detects maintenance and current occupancy together", async () => {
      await policies({ requireAssignedRoom: true });
      await db
        .collection("physicalUnits")
        .doc(unit)
        .set({ propertyId: hotel, roomTypeId: "r", status: "active" });
      const id = await booking({ physicalUnitId: unit });
      const occupied = await booking({
        physicalUnitId: unit,
        bookingStatus: "checked_in",
      });
      const b = (await db.collection("bookings").doc(id).get()).data()!;
      await db
        .collection("inventoryBlocks")
        .doc(prefix)
        .set({
          propertyId: hotel,
          unitId: unit,
          status: "active",
          startAt: b.startAt,
          endAt: b.endAt,
        });
      await expect(transition(id, owner, "checked_in")).rejects.toMatchObject({
        eligibility: {
          blockers: [
            { code: "ROOM_OCCUPIED" },
            { code: "ROOM_MAINTENANCE_RESTRICTED" },
          ],
        },
      });
      await db
        .collection("bookings")
        .doc(occupied)
        .update({ bookingStatus: "checked_out" });
      await db.collection("inventoryBlocks").doc(prefix).delete();
    });
    it("edits customer registration without changing ownership, contacts or identity marker", async () => {
      await policies({ requireGuestRegistration: true });
      const id = await booking({
        source: "web",
        identityVersion: 1,
        guestId: "customer",
        bookingContact: { name: "Contact", email: "contact@example.test" },
        leadGuest: {
          name: "Customer",
          email: "customer@example.test",
          adultGuestNames: ["Customer"],
        },
        adults: 1,
        children: 1,
        occupants: [],
      });
      await expect(transition(id, owner, "checked_in")).rejects.toMatchObject({
        code: "GUEST_REGISTRATION_REQUIRED",
      });
      await guests.guestRegistration(owner, id, {
        revision: 0,
        occupants: [
          { name: "Staying Adult", ageGroup: "adult" },
          { name: "Child Name", ageGroup: "child" },
        ],
      });
      const b = (await db.collection("bookings").doc(id).get()).data()!;
      expect(b.guestId).toBe("customer");
      expect(b.identityVersion).toBe(1);
      expect(b.registrationVersion).toBe(1);
      expect(b.bookingContact.email).toBe("contact@example.test");
      expect(b.leadGuest.email).toBe("customer@example.test");
      expect(b.leadGuest.name).toBe("Customer");
      expect(b.occupants[0].name).toBe("Staying Adult");
      await transition(id, owner, "checked_in");
      const historical = await booking({ identityVersion: 1 });
      await expect(
        transition(historical, owner, "checked_in"),
      ).rejects.toMatchObject({
        code: "HISTORICAL_REGISTRATION_REVIEW_REQUIRED",
      });
      await expect(
        guests.guestRegistration(owner, historical, {
          revision: 0,
          occupants: [{ name: "Name", ageGroup: "adult" }],
        }),
      ).rejects.toMatchObject({
        code: "HISTORICAL_REGISTRATION_REVIEW_REQUIRED",
      });
    });
    it("rejects stale versions, enforces canonical balances, and recovers exact keys without duplicate effects", async () => {
      await policies({ requireSettledBalance: true });
      const id = await booking({
        bookingStatus: "checked_in",
        physicalUnitId: unit,
      });
      await expect(transition(id, owner, "checked_out")).rejects.toMatchObject({
        code: "RESERVATION_BALANCE_DUE",
      });
      await db.collection("bookings").doc(id).update({ paidPaise: 10000 });
      await db.collection("propertyPayments").doc(`${id}-settled`).set({ propertyId: hotel, bookingId: id, type: "collection", amountPaise: 10000, method: "cash" });
      const b = (await db.collection("bookings").doc(id).get()).data()!,
        p = (await db.collection("properties").doc(hotel).get()).data()!;
      const version = (await facts(id, b, p)).version!;
      await db.collection("bookings").doc(id).update({ refundDuePaise: 1000 });
      await expect(
        transition(id, owner, "checked_out", {
          expectedEligibilityVersion: version,
        }),
      ).rejects.toMatchObject({ code: "ELIGIBILITY_CHANGED", status: 409 });
      await db.collection("bookings").doc(id).update({ refundDuePaise: 0 });
      const options = { idempotencyKey: "checkout-recovery" };
      await Promise.all([
        transition(id, owner, "checked_out", options),
        transition(id, owner, "checked_out", options),
      ]);
      const saved = (await db.collection("bookings").doc(id).get())
        .get("actualCheckOutAt")
        .toMillis();
      const roomEvents = await db
        .collection("physicalUnits")
        .doc(unit)
        .collection("events")
        .where("bookingId", "==", id)
        .get();
      expect(roomEvents.size).toBe(1);
      await transition(id, owner, "checked_out", options);
      expect(
        (await db.collection("bookings").doc(id).get())
          .get("actualCheckOutAt")
          .toMillis(),
      ).toBe(saved);
      expect(
        (await db.collection("bookings").doc(id).collection("events").get())
          .size,
      ).toBe(1);
      await expect(
        transition(id, owner, "checked_in", options),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    });
    it("shares deterministic keys across cancellation, no-show and stay transitions", async () => {
      await policies();
      const id = await booking({ dates: [], paymentStatus: "pay_at_property" });
      const { releaseBookingHold } = await import("@/lib/bookings");
      const options = { idempotencyKey: "one-lifecycle-key" };
      await releaseBookingHold(
        id,
        owner,
        "no_show",
        "PARTNER_NO_SHOW",
        options,
      );
      const events = await db
        .collection("bookings")
        .doc(id)
        .collection("events")
        .get();
      expect(events.size).toBe(1);
      await releaseBookingHold(
        id,
        owner,
        "no_show",
        "PARTNER_NO_SHOW",
        options,
      );
      expect(
        (await db.collection("bookings").doc(id).collection("events").get())
          .size,
      ).toBe(1);
      await expect(
        releaseBookingHold(
          id,
          owner,
          "cancelled",
          "PARTNER_CANCELLED",
          options,
        ),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      await expect(
        transition(id, owner, "checked_in", options),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    });
    it("rejects old eligibility after policy, room, assignment and registration changes", async () => {
      await policies({
        requireCleanRoom: true,
        requireGuestRegistration: true,
      });
      await db
        .collection("physicalUnits")
        .doc(unit)
        .set({
          propertyId: hotel,
          roomTypeId: "r",
          status: "active",
          housekeepingStatus: "clean",
        });
      const id = await booking({ physicalUnitId: unit });
      const version = async () =>
        (
          await facts(
            id,
            (await db.collection("bookings").doc(id).get()).data()!,
            (await db.collection("properties").doc(hotel).get()).data()!,
          )
        ).version!;
      let expectedEligibilityVersion = await version();
      await db
        .collection("physicalUnits")
        .doc(unit)
        .update({ housekeepingStatus: "dirty" });
      await expect(
        transition(id, owner, "checked_in", { expectedEligibilityVersion }),
      ).rejects.toMatchObject({ code: "ELIGIBILITY_CHANGED" });
      expectedEligibilityVersion = await version();
      await db.collection("bookings").doc(id).update({ physicalUnitId: null });
      await expect(
        transition(id, owner, "checked_in", { expectedEligibilityVersion }),
      ).rejects.toMatchObject({ code: "ELIGIBILITY_CHANGED" });
      expectedEligibilityVersion = await version();
      await guests.guestRegistration(owner, id, {
        revision: 0,
        occupants: [{ name: "Updated Name", ageGroup: "adult" }],
      });
      await expect(
        transition(id, owner, "checked_in", { expectedEligibilityVersion }),
      ).rejects.toMatchObject({ code: "ELIGIBILITY_CHANGED" });
      expectedEligibilityVersion = await version();
      await policies();
      await expect(
        transition(id, owner, "checked_in", { expectedEligibilityVersion }),
      ).rejects.toMatchObject({ code: "ELIGIBILITY_CHANGED" });
    });
    it("serializes two check-ins competing for the same currently vacant room", async () => {
      await policies({ requireAssignedRoom: true });
      await db
        .collection("physicalUnits")
        .doc(unit)
        .set({
          propertyId: hotel,
          roomTypeId: "r",
          status: "active",
          housekeepingStatus: "clean",
        });
      const a = await booking({ physicalUnitId: unit }),
        b = await booking({ physicalUnitId: unit });
      const results = await Promise.allSettled([
        transition(a, owner, "checked_in"),
        transition(b, owner, "checked_in"),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({
        reason: { code: "ROOM_OCCUPIED" },
      });
      for (const id of [a, b])
        await db
          .collection("bookings")
          .doc(id)
          .update({ bookingStatus: "checked_out" });
    });
    it("keeps unauthorized errors free of booking-sensitive blockers", async () => {
      await policies({ requireSettledBalance: true });
      await expect(
        transition(
          await booking({ bookingStatus: "checked_in" }),
          "stranger",
          "checked_out",
        ),
      ).rejects.toThrow("FORBIDDEN");
      const id = await booking({ bookingStatus: "checked_in" });
      // Give this staff member an active but non-operating role, even with forged permission grants.
      await db
        .collection("propertyMemberships")
        .doc(`${hotel}_${desk}`)
        .update({ role: "cashier", permissions: ["*"] });
      await expect(transition(id, desk, "checked_out")).rejects.toMatchObject({
        code: "FORBIDDEN",
        status: 403,
        eligibility: undefined,
      });
    });
    it("refreshes cached Today after policy saves and separates caller eligibility", async () => {
      await policies();
      const id = await booking();
      const b = (await db.collection("bookings").doc(id).get()).data()!;
      const { loadToday } = await import("@/lib/partner/today/service");
      const first = await loadToday(
        owner,
        { propertyId: hotel, date: b.checkIn, queue: "arrivals" },
        true,
      );
      expect(
        "rows" in first &&
          first.rows.find((r) => r.id === id)?.actionEligibility?.checked_in
            .allowed,
      ).toBe(true);
      await policies({ requireGuestRegistration: true });
      await guests.guestRegistration(owner, id, {
        revision: 0,
        occupants: [{ name: "Saved Name", ageGroup: "adult" }],
      });
      const next = await loadToday(
        owner,
        { propertyId: hotel, date: b.checkIn, queue: "arrivals" },
        true,
      );
      expect(
        "rows" in next &&
          next.rows.find((r) => r.id === id)?.actionEligibility?.checked_in
            .allowed,
      ).toBe(true);
      await db
        .collection("propertyMemberships")
        .doc(`${hotel}_${desk}`)
        .update({ role: "receptionist" });
      // Staff cannot operate before activation, independently of cached owner data.
      await expect(
        loadToday(desk, { propertyId: hotel, date: b.checkIn }, true),
      ).rejects.toMatchObject({ code: "PMS_SETUP_REQUIRED" });
      const record = (await db.collection("bookings").doc(id).get()).data()!;
      const property = (
        await db.collection("properties").doc(hotel).get()
      ).data()!;
      expect(
        evaluate(
          record,
          [],
          { allocation: true, payments: true, amendments: true },
          Date.now(),
          await facts(id, record, property),
        ).checked_in.blockers[0].category,
      ).toBe("permission");
    });
    it("shares collection and amendment restrictions with authoritative commands", async () => {
      await policies();
      const id = await booking({
        bookingStatus: "checked_in",
        paidPaise: 1000,
        refundDuePaise: 100,
      });
      const b = (await db.collection("bookings").doc(id).get()).data()!;
      const p = (await db.collection("properties").doc(hotel).get()).data()!;
      const { rolePermissions } = await import("@/lib/partner/pms/domain");
      const eligibility = evaluate(
        b,
        rolePermissions.owner,
        { allocation: true, payments: true, amendments: true },
        Date.now(),
        await facts(id, b, p),
      );
      expect(eligibility.collect.allowed).toBe(false);
      expect(eligibility.amend.allowed).toBe(false);
      const { performOperation } =
        await import("@/lib/partner/reservations/operations");
      await expect(
        performOperation(
          owner,
          id,
          { action: "collect", amountPaise: 100, method: "cash" },
          crypto.randomUUID(),
        ),
      ).rejects.toMatchObject({
        code: eligibility.collect.blockers[0].code,
        message: eligibility.collect.reason,
      });
      const { previewAmendment } =
        await import("@/lib/partner/reservations/amendments");
      await expect(
        previewAmendment(owner, id, {
          roomTypeId: "r",
          ratePlanId: "rate",
          checkIn: "2026-11-15",
          checkOut: "2026-11-16",
        }),
      ).rejects.toMatchObject({
        code: eligibility.amend.blockers[0].code,
        message: eligibility.amend.reason,
      });
    });
    it("uses identical page and transaction facts without trusting the page on writes", async () => {
      await policies({ requireCleanRoom: true });
      const newUnit = `${prefix}-page-unit`;
      await db
        .collection("physicalUnits")
        .doc(newUnit)
        .set({
          propertyId: hotel,
          roomTypeId: "r",
          status: "active",
          housekeepingStatus: "clean",
        });
      const id = await booking({ physicalUnitId: newUnit });
      const b = (await db.collection("bookings").doc(id).get()).data()!;
      const p = (await db.collection("properties").doc(hotel).get()).data()!;
      const { loadPageEligibilityFacts } =
        await import("@/lib/partner/reservations/eligibility-server");
      const page = (
        await loadPageEligibilityFacts(hotel, [{ id, data: b }], p)
      ).get(id)!;
      const authoritative = await db.runTransaction(async (tx) =>
        facts(
          id,
          (await tx.get(db.collection("bookings").doc(id))).data()!,
          (await tx.get(db.collection("properties").doc(hotel))).data()!,
          tx,
        ),
      );
      expect(page).toEqual(authoritative);
      await db
        .collection("physicalUnits")
        .doc(newUnit)
        .update({ housekeepingStatus: "dirty" });
      await expect(
        transition(id, owner, "checked_in", {
          expectedEligibilityVersion: page.version,
        }),
      ).rejects.toMatchObject({ code: "ELIGIBILITY_CHANGED" });
      await expect(transition(id, owner, "checked_in")).rejects.toMatchObject({
        code: "CLEAN_ROOM_REQUIRED",
      });
      expect(
        (await db.collection("bookings").doc(id).get()).get("bookingStatus"),
      ).toBe("confirmed");
    });
  },
);
