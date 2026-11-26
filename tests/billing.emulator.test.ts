import { beforeAll, afterAll, describe, expect, it } from "vitest";
const safe = /^(127\.0\.0\.1|localhost):\d+$/.test(
  process.env.FIRESTORE_EMULATOR_HOST || "",
);
describe.skipIf(!safe)(
  "immutable folio transactions on disposable hotels",
  { timeout: 30000 },
  () => {
    let db: typeof import("@/lib/firebase/admin").adminDb;
    let service: typeof import("@/lib/partner/billing/service");
    let ops: typeof import("@/lib/partner/reservations/operations");
    const prefix = `billing-${crypto.randomUUID()}`,
      hotel = `${prefix}-hotel`,
      owner = `${prefix}-owner`,
      cashier = `${prefix}-cashier`,
      outsider = `${prefix}-outsider`;
    let count = 0;
    beforeAll(async () => {
      process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-pms";
      process.env.BACKGROUND_MODE = "legacy";
      delete process.env.REDIS_URL;
      db = (await import("@/lib/firebase/admin")).adminDb;
      service = await import("@/lib/partner/billing/service");
      ops = await import("@/lib/partner/reservations/operations");
      for (const [uid, role] of [
        [owner, "owner"],
        [cashier, "cashier"],
        [outsider, "owner"],
      ]) {
        await db
          .collection("users")
          .doc(uid)
          .set({ roles: ["partner"], isActive: true, accountStatus: "active" });
        await db
          .collection("propertyMemberships")
          .doc(`${uid === outsider ? `${hotel}-other` : hotel}_${uid}`)
          .set({
            propertyId: uid === outsider ? `${hotel}-other` : hotel,
            status: "active",
            role,
          });
      }
      await db.collection("properties").doc(hotel).set({
        ownerId: owner,
        status: "active",
        approvalStatus: "approved",
        isBookable: true,
        timezone: "Asia/Kolkata",
      });
      const { commandShift } = await import("@/lib/partner/closing/shifts");
      await commandShift(owner, hotel, { action: "open", openingPaise: 0 }, "billing-fixture-owner");
    });
    afterAll(async () => {
      for (const collection of [
        "bookings",
        "propertyPayments",
        "paymentAttempts",
        "refunds",
        "propertyMemberships",
        "cashierShifts",
        "cashierActiveShifts",
        "cashierShiftRequests",
      ]) {
        const docs = await db
          .collection(collection)
          .where("propertyId", "==", hotel)
          .get();
        for (const d of docs.docs) await db.recursiveDelete(d.ref);
      }
      await db
        .collection("propertyMemberships")
        .doc(`${hotel}-other_${outsider}`)
        .delete();
      for (const id of [owner, cashier, outsider])
        await db.collection("users").doc(id).delete();
      await db.recursiveDelete(db.collection("properties").doc(hotel));
      await db.collection("hotelClosingState").doc(hotel).delete();
      await db.terminate();
    });
    async function booking(extra = {}) {
      const id = `${prefix}-${count++}`;
      await db
        .collection("bookings")
        .doc(id)
        .set({
          propertyId: hotel,
          bookingStatus: "confirmed",
          totalPaise: 10000,
          paidPaise: 0,
          ...extra,
        });
      return id;
    }
    const charge = (expectedRevision = 0) => ({
      action: "post",
      expectedRevision,
      category: "laundry",
      description: "Laundry final agreed",
      amountPaise: 2000,
      details: { explanation: "Two garments cleaned" },
    });
    it("posts once on exact retries, rejects stale concurrent posts and keeps original booking prices", async () => {
      const id = await booking();
      const result = await service.commandFolio(owner, id, charge(), "retry");
      expect(await service.commandFolio(owner, id, charge(), "retry")).toEqual(
        result,
      );
      await expect(
        service.commandFolio(
          owner,
          id,
          { ...charge(), amountPaise: 3000 },
          "retry",
        ),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      const results = await Promise.allSettled([
        service.commandFolio(owner, id, charge(1), "a"),
        service.commandFolio(owner, id, charge(1), "b"),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const b = (await db.collection("bookings").doc(id).get()).data()!;
      expect(b.totalPaise).toBe(10000);
      expect(b.billingNetPaise).toBe(4000);
      expect(b.billingRevision).toBe(2);
      expect((await service.readFolio(owner, id)).warnings).toEqual([]);
    });
    it("corrects atomically, prevents duplicate voids and requires all entries neutralized", async () => {
      const id = await booking();
      const original = await service.commandFolio(
        owner,
        id,
        charge(),
        "charge",
      );
      const corrected = await service.commandFolio(
        owner,
        id,
        {
          ...charge(1),
          action: "correct",
          originalEntryId: original.id,
          reason: "Amount corrected",
          amountPaise: 1000,
        },
        "correct",
      );
      const folio = await service.readFolio(owner, id);
      expect(folio.entries).toHaveLength(3);
      expect(folio.reservation.billingNetPaise).toBe(1000);
      await expect(
        service.commandFolio(
          owner,
          id,
          {
            action: "void",
            expectedRevision: 2,
            originalEntryId: original.id,
            reason: "Duplicate void",
          },
          "void-old",
        ),
      ).rejects.toMatchObject({ code: "ENTRY_ALREADY_NEUTRALIZED" });
      const bookings = await import("@/lib/bookings");
      await expect(
        bookings.releaseBookingHold(id, owner, "cancelled", "ADMIN_CANCELLED"),
      ).rejects.toMatchObject({ code: "BILLING_REVIEW_REQUIRED" });
      await service.commandFolio(
        owner,
        id,
        {
          action: "void",
          expectedRevision: 2,
          originalEntryId: `${corrected.id}-replacement`,
          reason: "Neutralize before cancellation",
        },
        "void",
      );
      expect(
        (await db.collection("bookings").doc(id).get()).get("billingOpenCount"),
      ).toBe(0);
    });
    it("credits create excess and reject excessive credits without moving receipts", async () => {
      const id = await booking();
      await ops.performOperation(
        owner,
        id,
        { action: "collect", amountPaise: 10000, method: "cash" },
        "cash",
      );
      await service.commandFolio(
        owner,
        id,
        { ...charge(), action: "credit", reason: "Courtesy credit" },
        "credit",
      );
      const folio = await service.readFolio(owner, id);
      expect(folio.reservation.refundableExcessPaise).toBe(2000);
      expect(folio.reservation.receivedPaise).toBe(10000);
      await expect(
        service.commandFolio(
          owner,
          id,
          {
            ...charge(1),
            action: "credit",
            amountPaise: 9000,
            reason: "Too much credit",
          },
          "excess",
        ),
      ).rejects.toMatchObject({ code: "BILLING_AMOUNT_INVALID" });
    });
    it("rechecks role and hotel isolation; cashier reads without receiving guest contacts", async () => {
      const id = await booking({
        leadGuest: {
          name: "Guest",
          email: "private@example.test",
          phone: "private",
        },
      });
      await expect(
        service.commandFolio(cashier, id, charge(), "cashier"),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.readFolio(outsider, id)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      const data = await service.readFolio(cashier, id);
      expect(JSON.stringify(data)).not.toContain("private@example.test");
      expect(data.capabilities.adjust).toBe(false);
      await db
        .collection("propertyMemberships")
        .doc(`${hotel}_${owner}`)
        .update({ status: "inactive" });
      await expect(
        service.commandFolio(owner, id, charge(), "revoked"),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await db
        .collection("propertyMemberships")
        .doc(`${hotel}_${owner}`)
        .update({ status: "active" });
    });
    it("preserves authoritative totals and recovery while blocking unresolved posting/collection", async () => {
      const id = await booking({ paidPaise: 1000 });
      expect(
        (await service.readFolio(owner, id)).warnings.length,
      ).toBeGreaterThan(0);
      await expect(
        service.commandFolio(owner, id, charge(), "charge"),
      ).rejects.toMatchObject({ code: "BILLING_RECONCILIATION_REQUIRED" });
      await expect(
        ops.performOperation(
          owner,
          id,
          { action: "collect", amountPaise: 1000, method: "cash" },
          "collect",
        ),
      ).rejects.toMatchObject({ code: "BILLING_RECONCILIATION_REQUIRED" });
    });
    it("requires the same statement model including subsequent receipts", async () => {
      const id = await booking();
      const shown = await service.readFolio(owner, id);
      expect(
        (
          await service.readFolio(
            owner,
            id,
            undefined,
            shown.revision,
            shown.statementVersion,
          )
        ).revision,
      ).toBe(0);
      await ops.performOperation(
        owner,
        id,
        { action: "collect", amountPaise: 1000, method: "cash" },
        "collect",
      );
      await expect(
        service.readFolio(
          owner,
          id,
          undefined,
          shown.revision,
          shown.statementVersion,
        ),
      ).rejects.toMatchObject({ code: "BILLING_CHANGED" });
      await expect(
        service.commandFolio(
          owner,
          id,
          { ...charge(), expectedStatementVersion: shown.statementVersion },
          "stale-source-post",
        ),
      ).rejects.toMatchObject({ code: "BILLING_CHANGED" });
    });
    it("collects new charges using existing hotel receipts and preserves receipt refund caps", async () => {
      const id = await booking();
      await service.commandFolio(owner, id, charge(), "charge");
      const collected = await ops.performOperation(
        owner,
        id,
        { action: "collect", amountPaise: 12000, method: "cash" },
        "collect",
      );
      await expect(
        ops.performOperation(
          owner,
          id,
          {
            action: "refund",
            receiptId: collected.id,
            amountPaise: 12001,
            reason: "Too much",
            reference: "returned",
          },
          "over-refund",
        ),
      ).rejects.toMatchObject({ code: "REFUND_EXCEEDS_RECEIPT" });
      await ops.performOperation(
        owner,
        id,
        {
          action: "refund",
          receiptId: collected.id,
          amountPaise: 1000,
          reason: "Agreed refund",
          reference: "cash returned",
        },
        "refund",
      );
      await expect(
        ops.performOperation(
          owner,
          id,
          {
            action: "reverse",
            receiptId: collected.id,
            reason: "Cannot reverse used receipt",
          },
          "reverse",
        ),
      ).rejects.toMatchObject({ code: "REVERSAL_NOT_ALLOWED" });
      const folio = await service.readFolio(owner, id);
      expect(folio.reservation.completedRefundPaise).toBe(1000);
      expect(folio.warnings).toEqual([]);
    });
    it("keeps pending online refunds reserved and blocks collection independently of hotel adjustments", async () => {
      const id = await booking({ paidPaise: 10000 });
      const paymentId = `${id}-capture`;
      await db.collection("paymentAttempts").doc(paymentId).set({
        propertyId: hotel,
        bookingId: id,
        status: "captured",
        amountPaise: 10000,
      });
      await service.commandFolio(
        owner,
        id,
        { ...charge(), action: "credit", reason: "Agreed credit" },
        "credit",
      );
      await ops.performOperation(
        owner,
        id,
        {
          action: "refund",
          receiptId: paymentId,
          amountPaise: 2000,
          reason: "Return excess",
        },
        "reserve-refund",
      );
      await service.commandFolio(owner, id, charge(1), "new-charge");
      const folio = await service.readFolio(owner, id);
      expect(folio.reservation.pendingRefundPaise).toBe(2000);
      expect(folio.reservation.completedRefundPaise).toBe(0);
      expect(folio.reservation.balanceDuePaise).toBe(2000);
      expect(folio.warnings).toEqual([]);
      await expect(
        ops.performOperation(
          owner,
          id,
          { action: "collect", amountPaise: 1000, method: "cash" },
          "incompatible",
        ),
      ).rejects.toMatchObject({ code: "COLLECTION_NOT_ALLOWED" });
    });
    it("serializes collection and credit against the current booking aggregate", async () => {
      const id = await booking();
      const results = await Promise.allSettled([
        ops.performOperation(
          owner,
          id,
          { action: "collect", amountPaise: 10000, method: "cash" },
          "collection-race",
        ),
        service.commandFolio(
          owner,
          id,
          { ...charge(), action: "credit", reason: "Concurrent credit" },
          "credit-race",
        ),
      ]);
      expect(results.some((r) => r.status === "fulfilled")).toBe(true);
      const folio = await service.readFolio(owner, id);
      expect(folio.reservation.effectiveTotalPaise).toBe(8000);
      expect([0, 10000]).toContain(folio.reservation.receivedPaise);
      expect(folio.warnings).toEqual([]);
    });
    it("applies posted hotel charges to authoritative checkout policy and both cancellation paths", async () => {
      const id = await booking({
        bookingStatus: "checked_in",
        guestId: owner,
        startAt: new Date(Date.now() - 3600000).toISOString(),
        endAt: new Date(Date.now() + 3600000).toISOString(),
        roomType: { id: "room" },
        timezone: "Asia/Kolkata",
      });
      const bookings = await import("@/lib/bookings");
      await db
        .collection("properties")
        .doc(hotel)
        .update({ "pms.operationalPolicies": { requireSettledBalance: true } });
      await ops.performOperation(
        owner,
        id,
        { action: "collect", amountPaise: 10000, method: "cash" },
        "base",
      );
      await service.commandFolio(owner, id, charge(), "charge");
      await expect(
        bookings.transitionBooking(id, owner, "checked_out"),
      ).rejects.toMatchObject({ code: "RESERVATION_BALANCE_DUE" });
      await expect(
        bookings.releaseBookingHold(
          id,
          owner,
          "cancelled",
          "CUSTOMER_CANCELLED",
        ),
      ).rejects.toMatchObject({ code: "BILLING_REVIEW_REQUIRED" });
      await expect(
        bookings.releaseBookingHold(id, owner, "no_show", "PARTNER_CANCELLED"),
      ).rejects.toMatchObject({ code: "BILLING_REVIEW_REQUIRED" });
      await ops.performOperation(
        owner,
        id,
        { action: "collect", amountPaise: 2000, method: "cash" },
        "extra",
      );
      await bookings.transitionBooking(id, owner, "checked_out");
      expect(
        (await db.collection("bookings").doc(id).get()).get("bookingStatus"),
      ).toBe("checked_out");
      await db
        .collection("properties")
        .doc(hotel)
        .update({ "pms.operationalPolicies": {} });
    });
  },
);
