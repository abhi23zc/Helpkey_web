import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Agreement } from "@/lib/booking-finance/domain";
import type { Deductions } from "@/lib/payouts/domain";

const providerFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/providers/http", () => ({ providerFetch }));
const local = /^(127\.0\.0\.1|localhost):\d+$/.test(
  process.env.FIRESTORE_EMULATOR_HOST ?? "",
);

describe.skipIf(!local)(
  "complete booking-to-settlement flow",
  { timeout: 60000 },
  () => {
    let db: typeof import("@/lib/firebase/admin").adminDb;
    let bookings: typeof import("@/lib/bookings");
    let accounting: typeof import("@/lib/accounting/service");
    let posting: typeof import("@/lib/accounting/posting");
    let payouts: typeof import("@/lib/payouts/service");
    let dues: typeof import("@/lib/dues/service");
    let operations: typeof import("@/lib/partner/reservations/operations");
    const prefix = `finance-flow-${crypto.randomUUID()}`,
      admin = `${prefix}-admin`,
      owner = `${prefix}-owner`,
      guest = `${prefix}-guest`;
    const hotels: string[] = [],
      ids: string[] = [];
    const deductions: Deductions = {
      commissionTax: {
        status: "not_applicable",
        reason: "Disposable test only; no production tax determination",
      },
      statutory: { status: "not_applicable", reason: "Disposable test only" },
      gatewayFees: {
        status: "amount",
        amountPaise: 0,
        reason: "Explicit zero in test",
      },
      other: {
        status: "amount",
        amountPaise: 0,
        reason: "Explicit zero in test",
      },
    };
    beforeAll(async () => {
      process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-finance-flow";
      delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
      delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
      delete process.env.REDIS_URL;
      process.env.BACKGROUND_MODE = "legacy";
      process.env.HOTEL_ACCOUNTING_START_AT = "2026-01-01T00:00:00Z";
      process.env.RAZORPAY_KEY_ID = "test_key";
      process.env.RAZORPAY_KEY_SECRET = "test_secret";
      db = (await import("@/lib/firebase/admin")).adminDb;
      bookings = await import("@/lib/bookings");
      accounting = await import("@/lib/accounting/service");
      posting = await import("@/lib/accounting/posting");
      payouts = await import("@/lib/payouts/service");
      dues = await import("@/lib/dues/service");
      operations = await import("@/lib/partner/reservations/operations");
      for (const uid of [admin, owner, guest])
        await db
          .collection("users")
          .doc(uid)
          .set({
            roles: [
              uid === admin ? "admin" : uid === owner ? "partner" : "customer",
            ],
            accountStatus: "active",
            isActive: true,
          });
    });
    afterAll(async () => {
      vi.restoreAllMocks();
      if (!db) return;
      for (const hotel of hotels) {
        for (const collection of [
          "bookings",
          "bookingFinanceAgreementsV1",
          posting.journalCollection,
          "roomTypes",
          "ratePlans",
          "cancellationPolicies",
          "propertyMemberships",
          "paymentAttempts",
          "propertyPayments",
          "refunds",
          "inventoryHolds",
          "inventoryCalendars",
          "roomNightInventory",
          "bookingReferences",
          "bookingNotificationOutbox",
          "physicalUnits",
          ...Object.values(payouts.collections),
          ...Object.values(dues.collections),
        ]) {
          const rows = await db
            .collection(collection)
            .where("propertyId", "==", hotel)
            .get();
          await Promise.all(rows.docs.map((d) => db.recursiveDelete(d.ref)));
        }
        await db.recursiveDelete(db.collection("properties").doc(hotel));
        await db
          .collection("hotelFinanceSettingsV1")
          .doc(`hotel_${hotel}`)
          .delete();
      }
      for (const id of ids) {
        for (const collection of [
          posting.stateCollection,
          payouts.collections.assessments,
          payouts.collections.reservations,
        ])
          await db.recursiveDelete(db.collection(collection).doc(id));
        for (const collection of ["projectionOutbox", "projectionJobs"]) {
          const rows = await db
            .collection(collection)
            .where("entityId", "==", id)
            .get();
          await Promise.all(rows.docs.map((d) => db.recursiveDelete(d.ref)));
        }
      }
      for (const uid of [admin, owner, guest])
        await db.collection("users").doc(uid).delete();
    });
    async function create(
      mode: "full" | "deposit" | "pay_at_property",
      payoutDelayDays = 0,
    ) {
      const hotel = `${prefix}-${hotels.length}`;
      hotels.push(hotel);
      const room = `${hotel}-room`,
        rate = `${hotel}-rate`,
        policy = `${hotel}-cancellation`;
      await db
        .collection("properties")
        .doc(hotel)
        .set({
          ownerId: owner,
          partnerId: owner,
          slug: hotel,
          name: "Complete flow test",
          status: "active",
          approvalStatus: "approved",
          isBookable: true,
          currency: "INR",
          timezone: "Asia/Kolkata",
          inventoryEngine: "interval_v1",
          bookingModes: ["overnight"],
          checkInTime: "14:00",
          checkOutTime: "11:00",
          pms: {
            operationalPolicies: {
              requireAssignedRoom: false,
              requireCleanRoom: false,
              requireGuestRegistration: false,
              requireSettledBalance: true,
            },
          },
        });
      await db.collection("propertyMemberships").doc(`${hotel}_${owner}`).set({
        propertyId: hotel,
        userId: owner,
        role: "owner",
        status: "active",
      });
      await db.collection("roomTypes").doc(room).set({
        propertyId: hotel,
        status: "active",
        name: "Room",
        totalInventory: 2,
        maxAdults: 2,
        maxChildren: 0,
      });
      await db.collection("cancellationPolicies").doc(policy).set({
        propertyId: hotel,
        status: "active",
        name: "Test free cancellation",
        cancellationFeePercent: 0,
        refundableUntilHours: 0,
      });
      await db.collection("ratePlans").doc(rate).set({
        propertyId: hotel,
        roomTypeId: room,
        status: "active",
        bookingMode: "overnight",
        pricingModel: "nightly",
        basePricePaise: 200000,
        taxBasisPoints: 500,
        customerFeePaise: 0,
        paymentMode: mode,
        depositBasisPoints: 2500,
        cancellationPolicyId: policy,
      });
      await db
        .collection("hotelFinanceSettingsV1")
        .doc(`hotel_${hotel}`)
        .set({
          revision: 1,
          settings: {
            marketplaceCommission: true,
            directCommission: false,
            walkInCommission: false,
            commissionBasis: "rooms",
            commissionBasisPoints: 1000,
            payoutDelayDays,
            guestPaymentOptions: ["full_online", "partial_advance", "at_hotel"],
            advance: { type: "percentage", basisPoints: 2500 },
            payoutCycle: "daily",
            minimumPayoutPaise: 50000,
          },
        });
      const input = {
        propertySlug: hotel,
        roomTypeId: room,
        ratePlanId: rate,
        checkIn: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
        checkOut: new Date(Date.now() + 3 * 86400000)
          .toISOString()
          .slice(0, 10),
        bookingMode: "overnight",
        adults: 1,
        children: 0,
        infants: 0,
        paymentMethod:
          mode === "pay_at_property" ? "pay_at_property" : "online",
        leadEmail: "guest@example.test",
        leadPhone: "+919876543210",
        adultGuestNames: ["Test Guest"],
      };
      const orderId = `${hotel}-order`,
        paymentId = `${hotel}-payment`;
      providerFetch.mockReset();
      if (mode !== "pay_at_property")
        providerFetch.mockResolvedValueOnce(Response.json({ id: orderId }));
      const key = crypto.randomUUID(),
        created = await bookings.createBooking(guest, input, key);
      ids.push(created.bookingId);
      expect((await bookings.createBooking(guest, input, key)).bookingId).toBe(
        created.bookingId,
      );
      const online = mode === "full" ? 210000 : mode === "deposit" ? 52500 : 0;
      const original = (
        await db
          .collection("bookingFinanceAgreementsV1")
          .doc(created.bookingId)
          .get()
      ).data() as Agreement;
      expect(original).toMatchObject({
        source: "marketplace",
        commissionPaise: 20000,
        expectedOnlinePaise: online,
        expectedHotelPaise: 210000 - online,
      });
      if (online) {
        expect(created.razorpay?.amount).toBe(online);
        providerFetch.mockResolvedValueOnce(
          Response.json({
            id: paymentId,
            order_id: orderId,
            amount: online,
            currency: "INR",
            status: "captured",
            captured: true,
          }),
        );
        await bookings.confirmPaidBooking(created.bookingId, {
          actorId: "system",
          orderId,
          paymentId,
          source: "reconciliation",
        });
      }
      await posting.processAccounting(db, created.bookingId);
      const pending = await accounting.readAccount(admin, hotel);
      expect(pending.summary).toMatchObject({
        payablePaise: 0,
        duesPaise: 0,
        earnedCommissionPaise: 0,
        pendingOnlinePaise: online,
      });
      await expect(
        payouts.payoutCommand(admin, hotel, {
          action: "prepare",
          bookingIds: [created.bookingId],
          requestId: crypto.randomUUID(),
        }),
      ).rejects.toThrow();
      return { hotel, id: created.bookingId, original, online };
    }
    async function checkout(f: Awaited<ReturnType<typeof create>>) {
      if (f.online < 210000) {
        const key = crypto.randomUUID(),
          input = {
            action: "collect",
            amountPaise: 210000 - f.online,
            method: "upi",
            reference: `${f.id}-guest-payment`,
          };
        await operations.performOperation(owner, f.id, input, key);
        await operations.performOperation(owner, f.id, input, key);
      }
      // Advance only the eligibility clock to arrival; never alter saved booking amounts or terms.
      const saved = (await db.collection("bookings").doc(f.id).get()).data()!;
      const clock = vi
        .spyOn(Date, "now")
        .mockReturnValue(Date.parse(saved.startAt) + 1000);
      try {
        await bookings.transitionBooking(f.id, owner, "checked_in", {
          idempotencyKey: crypto.randomUUID(),
        });
        const key = crypto.randomUUID();
        await bookings.transitionBooking(f.id, owner, "checked_out", {
          idempotencyKey: key,
        });
        await bookings.transitionBooking(f.id, owner, "checked_out", {
          idempotencyKey: key,
        });
      } finally {
        clock.mockRestore();
      }
      await posting.processAccounting(db, f.id);
      await db
        .collection("hotelFinanceSettingsV1")
        .doc(`hotel_${f.hotel}`)
        .update({ revision: 2, "settings.commissionBasisPoints": 5000 });
      await posting.processAccounting(db, f.id);
      expect(
        (
          await db.collection("bookingFinanceAgreementsV1").doc(f.id).get()
        ).data(),
      ).toEqual(f.original);
      expect(
        (await accounting.reconcileAccount(admin, f.hotel)).findings,
      ).toEqual([]);
    }
    it.each(["full", "deposit", "pay_at_property"] as const)(
      "settles %s from real booking creation through checkout and recorded external settlement",
      async (mode) => {
        const f = await create(mode);
        await checkout(f);
        const account = await accounting.readAccount(admin, f.hotel);
        expect(account.summary).toMatchObject({
          earnedCommissionPaise: 20000,
          payablePaise: Math.max(0, f.online - 20000),
          duesPaise: Math.max(0, 20000 - f.online),
          pendingOnlinePaise: 0,
          pendingHotelPaise: 0,
        });
        expect(
          (await accounting.readAccount(owner, f.hotel, true)).summary,
        ).toEqual(account.summary);
        if (mode === "pay_at_property") {
          const view = await dues.readDues(admin, f.hotel);
          expect(view.totals.outstandingPaise).toBe(20000);
          const preview = await dues.duesCommand(admin, f.hotel, {
            action: "preview_payment",
            requestId: crypto.randomUUID(),
            payment: {
              bookingIds: [f.id],
              amountRupees: "200",
              paymentDate: new Date().toISOString().slice(0, 10),
              method: "upi",
              transactionReference: `${f.id}-hotel-dues`,
              notes: "Disposable test recording",
            },
          });
          if (!("confirmation" in preview))
            throw Error("Missing dues confirmation");
          const command = {
            action: "record_payment",
            confirmationId: preview.confirmation.id,
            requestId: crypto.randomUUID(),
          };
          const result = await dues.duesCommand(admin, f.hotel, command);
          expect(await dues.duesCommand(admin, f.hotel, command)).toEqual(
            result,
          );
          expect(
            (await dues.readDues(owner, f.hotel, true)).totals,
          ).toMatchObject({
            outstandingPaise: 0,
            paymentsReceivedPaise: 20000,
          });
        } else {
          const cmd = (input: Record<string, unknown>) =>
            payouts.payoutCommand(admin, f.hotel, {
              ...input,
              requestId: crypto.randomUUID(),
            });
          await cmd({
            action: "assess",
            bookingId: f.id,
            expectedVersion: 0,
            items: deductions,
          });
          // A deposit's ₹325 payable is below the configured ₹500 minimum.
          if (mode === "deposit") {
            await expect(
              cmd({ action: "prepare", bookingIds: [f.id] }),
            ).rejects.toThrow(/below/);
            await db
              .collection("hotelFinanceSettingsV1")
              .doc(`hotel_${f.hotel}`)
              .update({ "settings.minimumPayoutPaise": 0 });
          }
          const prepared = await cmd({ action: "prepare", bookingIds: [f.id] });
          const payout = (
            await db
              .collection(payouts.collections.payouts)
              .doc(prepared.id)
              .get()
          ).data()!;
          expect(payout.finalPaise).toBe(f.online - 20000);
          const input = {
            action: "pay",
            acknowledgedBankVersion: (await (await import("@/lib/payout-readiness/service")).readReadiness(admin, f.hotel)).bankVersion,
            payoutId: prepared.id,
            paymentDate: new Date().toISOString().slice(0, 10),
            method: "bank_transfer",
            reference: `${f.id}-payout`,
            notes: "Disposable external-payment recording",
            requestId: crypto.randomUUID(),
          };
          const paid = await payouts.payoutCommand(admin, f.hotel, input);
          expect(await payouts.payoutCommand(admin, f.hotel, input)).toEqual(
            paid,
          );
          expect(
            (await payouts.readPayouts(owner, f.hotel, true)).payouts.find(
              (p) => p.id === prepared.id,
            )?.status,
          ).toBe("Paid");
        }
        await posting.processAccounting(db, f.id);
        const settled = await accounting.readAccount(admin, f.hotel);
        expect(settled.summary).toMatchObject({
          payablePaise: 0,
          duesPaise: 0,
          earnedCommissionPaise: 20000,
        });
        expect(
          (await accounting.reconcileAccount(admin, f.hotel)).findings,
        ).toEqual([]);
        expect(providerFetch.mock.calls.length).toBe(
          mode === "pay_at_property" ? 0 : 2,
        );
        expect(
          JSON.stringify(
            bookings.serializeBooking(
              f.id,
              (await db.collection("bookings").doc(f.id).get()).data()!,
            ),
          ),
        ).not.toMatch(/commissionPaise|hotelDues|hotelPayout/);
      },
    );
    it("preserves the saved two-day payout wait after checkout even if current defaults change", async () => {
      const f = await create("full", 2);
      await checkout(f);
      await db
        .collection("hotelFinanceSettingsV1")
        .doc(`hotel_${f.hotel}`)
        .update({ "settings.payoutDelayDays": 0 });
      const view = await payouts.readPayouts(admin, f.hotel);
      const position = view.positions.find((p) => p.bookingId === f.id)!;
      expect(position.savedDelayDays).toBe(2);
      expect(position.eligible).toBe(false);
      expect(position.reasons.join(" ")).toMatch(/waiting period/);
      expect(
        Date.parse(position.eligibleAt!) - Date.parse(position.checkoutAt!),
      ).toBe(2 * 86400000);
      await expect(
        payouts.payoutCommand(admin, f.hotel, {
          action: "prepare",
          bookingIds: [f.id],
          requestId: crypto.randomUUID(),
        }),
      ).rejects.toThrow(/waiting period/);
    });
    it.each(["reservation", "walk_in"] as const)(
      "keeps commission zero for hotel-created %s bookings",
      async (purpose) => {
        const setup = await create("pay_at_property");
        const source = (
          await db.collection("bookings").doc(setup.id).get()
        ).data()!;
        const { localParts } = await import("@/lib/booking/domain");
        const arrival = localParts(Date.now() - 60000, "Asia/Kolkata");
        const created = await bookings.createManualReservation(
          owner,
          {
            propertyId: setup.hotel,
            roomTypeId: `${setup.hotel}-room`,
            ratePlanId: `${setup.hotel}-rate`,
            bookingMode: "overnight",
            checkIn: purpose === "walk_in" ? arrival.date : source.checkIn,
            checkOut:
              purpose === "walk_in"
                ? new Date(Date.parse(`${arrival.date}T00:00:00Z`) + 86400000)
                    .toISOString()
                    .slice(0, 10)
                : source.checkOut,
            adults: 1,
            children: 0,
            infants: 0,
            paymentMethod: "pay_at_property",
            guestName: "Direct Guest",
            guestEmail: "direct@example.test",
            guestPhone: "+919876543210",
            reservationPurpose: purpose,
            ...(purpose === "walk_in"
              ? { recordedArrivalTime: arrival.time }
              : {}),
          },
          crypto.randomUUID(),
        );
        ids.push(created.id);
        const original = (
          await db
            .collection("bookingFinanceAgreementsV1")
            .doc(created.id)
            .get()
        ).data() as Agreement;
        expect(original).toMatchObject({
          source: purpose === "walk_in" ? "walk_in" : "direct",
          commissionPaise: 0,
        });
        await checkout({
          hotel: setup.hotel,
          id: created.id,
          online: 0,
          original,
        });
        expect(
          (await accounting.readAccount(admin, setup.hotel)).summary,
        ).toMatchObject({
          earnedCommissionPaise: 0,
          duesPaise: 0,
          payablePaise: 0,
        });
        expect(
          (await dues.readDues(owner, setup.hotel, true)).totals
            .outstandingPaise,
        ).toBe(0);
      },
    );
    it("cancels and refunds an online booking without earning commission or making funds available for payout", async () => {
      const f = await create("full");
      await bookings.cancelBookingForUser(guest, f.id);
      const refunds = await db
        .collection("refunds")
        .where("bookingId", "==", f.id)
        .get();
      expect(refunds.size).toBe(1);
      const refund = refunds.docs[0];
      providerFetch.mockResolvedValueOnce(
        Response.json({
          id: `${f.id}-refund`,
          payment_id: refund.get("paymentId"),
          amount: 210000,
          currency: "INR",
          status: "processed",
        }),
      );
      const { processRefund } = await import("@/lib/booking/processing");
      await processRefund(refund.id);
      await processRefund(refund.id);
      await posting.processAccounting(db, f.id);
      const view = await accounting.readAccount(admin, f.hotel);
      expect(view.summary).toMatchObject({
        payablePaise: 0,
        duesPaise: 0,
        earnedCommissionPaise: 0,
        pendingOnlinePaise: 0,
      });
      expect(
        view.payments.find((p) => p.type === "online_refund")?.amountPaise,
      ).toBe(210000);
      expect(
        (await dues.readDues(admin, f.hotel)).totals.outstandingPaise,
      ).toBe(0);
      expect(
        (await db.collection("bookings").doc(f.id).get()).data(),
      ).toMatchObject({ bookingStatus: "cancelled", refundedPaise: 210000 });
      await expect(
        payouts.payoutCommand(admin, f.hotel, {
          action: "prepare",
          bookingIds: [f.id],
          requestId: crypto.randomUUID(),
        }),
      ).rejects.toThrow();
    });
  },
);
