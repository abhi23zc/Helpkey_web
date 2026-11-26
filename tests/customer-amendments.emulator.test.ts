import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
const providerFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/providers/http", () => ({ providerFetch }));
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  "customer amendments (disposable Firestore)",
  () => {
    let db: typeof import("@/lib/firebase/admin").adminDb;
    let service: typeof import("@/lib/booking/amendments/service");
    let payments: typeof import("@/lib/booking/amendments/payments");
    let bookings: typeof import("@/lib/bookings");
    const roots: { collection: string; id: string }[] = [];
    const orders = new Map<string, Record<string, unknown>>();
    const captures = new Map<string, Record<string, unknown>>();
    beforeAll(async () => {
      process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-edits";
      process.env.RAZORPAY_KEY_ID = "test";
      process.env.RAZORPAY_KEY_SECRET = "test";
      db = (await import("@/lib/firebase/admin")).adminDb;
      service = await import("@/lib/booking/amendments/service");
      payments = await import("@/lib/booking/amendments/payments");
      bookings = await import("@/lib/bookings");
    });
    beforeEach(() => {
      orders.clear();
      captures.clear();
      providerFetch.mockReset();
      providerFetch.mockImplementation(
        async (_name: string, url: string | URL, init?: RequestInit) => {
          const u = new URL(url);
          const path = u.pathname.replace("/v1/", "");
          if (path === "orders" && init?.method === "POST") {
            const body = JSON.parse(String(init.body));
            const order = { ...body, id: `order_${randomUUID()}` };
            orders.set(order.id, order);
            return Response.json(order);
          }
          if (path === "orders") {
            const items = [...orders.values()].filter(
              (o) => o.receipt === u.searchParams.get("receipt"),
            );
            return Response.json({ items, count: items.length });
          }
          if (/^orders\/.+\/payments$/.test(path)) {
            const id = path.split("/")[1];
            const items = [...captures.values()].filter(
              (p) => p.order_id === id,
            );
            return Response.json({ items, count: items.length });
          }
          if (path.startsWith("orders/"))
            return Response.json(orders.get(path.split("/")[1]) ?? {});
          if (path.startsWith("payments/"))
            return Response.json(captures.get(path.split("/")[1]) ?? {});
          throw new Error(`Unexpected provider request ${path}`);
        },
      );
    });
    afterAll(async () => {
      const hotelIds = roots
        .filter((r) => r.collection === "properties")
        .map((r) => r.id);
      for (const propertyId of hotelIds)
        for (const collection of [
          "bookings",
          "inventoryCalendars",
          "inventoryHolds",
          "bookingFinanceAgreementsV1",
          "bookingPaymentOrdersV1",
          "bookingNotificationOutbox",
          "paymentAttempts",
          "refunds",
          "bookingReferences",
        ]) {
          const docs = await db
            .collection(collection)
            .where("propertyId", "==", propertyId)
            .get();
          for (const d of docs.docs) await db.recursiveDelete(d.ref);
        }
      for (const r of roots)
        await db.recursiveDelete(db.collection(r.collection).doc(r.id));
    });
    async function fixture(
      mode: "pay_at_property" | "full" | "deposit" = "pay_at_property",
      pending = false,
    ) {
      const id = `amend_${randomUUID()}`,
        propertyId = id,
        roomId = `${id}_room`,
        rateId = `${id}_rate`;
      const date = new Date(Date.now() + 5 * 86400000)
        .toISOString()
        .slice(0, 10);
      const input = {
        roomTypeId: roomId,
        ratePlanId: rateId,
        checkIn: date,
        arrivalTime: "10:00",
        durationMinutes: 120,
        adults: 1,
        children: 0,
        infants: 0,
        occupants: [{ name: "Test Guest", ageGroup: "adult" as const }],
        bookingContact: {
          name: "Test Guest",
          email: "guest@example.com",
          phone: "+919876543210",
        },
      };
      const property = {
        name: "Test hotel",
        slug: id,
        status: "active",
        approvalStatus: "approved",
        isBookable: true,
        inventoryEngine: "interval_v1",
        timezone: "Asia/Kolkata",
        bookingModes: ["hourly", "overnight"],
        currency: "INR",
        ownerId: "owner",
      };
      const room = {
        propertyId,
        name: "Double",
        status: "active",
        totalInventory: 1,
        maxAdults: 2,
        maxChildren: 1,
        maxInfants: 1,
        maxOccupancy: 3,
      };
      const rate = {
        propertyId,
        roomTypeId: roomId,
        name: "Standard",
        status: "active",
        bookingMode: "hourly",
        pricingModel: "duration" as const,
        durationPrices: [
          { hours: 2, pricePaise: 200000 },
          { hours: 3, pricePaise: 250000 },
        ],
        paymentMode: mode,
        depositBasisPoints: 2500,
      };
      const { evaluateStay, allocateIntervals } = await import(
        "@/lib/booking/domain"
      );
      const evaluated = evaluateStay(
        { ...input, bookingMode: "hourly" },
        property,
        room,
        rate,
      );
      const { snapshotPolicy } = await import(
        "@/lib/booking/amendments/domain"
      );
      const b = {
        ...evaluated,
        adults: input.adults,
        children: input.children,
        infants: input.infants,
        id,
        propertyId,
        propertyName: "Test hotel",
        roomType: { id: roomId, name: room.name },
        ratePlan: { id: rateId, name: rate.name },
        guestId: "guest",
        confirmationCode: `HK_${id}`,
        bookingStatus: pending ? "pending_payment" : "confirmed",
        paymentStatus: pending
          ? "pending"
          : mode === "pay_at_property"
            ? "pay_at_property"
            : "paid",
        paymentMethod:
          mode === "pay_at_property" ? "pay_at_property" : "online",
        currency: "INR",
        totalPaise: evaluated.totalPaise,
        roomTotalPaise: evaluated.totalPaise,
        extrasTotalPaise: 0,
        paidPaise:
          pending || mode === "pay_at_property" ? 0 : evaluated.payableNowPaise,
        refundedPaise: 0,
        refundDuePaise: 0,
        inventoryEngine: "interval_v1",
        inventoryReleased: false,
        stayRevision: 0,
        reservationRevision: 0,
        checkoutRevision: 0,
        leadGuest: {
          name: "Test Guest",
          email: input.bookingContact.email,
          phone: input.bookingContact.phone,
          adultGuestNames: ["Test Guest"],
        },
        bookingContact: input.bookingContact,
        occupants: input.occupants,
        customizations: [],
        preCheckin: {},
        expiresAt: pending ? Timestamp.fromMillis(Date.now() + 600000) : null,
        razorpayOrderId:
          mode !== "pay_at_property" ? `order_initial_${id}` : null,
        razorpayPaymentId:
          !pending && mode !== "pay_at_property" ? `pay_initial_${id}` : null,
      };
      const saved = {
        ...b,
        editPolicy: snapshotPolicy(
          b,
          property,
          rate,
          b.expiresAt?.toDate().toISOString() ?? null,
        ),
      };
      const { captureAgreement } = await import("@/lib/booking-finance/domain");
      const allocations = allocateIntervals(
        b.startAt,
        b.inventoryEndAt,
        b.timezone,
      );
      for (const [collection, rid, data] of [
        ["properties", propertyId, property],
        ["roomTypes", roomId, room],
        ["ratePlans", rateId, rate],
        ["bookings", id, saved],
        [
          "inventoryHolds",
          id,
          {
            propertyId,
            bookingId: id,
            roomTypeId: roomId,
            status: pending ? "held" : "committed",
            allocations,
          },
        ],
        [
          "bookingFinanceAgreementsV1",
          id,
          captureAgreement(
            id,
            saved,
            "owner",
            [],
            {
              marketplaceCommission: true,
              commissionBasis: "rooms",
              commissionBasisPoints: 1000,
            },
            {},
            0,
            0,
          ),
        ],
      ] as const) {
        await db.collection(collection).doc(rid).set(data);
        roots.push({ collection, id: rid });
      }
      for (const a of allocations) {
        const cid = `${propertyId}_${roomId}_${a.date}`;
        await db
          .collection("inventoryCalendars")
          .doc(cid)
          .set({
            propertyId,
            roomTypeId: roomId,
            date: a.date,
            reserved: Object.fromEntries(a.intervals.map((k) => [k, 1])),
          });
        roots.push({ collection: "inventoryCalendars", id: cid });
      }
      if (b.razorpayOrderId) {
        await db.runTransaction(async (tx) =>
          payments.registerOrder(tx, b.razorpayOrderId!, b, id),
        );
        roots.push({
          collection: "bookingPaymentOrdersV1",
          id: payments.orderRef(b.razorpayOrderId).id,
        });
        orders.set(b.razorpayOrderId, {
          id: b.razorpayOrderId,
          amount: evaluated.payableNowPaise,
          currency: "INR",
          notes: { bookingId: id },
        });
        if (b.razorpayPaymentId) {
          const r = {
            id: b.razorpayPaymentId,
            paymentId: b.razorpayPaymentId,
            bookingId: id,
            propertyId,
            order_id: b.razorpayOrderId,
            orderId: b.razorpayOrderId,
            amount: b.paidPaise,
            amountPaise: b.paidPaise,
            currency: "INR",
            status: "captured",
            captured: true,
          };
          await db
            .collection("paymentAttempts")
            .doc(b.razorpayPaymentId)
            .set(r);
          roots.push({
            collection: "paymentAttempts",
            id: b.razorpayPaymentId,
          });
          captures.set(b.razorpayPaymentId, r);
        }
      }
      return { id, propertyId, input, b: saved };
    }
    async function capture(id: string, aid: string, suffix = "") {
      const a = (
        await db
          .collection("bookings")
          .doc(id)
          .collection("amendments")
          .doc(aid)
          .get()
      ).data()!;
      const payment = {
        id: `pay_${randomUUID()}${suffix}`,
        order_id: a.orderId,
        amount: a.amountToCollectPaise,
        currency: "INR",
        status: "captured",
        captured: true,
        notes: { bookingId: id, amendmentId: aid },
      };
      captures.set(payment.id, payment);
      roots.push({ collection: "paymentAttempts", id: payment.id });
      const result = await bookings.confirmPaidBooking(id, {
        actorId: "guest",
        orderId: a.orderId,
        paymentId: payment.id,
        source: "customer_verify",
      });
      return { result, payment };
    }
    it("keeps family guest registration complete after a stay edit and later name correction", async () => {
      const f = await fixture();
      const { registrationFacts } = await import("@/lib/partner/reservations/operational-policies");
      const occupants = [
        ...f.input.occupants,
        { name: "Child Guest", ageGroup: "child" as const },
        { name: "Infant Guest", ageGroup: "infant" as const },
      ];
      const q = await service.quoteAmendment("guest", f.id, {
        ...f.input, children: 1, infants: 1, occupants,
      });
      await service.createAmendment("guest", f.id, { quoteId: q.quoteId }, "family-guests");
      const ref = db.collection("bookings").doc(f.id);
      const amended = (await ref.get()).data()!;
      expect(registrationFacts(amended).complete).toBe(true);
      await service.patchGuests("guest", f.id, {
        occupants: occupants.map((o) => o.ageGroup === "child" ? { ...o, name: "Corrected Child" } : o),
        bookingContact: f.input.bookingContact,
        revision: amended.reservationRevision,
        stayRevision: amended.stayRevision,
      });
      const corrected = (await ref.get()).data()!;
      expect(registrationFacts(corrected)).toMatchObject({ complete: true, missing: { adult: 0, child: 0, infant: 0 } });
      expect(registrationFacts(corrected).occupants).toContainEqual({ name: "Corrected Child", ageGroup: "child" });
    });
    it("applies a no-payment revision once and preserves the rising price floor", async () => {
      const f = await fixture();
      const q = await service.quoteAmendment("guest", f.id, {
        ...f.input,
        durationMinutes: 180,
      });
      expect(q.amountToCollectPaise).toBe(0);
      const a = await service.createAmendment(
        "guest",
        f.id,
        { quoteId: q.quoteId },
        "once",
      );
      expect(a.status).toBe("applied");
      await service.createAmendment(
        "guest",
        f.id,
        { quoteId: q.quoteId },
        "once",
      );
      const cheaper = await service.quoteAmendment("guest", f.id, f.input);
      expect(cheaper.accepted.totalPaise).toBe(250000);
      expect(cheaper.retainedDifferencePaise).toBe(50000);
      await service.createAmendment(
        "guest",
        f.id,
        { quoteId: cheaper.quoteId },
        "cheaper",
      );
      const saved = (await db.collection("bookings").doc(f.id).get()).data()!;
      expect(saved.totalPaise).toBe(250000);
      expect(saved.reservationRevision).toBe(2);
      expect(
        (await db.collection("bookingFinanceAgreementsV1").doc(f.id).get()).get(
          "activeAccommodationAgreement.commissionPaise",
        ),
      ).toBe(25000);
    });
    it.each(["full", "deposit"] as const)(
      "collects the %s shortfall separately and preserves the original booking until capture",
      async (mode) => {
        const f = await fixture(mode);
        const q = await service.quoteAmendment("guest", f.id, {
          ...f.input,
          durationMinutes: 180,
        });
        expect(q.amountToCollectPaise).toBe(mode === "full" ? 50000 : 12500);
        const a = await service.createAmendment(
          "guest",
          f.id,
          { quoteId: q.quoteId },
          mode,
        );
        expect(a.status).toBe("awaiting_payment");
        expect(
          (await db.collection("bookings").doc(f.id).get()).get(
            "durationMinutes",
          ),
        ).toBe(120);
        await payments.paymentSession("guest", f.id, a.id);
        const result = await capture(f.id, a.id);
        expect(result.result).toBe(true);
        await bookings.confirmPaidBooking(f.id, {
          actorId: "guest",
          orderId: result.payment.order_id,
          paymentId: result.payment.id,
          source: "customer_verify",
        });
        const saved = (await db.collection("bookings").doc(f.id).get()).data()!;
        expect(saved.durationMinutes).toBe(180);
        expect(saved.paidPaise).toBe(mode === "full" ? 250000 : 62500);
        expect(saved.reservationRevision).toBe(1);
      },
    );
    it("cancels only amendment inventory and refunds a later capture", async () => {
      const f = await fixture("full");
      const q = await service.quoteAmendment("guest", f.id, {
        ...f.input,
        durationMinutes: 180,
      });
      const a = await service.createAmendment(
        "guest",
        f.id,
        { quoteId: q.quoteId },
        "cancel",
      );
      await payments.paymentSession("guest", f.id, a.id);
      await service.cancelAttempt("guest", f.id, a.id);
      const result = await capture(f.id, a.id);
      expect(result.result).toBe(false);
      const b = (await db.collection("bookings").doc(f.id).get()).data()!;
      expect(b.durationMinutes).toBe(120);
      expect(b.bookingStatus).toBe("confirmed");
      const refunds = await db
        .collection("refunds")
        .where("bookingId", "==", f.id)
        .get();
      expect(refunds.size).toBe(1);
      expect(refunds.docs[0].get("amountPaise")).toBe(50000);
      roots.push({ collection: "refunds", id: refunds.docs[0].id });
    });
    it("replaces pending checkout without extending its expiry and refunds equal-priced old orders", async () => {
      const f = await fixture("full", true);
      const q = await service.quoteAmendment("guest", f.id, {
        ...f.input,
        arrivalTime: "11:00",
      });
      const a = await service.createAmendment(
        "guest",
        f.id,
        { quoteId: q.quoteId },
        "replace",
      );
      expect(a.status).toBe("applied");
      expect(a.checkoutReplaced).toBe(true);
      const b = (await db.collection("bookings").doc(f.id).get()).data()!;
      expect(b.checkoutRevision).toBe(1);
      expect(b.expiresAt.toMillis()).toBe(f.b.expiresAt!.toMillis());
      expect(b.bookingStatus).toBe("pending_payment");
      const old = {
        id: `pay_${randomUUID()}`,
        order_id: f.b.razorpayOrderId,
        amount: 200000,
        currency: "INR",
        status: "captured",
        captured: true,
      };
      captures.set(old.id, old);
      roots.push({ collection: "paymentAttempts", id: old.id });
      expect(
        await bookings.confirmPaidBooking(f.id, {
          actorId: "guest",
          orderId: old.order_id!,
          paymentId: old.id,
          source: "customer_verify",
        }),
      ).toBe(false);
      expect(
        (await db.collection("bookings").doc(f.id).get()).get("bookingStatus"),
      ).toBe("pending_payment");
      const refunds = await db
        .collection("refunds")
        .where("bookingId", "==", f.id)
        .get();
      expect(refunds.size).toBe(1);
      roots.push({ collection: "refunds", id: refunds.docs[0].id });
      const { processRefund } = await import("@/lib/booking/processing");
      providerFetch.mockResolvedValueOnce(
        Response.json({
          id: "refund_old",
          payment_id: old.id,
          amount: old.amount,
          currency: "INR",
          status: "processed",
        }),
      );
      await processRefund(refunds.docs[0].id);
      const currentPayment = {
        id: `pay_${randomUUID()}`,
        order_id: b.razorpayOrderId,
        amount: 200000,
        currency: "INR",
        status: "captured",
        captured: true,
      };
      captures.set(currentPayment.id, currentPayment);
      expect(
        await bookings.confirmPaidBooking(f.id, {
          actorId: "guest",
          orderId: currentPayment.order_id,
          paymentId: currentPayment.id,
          source: "customer_verify",
        }),
      ).toBe(true);
      const confirmed = (
        await db.collection("bookings").doc(f.id).get()
      ).data()!;
      expect(confirmed.paidPaise).toBe(400000);
      expect(confirmed.refundedPaise).toBe(200000);
      expect(confirmed.bookingStatus).toBe("confirmed");
    });
    it("rejects cross-customer access, invalid occupant counts and stale revisions", async () => {
      const f = await fixture();
      await expect(service.editOptions("other", f.id)).rejects.toThrow(
        "NOT_FOUND",
      );
      await expect(
        service.quoteAmendment("guest", f.id, { ...f.input, adults: 2 }),
      ).rejects.toThrow("GUEST_COUNT_MISMATCH");
      const q = await service.quoteAmendment("guest", f.id, f.input);
      await db
        .collection("bookings")
        .doc(f.id)
        .update({ reservationRevision: 1 });
      await expect(
        service.createAmendment("guest", f.id, { quoteId: q.quoteId }, "stale"),
      ).rejects.toThrow("REVISION_CONFLICT");
    });
    it("does not raise the floor for previews and closes on early check-in", async () => {
      const f = await fixture();
      await service.quoteAmendment("guest", f.id, {
        ...f.input,
        durationMinutes: 180,
      });
      expect(
        (await db.collection("bookings").doc(f.id).get()).get(
          "editPolicy.accepted.totalPaise",
        ),
      ).toBe(200000);
      await db
        .collection("bookings")
        .doc(f.id)
        .update({ actualCheckInAt: Timestamp.now() });
      await expect(
        service.quoteAmendment("guest", f.id, f.input),
      ).rejects.toThrow("EDITING_CLOSED");
    });
    it("snapshots policy at creation and does not adopt later hotel settings", async () => {
      const f = await fixture();
      await db
        .collection("roomTypes")
        .doc(f.input.roomTypeId)
        .update({ totalInventory: 2 });
      await db
        .collection("properties")
        .doc(f.propertyId)
        .update({ customerEditing: { cutoffHours: 4 } });
      const created = await bookings.createBooking(
        "guest",
        {
          ...f.input,
          propertySlug: f.propertyId,
          bookingMode: "hourly",
          arrivalTime: "15:00",
          paymentMethod: "pay_at_property",
          leadEmail: f.input.bookingContact.email,
          leadPhone: f.input.bookingContact.phone,
          adultGuestNames: ["Test Guest"],
        },
        `creation_${f.id}`,
      );
      roots.push(
        { collection: "bookings", id: created.bookingId },
        { collection: "inventoryHolds", id: created.bookingId },
        { collection: "bookingFinanceAgreementsV1", id: created.bookingId },
      );
      expect(
        (await db.collection("bookings").doc(created.bookingId).get()).get(
          "editPolicy.cutoffHours",
        ),
      ).toBe(4);
      await db
        .collection("properties")
        .doc(f.propertyId)
        .update({ customerEditing: { cutoffHours: 24 } });
      expect(
        (await service.editOptions("guest", created.bookingId)).stayDeadline,
      ).toBe(
        new Date(
          Date.parse(`${f.input.checkIn}T15:00:00+05:30`) - 4 * 3600000,
        ).toISOString(),
      );
    });
    it("serializes multiple tabs and keeps the existing reservation on a conflicting proposal", async () => {
      const f = await fixture("full");
      const q = await service.quoteAmendment("guest", f.id, {
        ...f.input,
        durationMinutes: 180,
      });
      const results = await Promise.allSettled([
        service.createAmendment("guest", f.id, { quoteId: q.quoteId }, "tab1"),
        service.createAmendment("guest", f.id, { quoteId: q.quoteId }, "tab2"),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (await db.collection("bookings").doc(f.id).get()).get(
          "durationMinutes",
        ),
      ).toBe(120);
    });
    it("releases expired amendment inventory even when the provider is unavailable", async () => {
      const f = await fixture("full");
      const q = await service.quoteAmendment("guest", f.id, {
        ...f.input,
        durationMinutes: 180,
      });
      const a = await service.createAmendment(
        "guest",
        f.id,
        { quoteId: q.quoteId },
        "expiry",
      );
      await db
        .collection("bookings")
        .doc(f.id)
        .collection("amendments")
        .doc(a.id)
        .update({ expiresAt: Timestamp.fromMillis(Date.now() - 1) });
      providerFetch.mockRejectedValue(new Error("Provider unavailable"));
      await payments.reconcileAmendments(f.id).catch(() => {});
      expect(
        (await db.collection("bookings").doc(f.id).get()).get(
          "activeAmendmentId",
        ),
      ).toBeNull();
      expect(
        (await service.readAttempt("guest", f.id, a.id)).amendment.status,
      ).toBe("expired");
      providerFetch.mockReset();
      const retry = await service.quoteAmendment("guest", f.id, {
        ...f.input,
        durationMinutes: 180,
      });
      expect(retry.amountToCollectPaise).toBe(50000);
    });
    it("refunds capture when actual check-in wins the application race", async () => {
      const f = await fixture("full");
      const q = await service.quoteAmendment("guest", f.id, {
        ...f.input,
        durationMinutes: 180,
      });
      const a = await service.createAmendment(
        "guest",
        f.id,
        { quoteId: q.quoteId },
        "checkin",
      );
      await payments.paymentSession("guest", f.id, a.id);
      await db.collection("bookings").doc(f.id).update({
        actualCheckInAt: Timestamp.now(),
        bookingStatus: "checked_in",
        reservationRevision: 1,
      });
      expect((await capture(f.id, a.id)).result).toBe(false);
      expect(
        (await db.collection("bookings").doc(f.id).get()).get(
          "durationMinutes",
        ),
      ).toBe(120);
    });
    it("requires an exact package mapping and capacity-valid occupant list", async () => {
      const f = await fixture();
      await expect(
        service.quoteAmendment("guest", f.id, {
          ...f.input,
          ratePlanId: "another",
        }),
      ).rejects.toThrow("PACKAGE_ASSISTANCE_REQUIRED");
      await expect(
        service.quoteAmendment("guest", f.id, {
          ...f.input,
          adults: 3,
          occupants: Array.from({ length: 3 }, (_, i) => ({
            name: `Guest ${i}`,
            ageGroup: "adult",
          })),
        }),
      ).rejects.toThrow("ROOM_CAPACITY_EXCEEDED");
    });
    it("does not replace a checkout with authorized or uncertain payment", async () => {
      const f = await fixture("full", true);
      const q = await service.quoteAmendment("guest", f.id, {
        ...f.input,
        arrivalTime: "11:00",
      });
      captures.set("authorized", {
        id: "authorized",
        order_id: f.b.razorpayOrderId,
        amount: 200000,
        currency: "INR",
        status: "authorized",
      });
      await expect(
        service.createAmendment(
          "guest",
          f.id,
          { quoteId: q.quoteId },
          "authorized",
        ),
      ).rejects.toThrow("Payment verification in progress");
      expect(
        (await db.collection("bookings").doc(f.id).get()).get(
          "razorpayOrderId",
        ),
      ).toBe(f.b.razorpayOrderId);
    });
    it("switches to a fresh confirmed-booking review when original capture wins before replacement", async () => {
      const f = await fixture("full", true);
      const q = await service.quoteAmendment("guest", f.id, {
        ...f.input,
        arrivalTime: "11:00",
      });
      const payment = {
        id: `pay_${randomUUID()}`,
        order_id: f.b.razorpayOrderId,
        amount: 200000,
        currency: "INR",
        status: "captured",
        captured: true,
      };
      captures.set(payment.id, payment);
      await expect(
        service.createAmendment(
          "guest",
          f.id,
          { quoteId: q.quoteId },
          "capturewins",
        ),
      ).rejects.toThrow("BOOKING_CONFIRMED_REVIEW_REQUIRED");
      const b = (await db.collection("bookings").doc(f.id).get()).data()!;
      expect(b.bookingStatus).toBe("confirmed");
      expect(b.arrivalTime).toBe("10:00");
      await expect(
        service.createAmendment(
          "guest",
          f.id,
          { quoteId: q.quoteId },
          "after-confirmation",
        ),
      ).rejects.toThrow("BOOKING_CONFIRMED_REVIEW_REQUIRED");
    });
    it("resolves an unchanged service only for its approved proposal and version", async () => {
      const f = await fixture();
      const request = {
        id: "pickup",
        offeringId: "unlisted",
        name: "Pickup",
        status: "confirmed",
        source: "unlisted",
        quantity: 1,
        totalPaise: 0,
        unitPricePaise: 0,
        preparationStarted: false,
        deadlineAt: new Date(Date.parse(f.b.startAt) - 3600000).toISOString(),
        inputs: { serviceAt: f.b.startAt },
      };
      await db
        .collection("bookings")
        .doc(f.id)
        .update({ customizations: [request] });
      const proposal = { ...f.input, arrivalTime: "11:00" };
      const q = await service.quoteAmendment("guest", f.id, proposal);
      expect(q.serviceImpacts[0].approved).toBe(false);
      await expect(
        service.createAmendment(
          "guest",
          f.id,
          { quoteId: q.quoteId },
          "blocked",
        ),
      ).rejects.toThrow("SERVICE_CONFLICT");
      const { serviceVersion } = await import(
        "@/lib/booking/amendments/engine"
      );
      await db
        .collection("bookings")
        .doc(f.id)
        .collection("serviceMoveApprovals")
        .doc("approval")
        .set({
          requestId: "pickup",
          proposalFingerprint: q.proposalFingerprint,
          serviceVersion: serviceVersion(request),
        });
      const approved = await service.quoteAmendment("guest", f.id, proposal);
      expect(approved.serviceImpacts[0].approved).toBe(true);
      const stale = await service.quoteAmendment("guest", f.id, {
        ...proposal,
        arrivalTime: "12:00",
      });
      expect(stale.serviceImpacts[0].approved).toBe(false);
      await service.createAmendment(
        "guest",
        f.id,
        { quoteId: approved.quoteId },
        "approved",
      );
      expect(
        (await db.collection("bookings").doc(f.id).get()).get(
          "customizations",
        )[0].inputs.serviceAt,
      ).toBe(new Date(Date.parse(f.b.startAt) + 3600000).toISOString());
    });
    it("reserves cancellation refunds against multiple actual capture receipts", async () => {
      const f = await fixture("full");
      const q = await service.quoteAmendment("guest", f.id, {
        ...f.input,
        durationMinutes: 180,
      });
      const a = await service.createAmendment(
        "guest",
        f.id,
        { quoteId: q.quoteId },
        "refunds",
      );
      await payments.paymentSession("guest", f.id, a.id);
      await capture(f.id, a.id);
      await bookings.releaseBookingHold(
        f.id,
        "admin",
        "cancelled",
        "ADMIN_CANCELLED",
      );
      const refunds = await db
        .collection("refunds")
        .where("bookingId", "==", f.id)
        .get();
      expect(refunds.size).toBe(2);
      expect(
        refunds.docs.reduce((sum, d) => sum + d.get("amountPaise"), 0),
      ).toBe(250000);
      expect(new Set(refunds.docs.map((d) => d.get("paymentId"))).size).toBe(2);
    });
    it("does not recreate an order after a lost provider response and recovers its original identity", async () => {
      const f = await fixture("full");
      const q = await service.quoteAmendment("guest", f.id, {
        ...f.input,
        durationMinutes: 180,
      });
      const a = await service.createAmendment(
        "guest",
        f.id,
        { quoteId: q.quoteId },
        "ambiguous",
      );
      const original = providerFetch.getMockImplementation()!;
      providerFetch.mockImplementationOnce(async (...args) => {
        await original(...args);
        throw new Error("Connection lost after provider creation");
      });
      await expect(
        payments.paymentSession("guest", f.id, a.id),
      ).rejects.toThrow("Connection lost");
      await expect(
        payments.paymentSession("guest", f.id, a.id),
      ).rejects.toThrow("PAYMENT_UNRESOLVED");
      await payments.reconcileAmendments(f.id);
      const session = await payments.paymentSession("guest", f.id, a.id);
      expect(session.razorpay.orderId).toBeTruthy();
      expect(orders.size).toBe(2);
    });
    it("keeps the agreed quote fixed during a payment reservation after published rates change", async () => {
      const f = await fixture("full");
      const q = await service.quoteAmendment("guest", f.id, {
        ...f.input,
        durationMinutes: 180,
      });
      const a = await service.createAmendment(
        "guest",
        f.id,
        { quoteId: q.quoteId },
        "fixed",
      );
      await payments.paymentSession("guest", f.id, a.id);
      await db
        .collection("ratePlans")
        .doc(f.input.ratePlanId)
        .update({
          durationPrices: [
            { hours: 2, pricePaise: 220000 },
            { hours: 3, pricePaise: 350000 },
          ],
        });
      expect((await capture(f.id, a.id)).result).toBe(true);
      expect(
        (await db.collection("bookings").doc(f.id).get()).get("totalPaise"),
      ).toBe(250000);
    });
    it("permits only one of two bookings to amend into the last available room", async () => {
      const f = await fixture();
      const second = await bookings.createBooking(
        "guest",
        {
          ...f.input,
          propertySlug: f.propertyId,
          bookingMode: "hourly",
          arrivalTime: "14:00",
          paymentMethod: "pay_at_property",
          leadEmail: f.input.bookingContact.email,
          leadPhone: f.input.bookingContact.phone,
          adultGuestNames: ["Test Guest"],
        },
        `other_${f.id}`,
      );
      const proposal = { ...f.input, arrivalTime: "18:00" };
      const q1 = await service.quoteAmendment("guest", f.id, proposal),
        q2 = await service.quoteAmendment("guest", second.bookingId, proposal);
      const results = await Promise.allSettled([
        service.createAmendment(
          "guest",
          f.id,
          { quoteId: q1.quoteId },
          "last1",
        ),
        service.createAmendment(
          "guest",
          second.bookingId,
          { quoteId: q2.quoteId },
          "last2",
        ),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    });
    it("creates independent notification deliveries from the committed revision and contains provider failures", async () => {
      const f = await fixture();
      process.env.BOOKING_WHATSAPP = "true";
      await db
        .collection("properties")
        .doc(f.propertyId)
        .update({ customerEditing: { reservationsPhone: "+919876543211" } });
      const q = await service.quoteAmendment("guest", f.id, {
        ...f.input,
        arrivalTime: "11:00",
      });
      const a = await service.createAmendment(
        "guest",
        f.id,
        { quoteId: q.quoteId },
        "notifications",
      );
      const { processBookingNotifications } = await import(
        "@/lib/booking/notifications"
      );
      await processBookingNotifications(`${f.id}_${a.id}`);
      const deliveries = await db
        .collection("bookingNotificationOutbox")
        .where("bookingId", "==", f.id)
        .get();
      const whatsapp = deliveries.docs.filter(
        (d) => d.get("channel") === "whatsapp",
      );
      expect(whatsapp).toHaveLength(2);
      expect(whatsapp[0].get("message")).toContain("11:00");
      process.env.WHATSAPP_BOOKING_API_KEY = "test";
      process.env.WHATSAPP_BOOKING_API_URL = "https://example.test/send";
      providerFetch.mockResolvedValueOnce(
        Response.json({ status: false }, { status: 503 }),
      );
      expect(
        (await processBookingNotifications(whatsapp[0].id)).failures,
      ).toHaveLength(1);
      expect((await whatsapp[0].ref.get()).get("status")).toBe("retry");
      expect(
        (await db.collection("bookings").doc(f.id).get()).get("arrivalTime"),
      ).toBe("11:00");
      process.env.BOOKING_WHATSAPP = "false";
      delete process.env.WHATSAPP_BOOKING_API_KEY;
      delete process.env.WHATSAPP_BOOKING_API_URL;
    });

    it("cleans inventory independently when payment recovery needs attention", async () => {
      const f = await fixture("full");
      const q = await service.quoteAmendment("guest", f.id, {
        ...f.input,
        durationMinutes: 180,
      });
      const a = await service.createAmendment(
        "guest",
        f.id,
        { quoteId: q.quoteId },
        "independent-expiry",
      );
      await db
        .collection("bookings")
        .doc(f.id)
        .collection("amendments")
        .doc(a.id)
        .update({ expiresAt: Timestamp.fromMillis(0) });
      await db
        .collection("bookings")
        .doc(f.id)
        .update({ backgroundAttention: { payments: true } });
      expect((await service.expireAmendments(f.id)).failures).toEqual([]);
      expect(
        (await service.readAttempt("guest", f.id, a.id)).amendment.status,
      ).toBe("expired");
      expect(
        (await db.collection("bookings").doc(f.id).get()).get(
          "amendmentPending",
        ),
      ).toBe(false);
    });
    it("preserves a saved zero-commission arrangement", async () => {
      const f = await fixture();
      const { captureAgreement } = await import("@/lib/booking-finance/domain");
      await db
        .collection("bookingFinanceAgreementsV1")
        .doc(f.id)
        .set(
          captureAgreement(
            f.id,
            f.b,
            "owner",
            [],
            { marketplaceCommission: false },
            {},
            0,
            0,
          ),
        );
      const q = await service.quoteAmendment("guest", f.id, {
        ...f.input,
        durationMinutes: 180,
      });
      await service.createAmendment(
        "guest",
        f.id,
        { quoteId: q.quoteId },
        "no-commission",
      );
      expect(
        (await db.collection("bookingFinanceAgreementsV1").doc(f.id).get()).get(
          "activeAccommodationAgreement.commissionPaise",
        ),
      ).toBe(0);
    });
    it("edits overnight dates while keeping the booking mode and whole-stay minimum", async () => {
      const f = await fixture();
      const rate = `${f.id}_night`;
      roots.push({ collection: "ratePlans", id: rate });
      await db.collection("ratePlans").doc(rate).set({
        propertyId: f.propertyId,
        roomTypeId: f.input.roomTypeId,
        name: "Nightly",
        status: "active",
        bookingMode: "overnight",
        pricingModel: "nightly",
        basePricePaise: 100000,
        paymentMode: "pay_at_property",
      });
      const tomorrow = new Date(Date.parse(f.input.checkIn) + 86400000)
          .toISOString()
          .slice(0, 10),
        later = new Date(Date.parse(f.input.checkIn) + 2 * 86400000)
          .toISOString()
          .slice(0, 10);
      const created = await bookings.createBooking(
        "guest",
        {
          ...f.input,
          ratePlanId: rate,
          bookingMode: "overnight",
          checkOut: tomorrow,
          propertySlug: f.propertyId,
          paymentMethod: "pay_at_property",
          leadEmail: f.input.bookingContact.email,
          leadPhone: f.input.bookingContact.phone,
          adultGuestNames: ["Test Guest"],
        },
        `night_${f.id}`,
      );
      const proposal = { ...f.input, ratePlanId: rate, checkOut: later };
      const q = await service.quoteAmendment(
        "guest",
        created.bookingId,
        proposal,
      );
      expect(q.accepted.totalPaise).toBe(200000);
      await service.createAmendment(
        "guest",
        created.bookingId,
        { quoteId: q.quoteId },
        "night-edit",
      );
      const saved = (
        await db.collection("bookings").doc(created.bookingId).get()
      ).data()!;
      expect(saved.nights).toBe(2);
      expect(saved.bookingMode).toBe("overnight");
    });
    it("routes a signed old-order webhook by immutable mapping when provider notes are absent", async () => {
      const f = await fixture("full", true);
      const q = await service.quoteAmendment("guest", f.id, {
        ...f.input,
        arrivalTime: "11:00",
      });
      await service.createAmendment(
        "guest",
        f.id,
        { quoteId: q.quoteId },
        "webhook-old",
      );
      const payment = {
        id: `pay_${randomUUID()}`,
        order_id: f.b.razorpayOrderId,
        amount: 200000,
        currency: "INR",
        status: "captured",
        captured: true,
      };
      captures.set(payment.id, payment);
      const { createHmac } = await import("node:crypto");
      process.env.RAZORPAY_WEBHOOK_SECRET = "amendment_webhook_test";
      const { POST } = await import("@/app/api/webhooks/razorpay/route");
      const body = JSON.stringify({
        event: "payment.captured",
        payload: {
          payment: { entity: { id: payment.id, order_id: payment.order_id } },
        },
      });
      const request = new Request("http://localhost/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "x-razorpay-signature": createHmac(
            "sha256",
            process.env.RAZORPAY_WEBHOOK_SECRET,
          )
            .update(body)
            .digest("hex"),
        },
        body,
      });
      expect((await POST(request, undefined)).status).toBe(200);
      expect(
        (await db.collection("bookings").doc(f.id).get()).get("bookingStatus"),
      ).toBe("pending_payment");
      expect(
        (await db.collection("refunds").where("bookingId", "==", f.id).get())
          .size,
      ).toBe(1);
    });
    it("excludes original paid service allocations from accommodation credit", async () => {
      const f = await fixture("full");
      const request = {
        id: "original-extra",
        offeringId: "old",
        name: "Original service",
        agreementVersion: 2,
        settlement: "included",
        totalPaise: 50000,
        status: "fulfilled",
      };
      await db
        .collection("bookings")
        .doc(f.id)
        .update({
          extrasTotalPaise: 50000,
          totalPaise: 250000,
          paidPaise: 250000,
          customizations: [request],
        });
      await db
        .collection("paymentAttempts")
        .doc(f.b.razorpayPaymentId!)
        .update({ amountPaise: 250000, serviceAmountPaise: 50000 });
      const q = await service.quoteAmendment("guest", f.id, {
        ...f.input,
        durationMinutes: 180,
      });
      expect(q.creditPaise).toBe(200000);
      expect(q.amountToCollectPaise).toBe(50000);
      expect(q.serviceBalances.paidPaise).toBe(50000);
    });
    it("keeps a cancelled service blocked until its refund is reconciled", async () => {
      const f = await fixture();
      const request = {
        id: "cancelled-extra",
        offeringId: "old",
        name: "Cancelled service",
        agreementVersion: 2,
        settlement: "paid",
        totalPaise: 0,
        status: "cancelled",
      };
      await db
        .collection("bookings")
        .doc(f.id)
        .update({
          customizations: [request],
          stayPaymentReceipts: [
            {
              requestId: request.id,
              quoteVersion: 1,
              paymentId: "service-capture",
              orderId: "service-order",
              amountPaise: 1000,
              status: "refund_pending",
              scope: "Cancelled service",
            },
          ],
        });
      const q = await service.quoteAmendment("guest", f.id, {
        ...f.input,
        arrivalTime: "11:00",
      });
      expect(q.serviceImpacts[0].reasons).toContain(
        "Service refund is being reconciled",
      );
      await expect(
        service.createAmendment(
          "guest",
          f.id,
          { quoteId: q.quoteId },
          "pending-service-refund",
        ),
      ).rejects.toThrow("SERVICE_CONFLICT");
    });
    it("requires a fresh checkout after a fully refunded current order and never reuses it", async () => {
      const f = await fixture("full", true);
      await db
        .collection("bookings")
        .doc(f.id)
        .update({ paymentReplacementUnresolved: true });
      const payment = {
        id: `pay_${randomUUID()}`,
        order_id: f.b.razorpayOrderId,
        amount: 200000,
        currency: "INR",
        status: "captured",
        captured: true,
      };
      captures.set(payment.id, payment);
      expect(
        await bookings.confirmPaidBooking(f.id, {
          actorId: "guest",
          orderId: payment.order_id!,
          paymentId: payment.id,
          source: "customer_verify",
        }),
      ).toBe(false);
      const refunds = await db
        .collection("refunds")
        .where("bookingId", "==", f.id)
        .get();
      const { processRefund } = await import("@/lib/booking/processing");
      providerFetch.mockResolvedValueOnce(
        Response.json({
          id: "refund_current",
          payment_id: payment.id,
          amount: 200000,
          currency: "INR",
          status: "processed",
        }),
      );
      await processRefund(refunds.docs[0].id);
      captures.set(payment.id, { ...payment, status: "refunded" });
      const { reconcilePaymentForGuest } = await import(
        "@/lib/booking/recovery"
      );
      const check = await reconcilePaymentForGuest("guest", f.id);
      expect(check.paymentEligible).toBe(false);
      expect(check.replacementEligible).toBe(true);
      const q = await service.quoteAmendment("guest", f.id, f.input);
      const a = await service.createAmendment(
        "guest",
        f.id,
        { quoteId: q.quoteId },
        "fresh-after-refund",
      );
      expect(a.status).toBe("applied");
      const saved = (await db.collection("bookings").doc(f.id).get()).data()!;
      expect(saved.razorpayOrderId).not.toBe(f.b.razorpayOrderId);
      expect(saved.checkoutNeedsReplacement).toBe(false);
      expect(saved.paidPaise).toBe(200000);
      expect(saved.refundedPaise).toBe(200000);
    });
    it("carries a compatible scheduled service unchanged when extending only checkout", async () => {
      const f = await fixture();
      const when = new Date(Date.parse(f.b.startAt) + 1800000).toISOString();
      const request = {
        id: "unchanged",
        offeringId: "unlisted",
        name: "Compatible service",
        agreementVersion: 2,
        settlement: "paid",
        totalPaise: 0,
        unitPricePaise: 0,
        quantity: 1,
        pricingUnit: "item",
        status: "confirmed",
        preparationStarted: true,
        deadlineAt: new Date(Date.parse(f.b.startAt) - 3600000).toISOString(),
        inputs: { serviceAt: when },
      };
      await db
        .collection("bookings")
        .doc(f.id)
        .update({ customizations: [request] });
      const q = await service.quoteAmendment("guest", f.id, {
        ...f.input,
        durationMinutes: 180,
      });
      expect(q.serviceImpacts).toEqual([]);
      await service.createAmendment(
        "guest",
        f.id,
        { quoteId: q.quoteId },
        "compatible-service",
      );
      expect(
        (await db.collection("bookings").doc(f.id).get()).get(
          "customizations",
        )[0].inputs.serviceAt,
      ).toBe(when);
    });
    it("synchronizes accepted guest counts, every occupant, legacy names and booking contact without changing ownership", async () => {
      const f = await fixture();
      const proposal = {
        ...f.input,
        adults: 2,
        children: 1,
        infants: 1,
        occupants: [
          { name: "First Adult", ageGroup: "adult" },
          { name: "Second Adult", ageGroup: "adult" },
          { name: "Child Guest", ageGroup: "child" },
          { name: "Infant Guest", ageGroup: "infant" },
        ],
        bookingContact: {
          name: "Reservation Contact",
          email: "new@example.com",
          phone: "+919876543211",
        },
      };
      const q = await service.quoteAmendment("guest", f.id, proposal);
      await service.createAmendment(
        "guest",
        f.id,
        { quoteId: q.quoteId },
        "guest-counts",
      );
      const saved = (await db.collection("bookings").doc(f.id).get()).data()!;
      expect([saved.adults, saved.children, saved.infants]).toEqual([2, 1, 1]);
      expect(saved.occupants).toEqual(proposal.occupants);
      expect(saved.leadGuest.adultGuestNames).toEqual([
        "First Adult",
        "Second Adult",
      ]);
      expect(saved.leadGuest.email).toBe("new@example.com");
      expect(saved.guestId).toBe("guest");
      expect(saved.leadGuest.adultAadhaarLastFour).toBeNull();
      const options = await service.editOptions("guest", f.id);
      expect(options.current.adults).toBe(2);
      expect(options.current.occupants).toHaveLength(4);
    });
    it("allows names and contact after the stay cutoff and updates hotel search representations", async () => {
      const f = await fixture();
      await db
        .collection("bookings")
        .doc(f.id)
        .update({ "editPolicy.cutoffHours": 144 });
      await expect(
        service.quoteAmendment("guest", f.id, f.input),
      ).rejects.toThrow("EDITING_CLOSED");
      await service.patchGuests("guest", f.id, {
        revision: 0,
        stayRevision: 0,
        occupants: [{ name: "Renamed Guest", ageGroup: "adult" }],
        bookingContact: {
          ...f.input.bookingContact,
          email: "revised@example.com",
        },
      });
      const saved = (await db.collection("bookings").doc(f.id).get()).data()!;
      expect(saved.leadGuest.name).toBe("Renamed Guest");
      expect(saved.searchTokens).toContain("renamed");
      expect(saved.guestId).toBe("guest");
      expect(saved.totalPaise).toBe(200000);
    });
    it("moves to a snapshotted equivalent category and releases the previous physical assignment", async () => {
      const f = await fixture();
      const room = `${f.id}_new_room`,
        rate = `${f.id}_new_rate`,
        unit = `${f.id}_unit`;
      await db.collection("roomTypes").doc(room).set({
        propertyId: f.propertyId,
        status: "active",
        name: "Superior",
        totalInventory: 1,
        maxAdults: 2,
        maxChildren: 1,
      });
      await db
        .collection("ratePlans")
        .doc(rate)
        .set({
          propertyId: f.propertyId,
          roomTypeId: room,
          status: "active",
          name: "Equivalent",
          bookingMode: "hourly",
          pricingModel: "duration",
          durationPrices: [{ hours: 2, pricePaise: 250000 }],
          paymentMode: "full",
        });
      roots.push(
        { collection: "roomTypes", id: room },
        { collection: "ratePlans", id: rate },
        { collection: "physicalUnits", id: unit },
      );
      await db.collection("physicalUnits").doc(unit).set({
        propertyId: f.propertyId,
        roomTypeId: f.input.roomTypeId,
        status: "active",
        label: "101",
      });
      const hold = (
        await db.collection("inventoryHolds").doc(f.id).get()
      ).data()!;
      for (const a of hold.allocations) {
        const calendar = `${unit}_${a.date}`;
        roots.push({ collection: "physicalUnitCalendars", id: calendar });
        await db
          .collection("physicalUnitCalendars")
          .doc(calendar)
          .set({
            propertyId: f.propertyId,
            unitId: unit,
            date: a.date,
            slots: Object.fromEntries(
              a.intervals.map((k: string) => [k, f.id]),
            ),
          });
      }
      await db
        .collection("bookings")
        .doc(f.id)
        .update({
          "editPolicy.equivalentRatePlanIds": [rate],
          physicalUnitId: unit,
          physicalUnitLabel: "101",
          physicalAllocations: hold.allocations,
        });
      const q = await service.quoteAmendment("guest", f.id, {
        ...f.input,
        roomTypeId: room,
        ratePlanId: rate,
      });
      expect(q.amountToCollectPaise).toBe(0);
      await service.createAmendment(
        "guest",
        f.id,
        { quoteId: q.quoteId },
        "category",
      );
      const saved = (await db.collection("bookings").doc(f.id).get()).data()!;
      expect(saved.roomType.id).toBe(room);
      expect(saved.physicalUnitId).toBeNull();
      expect(saved.paymentMode).toBe("pay_at_property");
      expect(saved.totalPaise).toBe(250000);
      for (const a of hold.allocations)
        expect(
          Object.values(
            (
              await db
                .collection("physicalUnitCalendars")
                .doc(`${unit}_${a.date}`)
                .get()
            ).get("slots"),
          ),
        ).not.toContain(f.id);
      expect(
        (await db.collection("inventoryHolds").doc(f.id).get()).get(
          "roomTypeId",
        ),
      ).toBe(room);
    });
  },
);
