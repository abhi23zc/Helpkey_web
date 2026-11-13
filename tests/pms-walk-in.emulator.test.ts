import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
const safe =
  /^(127\.0\.0\.1|localhost):\d+$/.test(
    process.env.FIRESTORE_EMULATOR_HOST || "",
  ) &&
  /^(127\.0\.0\.1|localhost):\d+$/.test(
    process.env.FIREBASE_AUTH_EMULATOR_HOST || "",
  );
describe.skipIf(!safe)(
  "PMS Phase 2A isolated transactions",
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

    it("creates an evening walk-in with separate identities, retry protection, explicit check-in and verified linking", async () => {
      const clock = vi
        .spyOn(Date, "now")
        .mockReturnValue(Date.parse("2026-11-14T14:30:00Z"));
      try {
        const owner = await user("partner"),
          customer = await user(),
          wrong = await user(),
          id = await hotel(owner.uid);
        await ready(owner.uid, id);
        const raw = {
          propertyId: id,
          roomTypeId: `${id}-room`,
          ratePlanId: `${id}-rate`,
          checkIn: "2026-11-14",
          checkOut: "2026-11-15",
          adults: 2,
          guestName: "Priya Sharma",
          accompanyingGuests: [{ name: "Ravi Sharma", ageGroup: "adult" }],
          bookingContact: {
            name: "Travel Booker",
            email: "booker@example.test",
            phone: "+919876543210",
          },
          reservationPurpose: "walk_in",
          recordedArrivalTime: "20:00",
        };
        const key = crypto.randomUUID();
        const [result, duplicate] = await Promise.all([
          bookings.createManualReservation(owner.uid, raw, key),
          bookings.createManualReservation(owner.uid, raw, key),
        ]);
        expect(duplicate.id).toBe(result.id);
        expect(
          (await bookings.createManualReservation(owner.uid, raw, key)).id,
        ).toBe(result.id);
        const ref = db.collection("bookings").doc(result.id),
          b = (await ref.get()).data()!;
        expect(b.guestId).toBeNull();
        expect(b.createdByStaffId).toBe(owner.uid);
        expect(b.bookingStatus).toBe("confirmed");
        expect(b.leadGuest.adultGuestNames).toEqual([
          "Priya Sharma",
          "Ravi Sharma",
        ]);
        expect(b.bookingContact.name).toBe("Travel Booker");
        expect(b.registrationIncomplete).toBe(false);
        expect(b.actualCheckInAt).toBeUndefined();
        await expect(
          bookings.bookingForGuest(owner.uid, result.id),
        ).rejects.toThrow("BOOKING_NOT_FOUND");
        const guests = await import("@/lib/partner/guests/service");
        const invitation = await guests.issueCustomerLink(
          owner.uid,
          result.id,
          {
            action: "invite",
            email: customer.email,
          },
        );
        await expect(
          guests.acceptCustomerLink(wrong.uid, result.id, {
            token: invitation.token,
            accept: true,
          }),
        ).rejects.toMatchObject({ status: 403 });
        await guests.acceptCustomerLink(customer.uid, result.id, {
          token: invitation.token,
          accept: false,
        });
        expect((await ref.get()).get("guestId")).toBeNull();
        await guests.acceptCustomerLink(customer.uid, result.id, {
          token: invitation.token,
          accept: true,
        });
        await guests.acceptCustomerLink(customer.uid, result.id, {
          token: invitation.token,
          accept: true,
        });
        expect(
          (await bookings.bookingForGuest(customer.uid, result.id)).id,
        ).toBe(result.id);
        clock.mockReturnValue(Date.parse("2026-11-14T14:40:00Z"));
        await bookings.transitionBooking(result.id, owner.uid, "checked_in");
        const { processBookingNotifications } =
          await import("@/lib/booking/notifications");
        expect(
          (await processBookingNotifications(`${result.id}_checked_in`))
            .failures,
        ).toEqual([]);
        expect(
          (
            await db
              .collection("notifications")
              .doc(`${result.id}_checked_in_${customer.uid}`)
              .get()
          ).exists,
        ).toBe(true);
        expect(
          (
            await db
              .collection("notifications")
              .doc(`${result.id}_checked_in_${wrong.uid}`)
              .get()
          ).exists,
        ).toBe(false);
        expect(
          (await ref.get()).get("actualCheckInAt").toDate().toISOString(),
        ).toBe("2026-11-14T14:30:00.000Z");
        expect(
          (
            await db
              .collection("inventoryHolds")
              .where("propertyId", "==", id)
              .get()
          ).size,
        ).toBe(1);
        await bookings.transitionBooking(result.id, owner.uid, "checked_out");
        expect((await ref.get()).get("bookingStatus")).toBe("checked_out");
      } finally {
        clock.mockRestore();
      }
    });
    it("permits only one competing reservation for the final room and leaves future telephone reservations confirmed", async () => {
      const clock = vi
        .spyOn(Date, "now")
        .mockReturnValue(Date.parse("2026-11-14T14:30:00Z"));
      try {
        const owner = await user("partner"),
          id = await hotel(owner.uid);
        await ready(owner.uid, id);
        const raw = {
          propertyId: id,
          roomTypeId: `${id}-room`,
          ratePlanId: `${id}-rate`,
          checkIn: "2026-11-15",
          checkOut: "2026-11-16",
          adults: 2,
          guestName: "Lead Adult",
          reservationPurpose: "reservation",
        };
        const results = await Promise.allSettled([
          bookings.createManualReservation(owner.uid, raw, crypto.randomUUID()),
          bookings.createManualReservation(owner.uid, raw, crypto.randomUUID()),
        ]);
        const winners = results.filter((r) => r.status === "fulfilled");
        expect(winners.length).toBe(1);
        const records = await db
          .collection("bookings")
          .where("propertyId", "==", id)
          .get();
        expect(records.size).toBe(1);
        const b = records.docs[0].data();
        expect(b.bookingStatus).toBe("confirmed");
        expect(b.registrationIncomplete).toBe(true);
        expect(b.leadGuest.adultGuestNames).toEqual(["Lead Adult"]);
        const guests = await import("@/lib/partner/guests/service");
        await guests.guestRegistration(owner.uid, records.docs[0].id, {
          revision: 0,
          occupants: [
            { name: "Lead Adult", ageGroup: "adult" },
            { name: "Different Adult", ageGroup: "adult" },
          ],
        });
        expect(
          (await records.docs[0].ref.get()).get("registrationIncomplete"),
        ).toBe(false);
        await expect(
          guests.guestRegistration(owner.uid, records.docs[0].id, {
            revision: 0,
            occupants: [{ name: "Stale Edit", ageGroup: "adult" }],
          }),
        ).rejects.toMatchObject({ status: 409 });
      } finally {
        clock.mockRestore();
      }
    });
    it("retains historical manual records and refuses automatic claiming or identity rewriting", async () => {
      const owner = await user("partner"),
        customer = await user(),
        id = await hotel(owner.uid);
      await ready(owner.uid, id);
      const ref = db.collection("bookings").doc(`${id}-legacy`);
      await ref.set({
        propertyId: id,
        source: "manual_partner",
        guestId: owner.uid,
        createdBy: owner.uid,
        adults: 2,
        leadGuest: {
          name: "Old Name",
          adultGuestNames: ["Old Name", "Old Name"],
        },
        paidPaise: 12345,
      });
      const guests = await import("@/lib/partner/guests/service");
      expect(
        (await guests.guestRegistration(owner.uid, ref.id)).identityVersion,
      ).toBe(1);
      await expect(
        guests.issueCustomerLink(owner.uid, ref.id, {
          action: "invite",
          email: customer.email,
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        guests.guestRegistration(owner.uid, ref.id, {
          revision: 0,
          occupants: [{ name: "Replacement", ageGroup: "adult" }],
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect((await ref.get()).get("paidPaise")).toBe(12345);
      expect((await ref.get()).get("guestId")).toBe(owner.uid);
    });
    it("rejects cancelled, expired and unverified customer invitations without changing ownership", async () => {
      const owner = await user("partner"),
        customer = await user(),
        unverified = await user("customer", false),
        id = await hotel(owner.uid);
      await ready(owner.uid, id);
      const guests = await import("@/lib/partner/guests/service");
      const ref = db.collection("bookings").doc(`${id}-link-test`);
      await ref.set({
        propertyId: id,
        identityVersion: 2,
        source: "manual_partner",
        guestId: null,
        linkedCustomerId: null,
        leadGuest: { name: "Actual Guest" },
        confirmationCode: "LINKTEST",
        checkIn: "2027-01-01",
        checkOut: "2027-01-02",
        propertyName: "Test",
      });
      let invitation = await guests.issueCustomerLink(owner.uid, ref.id, {
        action: "invite",
        email: customer.email,
      });
      const preview = await guests.guestRegistration(owner.uid, ref.id);
      expect(preview.customerInvitation).toMatchObject({
        status: "pending",
        email: customer.email,
      });
      expect(JSON.stringify(preview)).not.toContain(invitation.token);
      expect(JSON.stringify(preview)).not.toContain("tokenHash");
      await guests.issueCustomerLink(owner.uid, ref.id, { action: "cancel" });
      expect(
        (await guests.guestRegistration(owner.uid, ref.id)).customerInvitation
          ?.status,
      ).toBe("cancelled");
      await expect(
        guests.acceptCustomerLink(customer.uid, ref.id, {
          token: invitation.token,
          accept: true,
        }),
      ).rejects.toMatchObject({ status: 403 });
      invitation = await guests.issueCustomerLink(owner.uid, ref.id, {
        action: "invite",
        email: customer.email,
      });
      await ref
        .collection("customerLinks")
        .doc("current")
        .update({ expiresAt: Timestamp.fromMillis(1) });
      expect(
        (await guests.guestRegistration(owner.uid, ref.id)).customerInvitation
          ?.status,
      ).toBe("expired");
      await expect(
        guests.acceptCustomerLink(customer.uid, ref.id, {
          token: invitation.token,
          accept: true,
        }),
      ).rejects.toMatchObject({ status: 409 });
      invitation = await guests.issueCustomerLink(owner.uid, ref.id, {
        action: "invite",
        email: unverified.email,
      });
      await expect(
        guests.acceptCustomerLink(unverified.uid, ref.id, {
          token: invitation.token,
          accept: true,
        }),
      ).rejects.toMatchObject({ status: 403 });
      expect((await ref.get()).get("guestId")).toBeNull();
    });
    it("requires a fresh review when departure policy changes without a price change", async () => {
      const clock = vi
        .spyOn(Date, "now")
        .mockReturnValue(Date.parse("2026-11-14T14:30:00Z"));
      try {
        const owner = await user("partner"),
          id = await hotel(owner.uid);
        await ready(owner.uid, id);
        const raw = {
          propertyId: id,
          roomTypeId: `${id}-room`,
          ratePlanId: `${id}-rate`,
          checkIn: "2026-11-16",
          checkOut: "2026-11-17",
          adults: 1,
          guestName: "Actual Guest",
          reservationPurpose: "reservation",
        };
        const preview = await bookings.quoteManualReservation(owner.uid, raw);
        await db
          .collection("properties")
          .doc(id)
          .update({ checkOutTime: "12:00" });
        await expect(
          bookings.createManualReservation(
            owner.uid,
            {
              ...raw,
              expectedStartAt: preview.startAt,
              expectedEndAt: preview.endAt,
              expectedTimezone: preview.timezone,
            },
            crypto.randomUUID(),
          ),
        ).rejects.toThrow("QUOTE_CHANGED");
        expect(
          (
            await db
              .collection("inventoryHolds")
              .where("propertyId", "==", id)
              .get()
          ).size,
        ).toBe(0);
        const fresh = await bookings.quoteManualReservation(owner.uid, raw);
        expect(fresh.totalPaise).toBe(preview.totalPaise);
        expect(fresh.endAt).not.toBe(preview.endAt);
        const saved = await bookings.createManualReservation(
          owner.uid,
          {
            ...raw,
            expectedStartAt: fresh.startAt,
            expectedEndAt: fresh.endAt,
            expectedTimezone: fresh.timezone,
          },
          crypto.randomUUID(),
        );
        expect(
          (await db.collection("bookings").doc(saved.id).get()).get("endAt"),
        ).toBe(fresh.endAt);
      } finally {
        clock.mockRestore();
      }
    });
  },
);
