import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const provider = vi.hoisted(() => vi.fn());
vi.mock("@/lib/providers/http", () => ({ providerFetch: provider }));

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  "stay customization transactions (isolated Firestore emulator)",
  () => {
    let db: typeof import("@/lib/firebase/admin").adminDb;
    let bookings: typeof import("@/lib/bookings");
    let stay: typeof import("@/lib/stay/service");
    const properties: string[] = [];
    const owner = `stay-owner-${crypto.randomUUID()}`;
    beforeAll(async () => {
      process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-bookings";
      process.env.RAZORPAY_KEY_ID = "test_key";
      process.env.RAZORPAY_KEY_SECRET = "test_secret";
      db = (await import("@/lib/firebase/admin")).adminDb;
      bookings = await import("@/lib/bookings");
      stay = await import("@/lib/stay/service");
      await db
        .collection("users")
        .doc(owner)
        .set({ roles: ["partner"], isActive: true, accountStatus: "active" });
    }, 30000);
    afterAll(async () => {
      await db?.collection("users").doc(owner).delete();
      await db?.terminate();
    });
    afterEach(async () => {
      provider.mockReset();
      for (const propertyId of properties.splice(0)) {
        const rows = await db
          .collection("bookings")
          .where("propertyId", "==", propertyId)
          .get();
        for (const row of rows.docs) {
          await db.recursiveDelete(row.ref);
        }
        for (const c of [
          "refunds",
          "paymentAttempts",
          "bookingReferences",
          "inventoryHolds",
          "inventoryCalendars",
          "bookingNotificationOutbox",
          "propertyMemberships",
          "ratePlans",
          "roomTypes",
          "cancellationPolicies",
        ]) {
          const records = await db
            .collection(c)
            .where("propertyId", "==", propertyId)
            .get();
          for (const row of records.docs) await row.ref.delete();
        }
        await db.recursiveDelete(db.collection("properties").doc(propertyId));
      }
    }, 30000);
    async function fixture(paid = false, mixed = false) {
      const id = `stay_${crypto.randomUUID()}`;
      properties.push(id);
      const checkIn = new Date(Date.now() + 3 * 86400000)
        .toISOString()
        .slice(0, 10);
      const checkOut = new Date(Date.now() + 4 * 86400000)
        .toISOString()
        .slice(0, 10);
      await db
        .collection("properties")
        .doc(id)
        .set({
          slug: id,
          name: "Stay test hotel",
          status: "active",
          approvalStatus: "approved",
          isBookable: true,
          currency: "INR",
          timezone: "Asia/Kolkata",
          bookingModes: ["overnight", "hourly"],
          inventoryEngine: "interval_v1",
        });
      await db.collection("roomTypes").doc(`${id}_room`).set({
        propertyId: id,
        status: "active",
        name: "Room",
        totalInventory: 20,
        maxAdults: 2,
        maxChildren: 0,
      });
      await db.collection("cancellationPolicies").doc(`${id}_policy`).set({
        propertyId: id,
        status: "active",
        name: "Flexible",
        description: "Free cancellation",
        refundableUntilHours: 24,
        cancellationFeePercent: 0,
      });
      await db
        .collection("ratePlans")
        .doc(`${id}_rate`)
        .set({
          propertyId: id,
          roomTypeId: `${id}_room`,
          status: "active",
          bookingMode: "overnight",
          basePricePaise: 100000,
          paymentMode: paid ? "deposit" : "pay_at_property",
          depositBasisPoints: 2500,
          cancellationPolicyId: `${id}_policy`,
        });
      await db.collection("propertyMemberships").doc(`${id}_${owner}`).set({
        propertyId: id,
        userId: owner,
        role: "owner",
        status: "active",
      });
      const free = {
        propertyId: id,
        version: 1,
        name: "Extra pillows",
        description: "Comfortable extra pillows",
        kind: "item",
        travelerCategories: ["Family"],
        roomTypeIds: [],
        bookingModes: ["overnight", "hourly"],
        unitPricePaise: 0,
        maxQuantity: 3,
        advanceNoticeMinutes: 60,
        confirmation: "approval",
        variants: [],
        status: "active",
      };
      await db
        .collection("properties")
        .doc(id)
        .collection("stayCustomizations")
        .doc("pillows")
        .set(free);
      await db
        .collection("properties")
        .doc(id)
        .collection("stayCustomizations")
        .doc("decoration")
        .set({
          ...free,
          name: "Room decoration",
          kind: "service",
          unitPricePaise: mixed ? 99999 : 20000,
          variants: mixed
            ? [
                { id: "premium", name: "Premium", unitPricePaise: 20000 },
                { id: "simple", name: "Simple", unitPricePaise: 0 },
              ]
            : [],
        });
      const input = {
        propertySlug: id,
        roomTypeId: `${id}_room`,
        ratePlanId: `${id}_rate`,
        checkIn,
        checkOut,
        adults: 1,
        paymentMethod: paid ? "online" : "pay_at_property",
        leadEmail: "guest@example.com",
        leadPhone: "+919876543210",
        adultGuestNames: ["Guest Name"],
        travelerPreferences: ["Family"],
        customizationSelections: [
          { offeringId: "pillows", variantId: null, quantity: 1 },
          {
            offeringId: "decoration",
            variantId: mixed ? "premium" : null,
            quantity: 1,
          },
          ...(mixed
            ? [{ offeringId: "decoration", variantId: "simple", quantity: 1 }]
            : []),
        ],
      };
      if (paid)
        provider.mockResolvedValueOnce(Response.json({ id: `order_${id}` }));
      const created = await bookings.createBooking("guest", input, id);
      const ref = db.collection("bookings").doc(created.bookingId);
      if (paid) {
        provider.mockResolvedValueOnce(
          Response.json({
            id: `pay_${id}`,
            order_id: `order_${id}`,
            status: "captured",
            captured: true,
            amount: 45000,
            currency: "INR",
          }),
        );
        await bookings.confirmPaidBooking(created.bookingId, {
          actorId: "guest",
          orderId: `order_${id}`,
          paymentId: `pay_${id}`,
          source: "test",
        });
      }
      const body = {
        revision: 0,
        expectedArrivalLocal: `${checkIn}T15:00`,
        notes: "Arriving by train",
        travelerPreferences: ["Family"],
        selections: [{ offeringId: "pillows", variantId: null, quantity: 1 }],
        submit: true,
        guestsReviewed: true,
      };
      return { id, input, ref, created, body, free };
    }
    it("snapshots extras, preserves the room deposit, and replays the same booking", async () => {
      const { input, ref, id } = await fixture(true, true);
      const b = (await ref.get()).data()!;
      expect(b).toMatchObject({
        totalPaise: 120000,
        payableNowPaise: 45000,
        roomTotalPaise: 100000,
        extrasTotalPaise: 20000,
        bookingStatus: "confirmed",
        paidPaise: 45000,
      });
      expect((await bookings.createBooking("guest", input, id)).bookingId).toBe(
        ref.id,
      );
      await db
        .collection("properties")
        .doc(id)
        .collection("stayCustomizations")
        .doc("decoration")
        .update({
          name: "Renamed",
          unitPricePaise: 99999,
          status: "paused",
          version: 2,
        });
      const saved = (await ref.get()).get("customizations");
      expect(
        saved.find(
          (r: { offeringId: string }) => r.offeringId === "decoration",
        ),
      ).toMatchObject({ name: "Room decoration", unitPricePaise: 20000 });
    }, 30000);
    it("allows free siblings of retained paid variants and checks shared limits", async () => {
      const { ref, body, id } = await fixture(true);
      const catalog = db
        .collection("properties")
        .doc(id)
        .collection("stayCustomizations")
        .doc("decoration");
      await catalog.update({
        variants: [
          { id: "paid", name: "Premium", unitPricePaise: 25000 },
          { id: "free", name: "Simple", unitPricePaise: 0 },
        ],
        maxQuantity: 2,
      });
      const old = (await ref.get()).get("customizations");
      await ref.update({
        customizations: old.map((r: { offeringId: string }) =>
          r.offeringId === "decoration"
            ? { ...r, variantId: "paid", maxQuantity: 2 }
            : r,
        ),
      });
      expect(
        (await stay.guestStayOptions("guest", ref.id)).offerings.some(
          (o) => o.id === "decoration",
        ),
      ).toBe(true);
      await stay.savePreCheckin("guest", ref.id, {
        ...body,
        selections: [
          ...body.selections,
          { offeringId: "decoration", variantId: "free", quantity: 1 },
        ],
      });
      const saved = (await ref.get()).get("customizations");
      expect(
        saved.find((r: { variantId: string }) => r.variantId === "paid"),
      ).toMatchObject({ unitPricePaise: 20000, totalPaise: 20000 });
      expect(
        saved.find((r: { variantId: string }) => r.variantId === "free"),
      ).toMatchObject({ unitPricePaise: 0, totalPaise: 0 });
      await expect(
        stay.savePreCheckin("guest", ref.id, {
          ...body,
          revision: 1,
          selections: [
            ...body.selections,
            { offeringId: "decoration", variantId: "free", quantity: 2 },
          ],
        }),
      ).rejects.toThrow("at most 2");
      await catalog.update({
        variants: [{ id: "paid", name: "Premium", unitPricePaise: 0 }],
      });
      await expect(
        stay.savePreCheckin("guest", ref.id, {
          ...body,
          revision: 1,
          selections: [
            ...body.selections,
            { offeringId: "decoration", variantId: "free", quantity: 2 },
          ],
        }),
      ).rejects.toThrow("increase");
    }, 30000);
    it("submits arrival details using existing guests and enforces revision conflicts", async () => {
      const { ref, body } = await fixture();
      await expect(stay.savePreCheckin("other", ref.id, body)).rejects.toThrow(
        "NOT_FOUND",
      );
      await stay.savePreCheckin("guest", ref.id, body);
      expect((await ref.get()).data()).toMatchObject({
        stayRevision: 1,
        preCheckin: { status: "submitted", notes: "Arriving by train" },
      });
      await expect(stay.savePreCheckin("guest", ref.id, body)).rejects.toThrow(
        "CONFLICT",
      );
      const b = await bookings.bookingForGuest("guest", ref.id);
      expect(b.guestNames).toEqual(["Guest Name"]);
      expect(JSON.stringify(b)).not.toContain("adultAadhaarLastFour");
    }, 30000);
    it("blocks new paid extras, closed arrivals, invalid arrival times and unreviewed submissions", async () => {
      const { ref, body } = await fixture();
      await expect(
        stay.savePreCheckin("guest", ref.id, {
          ...body,
          guestsReviewed: false,
        }),
      ).rejects.toThrow("Review your guest");
      await expect(
        stay.savePreCheckin("guest", ref.id, {
          ...body,
          expectedArrivalLocal: "2020-01-01T15:00",
        }),
      ).rejects.toThrow("upcoming arrival");
      // Existing paid selections are immutable, and attempts to submit them again are rejected.
      await expect(
        stay.savePreCheckin("guest", ref.id, {
          ...body,
          selections: [
            ...body.selections,
            { offeringId: "decoration", variantId: null, quantity: 2 },
          ],
        }),
      ).rejects.toThrow("Contact the hotel");
      await ref.update({ bookingStatus: "checked_in" });
      await expect(stay.savePreCheckin("guest", ref.id, body)).rejects.toThrow(
        "closed",
      );
    }, 30000);
    it("retains paused commitments but rejects increases, preparation edits and recreation", async () => {
      const { ref, body, id } = await fixture();
      await db
        .collection("properties")
        .doc(id)
        .collection("stayCustomizations")
        .doc("pillows")
        .update({ status: "paused" });
      await stay.savePreCheckin("guest", ref.id, body);
      await expect(
        stay.savePreCheckin("guest", ref.id, {
          ...body,
          revision: 1,
          selections: [{ offeringId: "pillows", variantId: null, quantity: 2 }],
        }),
      ).rejects.toThrow("increase");
      const r = (await ref.get())
        .get("customizations")
        .find((r: { offeringId: string }) => r.offeringId === "pillows");
      await stay.updateStayRequest(owner, ref.id, {
        revision: 1,
        requestId: r.id,
        status: "confirmed",
      });
      await stay.updateStayRequest(owner, ref.id, {
        revision: 2,
        requestId: r.id,
        status: "preparing",
      });
      await expect(
        stay.savePreCheckin("guest", ref.id, {
          ...body,
          revision: 3,
          selections: [],
        }),
      ).rejects.toThrow("can no longer be changed");
      await expect(
        stay.savePreCheckin("guest", ref.id, {
          ...body,
          revision: 3,
          selections: [{ offeringId: "pillows", variantId: null, quantity: 2 }],
        }),
      ).rejects.toThrow("can no longer be changed");
    }, 30000);
    it("refunds declined paid extras once, without increasing the room balance", async () => {
      const { ref } = await fixture(true, true);
      const r = (await ref.get())
        .get("customizations")
        .find((r: { offeringId: string }) => r.offeringId === "decoration");
      await expect(
        stay.updateStayRequest("intruder", ref.id, {
          revision: 0,
          requestId: r.id,
          status: "declined",
          response: "Unavailable",
        }),
      ).rejects.toThrow("FORBIDDEN");
      await expect(
        stay.updateStayRequest(owner, ref.id, {
          revision: 0,
          requestId: r.id,
          status: "declined",
        }),
      ).rejects.toThrow("Explain");
      const input = {
        revision: 0,
        requestId: r.id,
        status: "declined",
        response: "Decoration team unavailable",
      };
      const results = await Promise.allSettled([
        stay.updateStayRequest(owner, ref.id, input),
        stay.updateStayRequest(owner, ref.id, input),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const b = await bookings.bookingForGuest("guest", ref.id);
      expect(b).toMatchObject({
        totalPaise: 120000,
        effectiveTotalPaise: 100000,
        balanceDuePaise: 75000,
        refundDuePaise: 20000,
        customizationCreditPaise: 20000,
        bookingStatus: "confirmed",
      });
      expect(
        (await db.collection("refunds").where("bookingId", "==", ref.id).get())
          .size,
      ).toBe(1);
      await bookings.cancelBookingForUser("guest", ref.id);
      const refunds = await db
        .collection("refunds")
        .where("bookingId", "==", ref.id)
        .get();
      expect(
        refunds.docs.reduce((sum, d) => sum + d.get("amountPaise"), 0),
      ).toBe(45000);
      expect((await ref.get()).get("refundDuePaise")).toBe(45000);
    }, 30000);
    it("credits an unpaid declined extra without creating an online refund", async () => {
      const { ref } = await fixture();
      const r = (await ref.get())
        .get("customizations")
        .find((r: { offeringId: string }) => r.offeringId === "decoration");
      await stay.updateStayRequest(owner, ref.id, {
        revision: 0,
        requestId: r.id,
        status: "declined",
        response: "Unavailable",
      });
      expect(await bookings.bookingForGuest("guest", ref.id)).toMatchObject({
        effectiveTotalPaise: 100000,
        balanceDuePaise: 100000,
        refundDuePaise: 0,
      });
      expect(
        (await db.collection("refunds").where("bookingId", "==", ref.id).get())
          .empty,
      ).toBe(true);
    }, 30000);

    it("reopens hotel approval for a changed free quantity and locks its deadline", async () => {
      const { ref, body } = await fixture();
      const r = (await ref.get())
        .get("customizations")
        .find((r: { offeringId: string }) => r.offeringId === "pillows");
      await stay.updateStayRequest(owner, ref.id, {
        revision: 0,
        requestId: r.id,
        status: "confirmed",
      });
      await stay.savePreCheckin("guest", ref.id, {
        ...body,
        revision: 1,
        submit: false,
        selections: [{ offeringId: "pillows", variantId: null, quantity: 2 }],
      });
      let b = (await ref.get()).data()!;
      expect(b.preCheckin.status).toBe("incomplete");
      expect(
        b.customizations.find((c: { id: string }) => c.id === r.id),
      ).toMatchObject({ quantity: 2, status: "requested" });
      await ref.update({
        customizations: b.customizations.map((c: { id: string }) =>
          c.id === r.id
            ? { ...c, deadlineAt: new Date(Date.now() - 1).toISOString() }
            : c,
        ),
      });
      await expect(
        stay.savePreCheckin("guest", ref.id, {
          ...body,
          revision: 2,
          selections: [],
        }),
      ).rejects.toThrow("can no longer be changed");
      b = (await ref.get()).data()!;
      await ref.update({
        startAt: null,
        endAt: null,
        customizations: b.customizations,
      });
      expect(await stay.guestStayOptions("guest", ref.id)).toMatchObject({
        editable: true,
      });
    }, 30000);

    it("processes a customization refund once without closing the reservation", async () => {
      const { ref } = await fixture(true, true);
      const before = (await ref.get()).data()!;
      const r = before.customizations.find(
        (r: { offeringId: string }) => r.offeringId === "decoration",
      );
      await stay.updateStayRequest(owner, ref.id, {
        revision: 0,
        requestId: r.id,
        status: "declined",
        response: "Team unavailable",
      });
      const refund = (
        await db.collection("refunds").where("bookingId", "==", ref.id).get()
      ).docs[0];
      provider.mockResolvedValueOnce(
        Response.json({
          id: "rf_stay",
          payment_id: before.razorpayPaymentId,
          amount: 20000,
          currency: "INR",
          status: "processed",
        }),
      );
      const { processRefund } = await import("@/lib/booking/processing");
      await processRefund(refund.id);
      await processRefund(refund.id);
      expect(await bookings.bookingForGuest("guest", ref.id)).toMatchObject({
        bookingStatus: "confirmed",
        refundedPaise: 20000,
        refundDuePaise: 0,
        balanceDuePaise: 75000,
        effectiveTotalPaise: 100000,
      });
    }, 30000);

    it("serializes decline versus cancellation without duplicate or excess refunds", async () => {
      const { ref } = await fixture(true, true);
      const r = (await ref.get())
        .get("customizations")
        .find((r: { offeringId: string }) => r.offeringId === "decoration");
      await Promise.allSettled([
        stay.updateStayRequest(owner, ref.id, {
          revision: 0,
          requestId: r.id,
          status: "declined",
          response: "Unavailable",
        }),
        bookings.cancelBookingForUser("guest", ref.id),
      ]);
      const refunds = await db
        .collection("refunds")
        .where("bookingId", "==", ref.id)
        .get();
      expect(
        refunds.docs.reduce((sum, d) => sum + d.get("amountPaise"), 0),
      ).toBe(45000);
      expect(
        (await ref.get())
          .get("customizations")
          .every((r: { status: string }) =>
            ["declined", "cancelled"].includes(r.status),
          ),
      ).toBe(true);
    }, 30000);
    it("preserves omitted variant prices and clears overrides explicitly or on preference conversion", async () => {
      const { id, free } = await fixture();
      const input = Object.fromEntries(
        Object.entries(free).filter(
          ([key]) => !["propertyId", "version"].includes(key),
        ),
      );
      const offering = {
        ...input,
        variants: [{ id: "stable", name: "Choice", unitPricePaise: 12345 }],
      };
      await stay.saveOffering(owner, id, {
        id: "pillows",
        version: 1,
        offering,
      });
      await stay.saveOffering(owner, id, {
        id: "pillows",
        version: 2,
        offering: {
          ...offering,
          variants: [{ id: "stable", name: "Renamed" }],
        },
      });
      const catalog = db
        .collection("properties")
        .doc(id)
        .collection("stayCustomizations")
        .doc("pillows");
      expect((await catalog.get()).get("variants")[0]).toMatchObject({
        id: "stable",
        unitPricePaise: 12345,
      });
      await stay.saveOffering(owner, id, {
        id: "pillows",
        version: 3,
        offering: {
          ...offering,
          variants: [{ id: "stable", name: "Renamed", unitPricePaise: null }],
        },
      });
      expect(
        (await catalog.get()).get("variants")[0].unitPricePaise,
      ).toBeNull();
      await stay.saveOffering(owner, id, {
        id: "pillows",
        version: 4,
        offering,
      });
      await stay.saveOffering(owner, id, {
        id: "pillows",
        version: 5,
        offering: {
          ...input,
          kind: "preference",
          variants: [{ id: "stable", name: "Choice" }],
        },
      });
      expect(
        (await catalog.get()).get("variants")[0].unitPricePaise,
      ).toBeNull();
    }, 30000);
    it("lets an owner edit offerings while rejecting cross-property rooms and stale versions", async () => {
      const { id, free } = await fixture();
      const offering = Object.fromEntries(
        Object.entries(free).filter(
          ([key]) => !["propertyId", "version"].includes(key),
        ),
      );
      await expect(
        stay.saveOffering("intruder", id, { offering }),
      ).rejects.toThrow("FORBIDDEN");
      await expect(
        stay.saveOffering(owner, id, {
          offering: { ...offering, roomTypeIds: ["foreign-room"] },
        }),
      ).rejects.toThrow("belonging");
      await stay.saveOffering(owner, id, {
        id: "pillows",
        version: 1,
        offering: { ...offering, name: "Soft pillows" },
      });
      await expect(
        stay.saveOffering(owner, id, { id: "pillows", version: 1, offering }),
      ).rejects.toThrow("CONFLICT");
      await stay.saveOffering(owner, id, {
        id: "pillows",
        version: 2,
        offering: { ...offering, category: "room_essentials" },
      });
      await stay.saveOffering(owner, id, {
        id: "pillows",
        version: 3,
        offering,
      });
      const catalog = db
        .collection("properties")
        .doc(id)
        .collection("stayCustomizations")
        .doc("pillows");
      expect((await catalog.get()).get("category")).toBe("room_essentials");
      await stay.saveOffering(owner, id, {
        id: "pillows",
        version: 4,
        offering: { ...offering, category: "devices" },
      });
      expect((await catalog.get()).get("category")).toBe("devices");
    }, 30000);
  },
);
