import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const safe =
  /^(127\.0\.0\.1|localhost):\d+$/.test(
    process.env.FIRESTORE_EMULATOR_HOST || "",
  ) &&
  /^(127\.0\.0\.1|localhost):\d+$/.test(
    process.env.FIREBASE_AUTH_EMULATOR_HOST || "",
  );
describe.skipIf(!safe)(
  "PMS Phase 2B atomic creation",
  { timeout: 30000 },
  () => {
    let db: typeof import("@/lib/firebase/admin").adminDb;
    let auth: typeof import("@/lib/firebase/admin").adminAuth;
    let setup: typeof import("@/lib/partner/pms/setup");
    let bookings: typeof import("@/lib/bookings");
    const ids: string[] = [],
      userIds: string[] = [];
    beforeAll(async () => {
      process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-pms";
      delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
      delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
      delete process.env.REDIS_URL;
      const firebase = await import("@/lib/firebase/admin");
      db = firebase.adminDb;
      auth = firebase.adminAuth;
      setup = await import("@/lib/partner/pms/setup");
      bookings = await import("@/lib/bookings");
    });
    afterAll(async () => {
      for (const id of ids) {
        for (const name of [
          "cashierShifts",
          "cashierActiveShifts",
          "cashierShiftRequests",
          "roomTypes",
          "ratePlans",
          "cancellationPolicies",
          "physicalUnits",
          "propertyMemberships",
          "propertyInvitations",
          "bookings",
          "inventoryCalendars",
          "inventoryHolds",
          "inventoryBlocks",
          "bookingReferences",
          "bookingNotificationOutbox",
          "propertyPayments",
          "physicalUnitCalendars",
        ]) {
          const docs = await db
            .collection(name)
            .where("propertyId", "==", id)
            .get();
          for (let offset = 0; offset < docs.size; offset += 50)
            await Promise.all(
              docs.docs
                .slice(offset, offset + 50)
                .map((doc) => db.recursiveDelete(doc.ref)),
            );
        }
        await db.collection("hotelClosingState").doc(id).delete();
        await db.recursiveDelete(db.collection("properties").doc(id));
      }
      for (const uid of userIds) {
        const notices = await db
          .collection("notifications")
          .where("userId", "==", uid)
          .get();
        await Promise.all(notices.docs.map((d) => d.ref.delete()));
        await db.collection("users").doc(uid).delete();
        await auth.deleteUser(uid).catch(() => undefined);
      }
    }, 30000);
    async function user(role = "customer", verified = true) {
      const uid = `pms-user-${crypto.randomUUID()}`,
        email = `${uid}@example.test`;
      userIds.push(uid);
      await auth.createUser({
        uid,
        email,
        emailVerified: verified,
        displayName: "Test employee",
      });
      await db
        .collection("users")
        .doc(uid)
        .set({
          uid,
          fullName: "Test employee",
          email,
          emailVerified: verified,
          roles: [role],
          accountStatus: "active",
          isActive: true,
        });
      return { uid, email };
    }
    async function hotel(owner: string) {
      const id = `pms-hotel-${crypto.randomUUID()}`;
      ids.push(id);
      await db
        .collection("properties")
        .doc(id)
        .set({
          ownerId: owner,
          partnerId: owner,
          name: "Isolated PMS Hotel",
          slug: id,
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
          currency: "INR",
        });
      await db
        .collection("propertyMemberships")
        .doc(`${id}_${owner}`)
        .set({
          propertyId: id,
          userId: owner,
          role: "owner",
          status: "active",
          permissions: ["*"],
        });
      await db.collection("roomTypes").doc(`${id}-room`).set({
        propertyId: id,
        name: "Test room",
        status: "active",
        totalInventory: 1,
        maxAdults: 2,
        maxChildren: 0,
        maxOccupancy: 2,
      });
      await db
        .collection("ratePlans")
        .doc(`${id}-rate`)
        .set({
          propertyId: id,
          roomTypeId: `${id}-room`,
          name: "Test rate",
          status: "active",
          bookingMode: "overnight",
          pricingModel: "nightly",
          basePricePaise: 100000,
          paymentMode: "pay_at_property",
          cancellationPolicyId: `${id}-policy`,
        });
      await db
        .collection("cancellationPolicies")
        .doc(`${id}-policy`)
        .set({ propertyId: id, name: "Test policy", status: "active" });
      await db
        .collection("physicalUnits")
        .doc(`${id}-unit`)
        .set({
          propertyId: id,
          roomTypeId: `${id}-room`,
          label: "101",
          status: "active",
        });
      return id;
    }
    async function ready(owner: string, id: string) {
      await setup.updatePms(owner, id, { action: "activate" });
      return setup.updatePms(owner, id, {
        action: "declaration",
        openingData: "none",
        teamReviewed: true,
      });
    }

    function request(id: string, extra: Record<string, unknown> = {}) {
      return {
        propertyId: id,
        roomTypeId: `${id}-room`,
        ratePlanId: `${id}-rate`,
        checkIn: "2027-02-14",
        checkOut: "2027-02-15",
        adults: 1,
        guestName: "Actual Guest",
        reservationPurpose: "reservation",
        ...extra,
      };
    }
    it("links an initial cash advance atomically and recovers creation after its shift closes", async () => {
      vi.stubEnv("PARTNER_CASHIER_SHIFTS", "true");
      try {
        const owner = await user("partner"),
          id = await hotel(owner.uid);
        await ready(owner.uid, id);
        const shifts = await import("@/lib/partner/closing/shifts");
        const raw = request(id, {
          initialCollectionPaise: 12345,
          collectionMethod: "cash",
        });
        await expect(
          bookings.createManualReservation(owner.uid, raw, crypto.randomUUID()),
        ).rejects.toMatchObject({ code: "OPEN_SHIFT_REQUIRED" });
        const shift = await shifts.commandShift(
          owner.uid,
          id,
          { action: "open", openingPaise: 500 },
          crypto.randomUUID(),
        );
        const key = crypto.randomUUID();
        const reservation = await bookings.createManualReservation(
          owner.uid,
          raw,
          key,
        );
        const receipt = await db
          .collection("propertyPayments")
          .doc(`${reservation.id}_initial`)
          .get();
        expect(receipt.data()).toMatchObject({
          shiftId: shift.id,
          cashEffectPaise: 12345,
          amountPaise: 12345,
        });
        const review = await shifts.readShifts(owner.uid, id, shift.id);
        expect(review.review!.expectedPaise).toBe(12845);
        await shifts.commandShift(
          owner.uid,
          id,
          {
            action: "close",
            shiftId: shift.id,
            revision: review.shift!.revision,
            countedPaise: 12845,
            reason: "",
          },
          crypto.randomUUID(),
        );
        expect(
          (await bookings.createManualReservation(owner.uid, raw, key)).id,
        ).toBe(reservation.id);
      } finally {
        vi.unstubAllEnvs();
      }
    });
    it("creates no-payment, partial and full reservations in the existing ledger and replays exactly", async () => {
      const owner = await user("partner");
      for (const amount of [0, 50050, 100000]) {
        const id = await hotel(owner.uid);
        await ready(owner.uid, id);
        const raw = request(id, {
            initialCollectionPaise: amount,
            physicalUnitId: `${id}-unit`,
            collectionMethod: "upi",
            collectionReference: amount ? "UPI-REAL-REF" : "",
          }),
          key = crypto.randomUUID();
        const [a, b] = await Promise.all([
          bookings.createManualReservation(owner.uid, raw, key),
          bookings.createManualReservation(owner.uid, raw, key),
        ]);
        expect(a.id).toBe(b.id);
        const saved = (await db.collection("bookings").doc(a.id).get()).data()!;
        expect(saved).toMatchObject({
          paidPaise: amount,
          propertyLedgerPaise: amount,
          balanceDuePaise: 100000 - amount,
          physicalUnitId: `${id}-unit`,
          bookingStatus: "confirmed",
          paymentStatus:
            amount === 0
              ? "pay_at_property"
              : amount === 100000
                ? "paid_at_property"
                : "partially_paid",
        });
        expect(saved.actualCheckInAt).toBeUndefined();
        expect(saved.guestId).toBeNull();
        const payments = await db
          .collection("propertyPayments")
          .where("bookingId", "==", a.id)
          .get();
        expect(payments.size).toBe(amount ? 1 : 0);
        if (amount)
          expect(payments.docs[0].data()).toMatchObject({
            amountPaise: amount,
            actorId: owner.uid,
            method: "upi",
            reference: "UPI-REAL-REF",
          });
        expect(
          (
            await db
              .collection("inventoryHolds")
              .where("propertyId", "==", id)
              .get()
          ).size,
        ).toBe(1);
        expect(
          (
            await db
              .collection("physicalUnitCalendars")
              .where("propertyId", "==", id)
              .get()
          ).size,
        ).toBeGreaterThan(0);
        const { bookingOperations } = await import(
          "@/lib/partner/reservations/operations"
        );
        expect(
          (await bookingOperations(owner.uid, a.id)).assignedUnitLabel,
        ).toBe("101");
      }
    });
    it("rejects bad collections and unauthorized money/assignment without any side effects", async () => {
      const owner = await user("partner"),
        receptionist = await user("partner"),
        id = await hotel(owner.uid);
      await ready(owner.uid, id);
      await db
        .collection("propertyMemberships")
        .doc(`${id}_${receptionist.uid}`)
        .set({
          userId: receptionist.uid,
          propertyId: id,
          role: "receptionist",
          status: "active",
        });
      for (const extra of [
        { initialCollectionPaise: -1 },
        { initialCollectionPaise: 100001 },
        { initialCollectionPaise: 100, collectionMethod: "upi" },
        { initialCollectionPaise: 100, collectionMethod: "card_terminal" },
      ])
        await expect(
          bookings.createManualReservation(
            owner.uid,
            request(id, extra),
            crypto.randomUUID(),
          ),
        ).rejects.toBeTruthy();
      await expect(
        bookings.createManualReservation(
          receptionist.uid,
          request(id, { initialCollectionPaise: 1 }),
          crypto.randomUUID(),
        ),
      ).rejects.toMatchObject({ status: 403 });
      await db
        .collection("propertyMemberships")
        .doc(`${id}_${receptionist.uid}`)
        .update({ role: "housekeeper" });
      await expect(
        bookings.createManualReservation(
          receptionist.uid,
          request(id, { physicalUnitId: `${id}-unit` }),
          crypto.randomUUID(),
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(
        (await db.collection("bookings").where("propertyId", "==", id).get())
          .size,
      ).toBe(0);
      expect(
        (
          await db
            .collection("propertyPayments")
            .where("propertyId", "==", id)
            .get()
        ).size,
      ).toBe(0);
    });
    it("allows only one of two competing assignments and rolls the losing advance back", async () => {
      const owner = await user("partner"),
        id = await hotel(owner.uid);
      await ready(owner.uid, id);
      const manager = await user("partner");
      await db
        .collection("propertyMemberships")
        .doc(`${id}_${manager.uid}`)
        .set({
          propertyId: id,
          userId: manager.uid,
          role: "manager",
          status: "active",
        });
      await db
        .collection("roomTypes")
        .doc(`${id}-room`)
        .update({ totalInventory: 2 });
      await db
        .collection("physicalUnits")
        .doc(`${id}-unit2`)
        .set({
          propertyId: id,
          roomTypeId: `${id}-room`,
          label: "102",
          status: "active",
        });
      const raw = request(id, {
        physicalUnitId: `${id}-unit`,
        initialCollectionPaise: 30000,
      });
      const outcomes = await Promise.allSettled([
        bookings.createManualReservation(owner.uid, raw, crypto.randomUUID()),
        bookings.createManualReservation(manager.uid, raw, crypto.randomUUID()),
      ]);
      expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const failure = outcomes.find(
        (r) => r.status === "rejected",
      ) as PromiseRejectedResult;
      expect(failure.reason.message).toMatch(
        /ROOM_ALREADY_ASSIGNED|SOLD_OUT_FOR_DATES/,
      );
      expect(
        (await db.collection("bookings").where("propertyId", "==", id).get())
          .size,
      ).toBe(1);
      expect(
        (
          await db
            .collection("propertyPayments")
            .where("propertyId", "==", id)
            .get()
        ).size,
      ).toBe(1);
    });
    it("rechecks maintenance and cross-hotel/wrong-type/inactive units while retaining all-or-nothing behavior", async () => {
      const owner = await user("partner"),
        id = await hotel(owner.uid),
        other = await hotel(owner.uid);
      await ready(owner.uid, id);
      await ready(owner.uid, other);
      const quote = await bookings.quoteManualReservation(
        owner.uid,
        request(id),
      );
      expect(
        quote.roomOptions.rooms.find((r) => r.id === `${id}-unit`)?.available,
      ).toBe(true);
      await db
        .collection("inventoryBlocks")
        .doc(`${id}-maintenance`)
        .set({
          propertyId: id,
          unitId: `${id}-unit`,
          status: "active",
          startAt: quote.startAt,
          endAt: quote.inventoryEndAt,
        });
      await expect(
        bookings.createManualReservation(
          owner.uid,
          request(id, {
            physicalUnitId: `${id}-unit`,
            initialCollectionPaise: 10000,
          }),
          crypto.randomUUID(),
        ),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        bookings.createManualReservation(
          owner.uid,
          request(id, { physicalUnitId: `${other}-unit` }),
          crypto.randomUUID(),
        ),
      ).rejects.toThrow("ROOM_NOT_AVAILABLE");
      await db
        .collection("physicalUnits")
        .doc(`${id}-unit`)
        .update({ status: "inactive" });
      await db
        .collection("physicalUnits")
        .doc(`${id}-replacement`)
        .set({
          propertyId: id,
          roomTypeId: `${id}-room`,
          status: "active",
          label: "103",
        });
      await db.collection("inventoryBlocks").doc(`${id}-maintenance`).delete();
      await expect(
        bookings.createManualReservation(
          owner.uid,
          request(id, { physicalUnitId: `${id}-unit` }),
          crypto.randomUUID(),
        ),
      ).rejects.toThrow("ROOM_NOT_AVAILABLE");
      expect(
        (
          await db
            .collection("inventoryHolds")
            .where("propertyId", "==", id)
            .get()
        ).size,
      ).toBe(0);
      expect(
        (
          await db
            .collection("propertyPayments")
            .where("propertyId", "==", id)
            .get()
        ).size,
      ).toBe(0);
    });
    it("flags dirty and overdue-occupied rooms correctly without inventing a cleaning override policy", async () => {
      const clock = vi
        .spyOn(Date, "now")
        .mockReturnValue(Date.parse("2027-02-14T14:30:00Z"));
      try {
        const owner = await user("partner"),
          id = await hotel(owner.uid);
        await ready(owner.uid, id);
        await db
          .collection("physicalUnits")
          .doc(`${id}-unit`)
          .update({ housekeepingStatus: "dirty" });
        const raw = request(id, {
          reservationPurpose: "walk_in",
          recordedArrivalTime: "20:00",
        });
        const q = await bookings.quoteManualReservation(owner.uid, raw);
        expect(q.roomOptions.rooms[0]).toMatchObject({
          available: true,
          readyNow: false,
          housekeeping: "dirty",
        });
        await db
          .collection("bookings")
          .doc(`${id}-overdue`)
          .set({
            propertyId: id,
            physicalUnitId: `${id}-unit`,
            bookingStatus: "checked_in",
            endAt: "2027-02-13T05:30:00Z",
          });
        expect(
          (await bookings.quoteManualReservation(owner.uid, raw)).roomOptions
            .rooms[0],
        ).toMatchObject({ available: false, occupiedNow: true });
        await expect(
          bookings.createManualReservation(
            owner.uid,
            {
              ...raw,
              physicalUnitId: `${id}-unit`,
              initialCollectionPaise: 10000,
            },
            crypto.randomUUID(),
          ),
        ).rejects.toMatchObject({ status: 409 });
        await db.collection("bookings").doc(`${id}-overdue`).delete();
        const saved = await bookings.createManualReservation(
          owner.uid,
          { ...raw, physicalUnitId: `${id}-unit` },
          crypto.randomUUID(),
        );
        expect(
          (await db.collection("bookings").doc(saved.id).get()).get(
            "bookingStatus",
          ),
        ).toBe("confirmed");
      } finally {
        clock.mockRestore();
      }
    });
    it("reserves an hourly stay across midnight with an advance and releases its exact physical allocation", async () => {
      const clock = vi
        .spyOn(Date, "now")
        .mockReturnValue(Date.parse("2027-02-14T17:37:00Z"));
      try {
        const owner = await user("partner"),
          id = await hotel(owner.uid);
        await db
          .collection("properties")
          .doc(id)
          .update({ bookingModes: ["overnight", "hourly"] });
        await db
          .collection("ratePlans")
          .doc(`${id}-hourly`)
          .set({
            propertyId: id,
            roomTypeId: `${id}-room`,
            name: "Two hours",
            status: "active",
            bookingMode: "hourly",
            pricingModel: "duration",
            basePricePaise: 30000,
            durationPrices: [{ hours: 2, pricePaise: 30000 }],
            allowMidnightCrossing: true,
            cancellationPolicyId: `${id}-policy`,
          });
        await ready(owner.uid, id);
        const raw = request(id, {
          bookingMode: "hourly",
          ratePlanId: `${id}-hourly`,
          durationMinutes: 120,
          arrivalTime: "23:07",
          reservationPurpose: "walk_in",
          recordedArrivalTime: "23:07",
          initialCollectionPaise: 10000,
          physicalUnitId: `${id}-unit`,
        });
        const saved = await bookings.createManualReservation(
          owner.uid,
          raw,
          crypto.randomUUID(),
        );
        const b = (await db.collection("bookings").doc(saved.id).get()).data()!;
        expect(b.checkOut).toBe("2027-02-15");
        expect(b.departureTime).toBe("01:07");
        expect(b.physicalAllocations).toHaveLength(2);
        expect(b.balanceDuePaise).toBe(20000);
        await bookings.releaseBookingHold(
          saved.id,
          owner.uid,
          "cancelled",
          "PARTNER_CANCELLED",
        );
        const calendars = await db
          .collection("physicalUnitCalendars")
          .where("propertyId", "==", id)
          .get();
        expect(
          calendars.docs.every(
            (d) => !Object.values(d.get("slots") || {}).includes(saved.id),
          ),
        ).toBe(true);
        expect(
          (
            await db
              .collection("propertyPayments")
              .doc(`${saved.id}_initial`)
              .get()
          ).get("amountPaise"),
        ).toBe(10000);
      } finally {
        clock.mockRestore();
      }
    });
    it("reverses an unused initial advance through the existing immutable ledger", async () => {
      const owner = await user("partner"),
        id = await hotel(owner.uid);
      await ready(owner.uid, id);
      const saved = await bookings.createManualReservation(
        owner.uid,
        request(id, { initialCollectionPaise: 50050 }),
        crypto.randomUUID(),
      );
      const { performOperation } = await import(
        "@/lib/partner/reservations/operations"
      );
      const key = crypto.randomUUID(),
        input = {
          action: "reverse",
          receiptId: `${saved.id}_initial`,
          reason: "Incorrect entry correction",
        };
      await performOperation(owner.uid, saved.id, input, key);
      await performOperation(owner.uid, saved.id, input, key);
      expect(
        (await db.collection("bookings").doc(saved.id).get()).data(),
      ).toMatchObject({
        paidPaise: 0,
        propertyLedgerPaise: 0,
        balanceDuePaise: 100000,
        paymentStatus: "pay_at_property",
      });
      expect(
        (
          await db
            .collection("propertyPayments")
            .where("bookingId", "==", saved.id)
            .get()
        ).size,
      ).toBe(2);
    });
    it("paginates physical choices and rejects cursors from another hotel, account or stay", async () => {
      const owner = await user("partner"),
        manager = await user("partner"),
        id = await hotel(owner.uid),
        other = await hotel(owner.uid);
      const batch = db.batch();
      for (let i = 0; i < 52; i++)
        batch.set(db.collection("physicalUnits").doc(`${id}-extra-${i}`), {
          propertyId: id,
          roomTypeId: `${id}-room`,
          status: "active",
          label: String(200 + i),
          housekeepingStatus: "clean",
        });
      await batch.commit();
      await db
        .collection("roomTypes")
        .doc(`${id}-room`)
        .update({ totalInventory: 53 });
      await ready(owner.uid, id);
      await ready(owner.uid, other);
      await db
        .collection("propertyMemberships")
        .doc(`${id}_${manager.uid}`)
        .set({
          propertyId: id,
          userId: manager.uid,
          status: "active",
          role: "manager",
        });
      const first = await bookings.quoteManualReservation(
        owner.uid,
        request(id),
      );
      expect(first.roomOptions.rooms).toHaveLength(50);
      expect(first.roomOptions.nextCursor).toBeTruthy();
      const second = await bookings.quoteManualReservation(owner.uid, {
        ...request(id),
        roomCursor: first.roomOptions.nextCursor,
      });
      expect(second.roomOptions.rooms).toHaveLength(3);
      expect(
        new Set(
          [...first.roomOptions.rooms, ...second.roomOptions.rooms].map(
            (r) => r.id,
          ),
        ).size,
      ).toBe(53);
      await expect(
        bookings.quoteManualReservation(owner.uid, {
          ...request(other),
          roomCursor: first.roomOptions.nextCursor,
        }),
      ).rejects.toMatchObject({ status: 422 });
      await expect(
        bookings.quoteManualReservation(manager.uid, {
          ...request(id),
          roomCursor: first.roomOptions.nextCursor,
        }),
      ).rejects.toMatchObject({ status: 422 });
      await expect(
        bookings.quoteManualReservation(owner.uid, {
          ...request(id),
          checkOut: "2027-02-16",
          roomCursor: first.roomOptions.nextCursor,
        }),
      ).rejects.toMatchObject({ status: 422 });
    });
    it("never creates two advances when users compete for the final sellable room", async () => {
      const owner = await user("partner"),
        id = await hotel(owner.uid);
      await ready(owner.uid, id);
      const manager = await user("partner");
      await db
        .collection("propertyMemberships")
        .doc(`${id}_${manager.uid}`)
        .set({
          propertyId: id,
          userId: manager.uid,
          role: "manager",
          status: "active",
        });
      const raw = request(id, { initialCollectionPaise: 20000 });
      const outcomes = await Promise.allSettled([
        bookings.createManualReservation(owner.uid, raw, crypto.randomUUID()),
        bookings.createManualReservation(manager.uid, raw, crypto.randomUUID()),
      ]);
      expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const failure = outcomes.find(
        (r) => r.status === "rejected",
      ) as PromiseRejectedResult;
      expect(failure.reason.message).toMatch(
        /ROOM_ALREADY_ASSIGNED|SOLD_OUT_FOR_DATES/,
      );
      for (const collection of [
        "bookings",
        "inventoryHolds",
        "propertyPayments",
      ])
        expect(
          (await db.collection(collection).where("propertyId", "==", id).get())
            .size,
        ).toBe(1);
    });
  },
);
