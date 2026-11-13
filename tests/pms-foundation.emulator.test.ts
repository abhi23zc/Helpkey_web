import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
const safe =
  /^(127\.0\.0\.1|localhost):\d+$/.test(
    process.env.FIRESTORE_EMULATOR_HOST || "",
  ) &&
  /^(127\.0\.0\.1|localhost):\d+$/.test(
    process.env.FIREBASE_AUTH_EMULATOR_HOST || "",
  );
describe.skipIf(!safe)(
  "PMS foundation with isolated Firestore and Auth",
  () => {
    let db: typeof import("@/lib/firebase/admin").adminDb;
    let auth: typeof import("@/lib/firebase/admin").adminAuth;
    let access: typeof import("@/lib/partner/pms/access");
    let setup: typeof import("@/lib/partner/pms/setup");
    let team: typeof import("@/lib/partner/pms/team");
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
      access = await import("@/lib/partner/pms/access");
      setup = await import("@/lib/partner/pms/setup");
      team = await import("@/lib/partner/pms/team");
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
    it("preserves owner access and independently derives readiness from saved information", async () => {
      const owner = await user("partner"),
        a = await hotel(owner.uid),
        b = await hotel(owner.uid);
      expect(
        (await access.operationalAccess(owner.uid, a, "reservation.read")).role,
      ).toBe("owner");
      expect((await setup.setupStatus(owner.uid, a)).state).toBe(
        "not_activated",
      );
      await setup.updatePms(owner.uid, a, { action: "activate" });
      expect((await setup.setupStatus(owner.uid, a)).state).toBe("setup");
      expect((await setup.setupStatus(owner.uid, b)).state).toBe(
        "not_activated",
      );
      expect((await ready(owner.uid, a)).state).toBe("ready");
      await setup.updatePms(owner.uid, a, {
        action: "declaration",
        openingData: "external",
        teamReviewed: true,
      });
      expect((await setup.setupStatus(owner.uid, a)).state).toBe("setup");
      await ready(owner.uid, a);
      await db
        .collection("physicalUnits")
        .doc(`${a}-unit`)
        .update({ status: "inactive" });
      expect((await setup.setupStatus(owner.uid, a)).state).toBe("setup");
      expect(
        (await db.collection("roomTypes").doc(`${a}-room`).get()).get(
          "totalInventory",
        ),
      ).toBe(1);
    });
    it("keeps large historical hotels usable and verifies drift explicitly", async () => {
      const owner = await user("partner"),
        id = await hotel(owner.uid);
      for (let offset = 0; offset < 2001; offset += 200) {
        const batch = db.batch();
        for (let n = offset; n < Math.min(2001, offset + 200); n++) {
          batch.set(db.collection("bookings").doc(`${id}-old-${n}`), {
            propertyId: id,
            bookingStatus: "checked_out",
            inventoryReleased: true,
            createdAt: Timestamp.fromMillis(n),
          });
          batch.set(db.collection("inventoryCalendars").doc(`${id}_old_${n}`), {
            propertyId: id,
            roomTypeId: `${id}-room`,
            reserved: {},
            blocked: {},
          });
        }
        await batch.commit();
      }
      expect((await ready(owner.uid, id)).state).toBe("ready");
      expect(
        (await access.operationalAccess(owner.uid, id, "reservation.operate"))
          .role,
      ).toBe("owner");
      const orphan = db.collection("inventoryCalendars").doc(`${id}_orphan`);
      await orphan.set({
        propertyId: id,
        roomTypeId: `${id}-room`,
        reserved: { "1": 1 },
      });
      // Normal authorization doesn't rescan history. Explicit verification detects it.
      expect((await setup.setupStatus(owner.uid, id)).state).toBe("ready");
      expect(
        (await setup.updatePms(owner.uid, id, { action: "verify" })).state,
      ).toBe("setup");
      await expect(
        access.operationalAccess(owner.uid, id, "reservation.create"),
      ).rejects.toMatchObject({ status: 409 });
      await orphan.delete();
      expect(
        (await setup.updatePms(owner.uid, id, { action: "verify" })).state,
      ).toBe("ready");
    }, 60000);
    it("finds old cashier balances, pages paid candidates, and binds cursors to account and hotel", async () => {
      const owner = await user("partner"),
        cashier = await user("partner");
      const id = await hotel(owner.uid),
        foreign = await hotel(owner.uid);
      await ready(owner.uid, id);
      await db
        .collection("propertyMemberships")
        .doc(`${id}_${cashier.uid}`)
        .set({
          propertyId: id,
          userId: cashier.uid,
          role: "cashier",
          status: "active",
        });
      const batch = db.batch();
      for (let n = 0; n < 65; n++)
        batch.set(db.collection("bookings").doc(`${id}-paid-${n}`), {
          propertyId: id,
          bookingStatus: "checked_out",
          inventoryReleased: true,
          totalPaise: 10000,
          paidPaise: 10000,
          createdAt: Timestamp.fromMillis(n + 2),
        });
      const old = `${id}-old-balance`;
      batch.set(db.collection("bookings").doc(old), {
        propertyId: id,
        confirmationCode: "OLDCASH123",
        bookingStatus: "checked_out",
        inventoryReleased: true,
        totalPaise: 10000,
        paidPaise: 0,
        createdAt: Timestamp.fromMillis(1),
        leadGuest: { name: "Older guest", phone: "PRIVATE-PHONE" },
      });
      batch.set(db.collection("bookings").doc(`${foreign}-booking`), {
        propertyId: foreign,
        confirmationCode: "FOREIGN123",
        totalPaise: 10000,
      });
      await batch.commit();
      const { cashierBookings } = await import("@/lib/partner/pms/cashier");
      const first = await cashierBookings(cashier.uid, id, {});
      expect(first.bookings).toEqual([]);
      expect(first.hasMore).toBe(true);
      const second = await cashierBookings(cashier.uid, id, {
        cursor: first.nextCursor,
      });
      expect(second.bookings.map((b) => b.id)).toEqual([old]);
      expect(second.hasMore).toBe(false);
      expect(
        (
          await cashierBookings(cashier.uid, id, { q: "oldcash123" })
        ).bookings.map((b) => b.id),
      ).toEqual([old]);
      expect(
        (await cashierBookings(cashier.uid, id, { q: old })).bookings.map(
          (b) => b.id,
        ),
      ).toEqual([old]);
      expect(
        (await cashierBookings(cashier.uid, id, { q: "FOREIGN123" })).bookings,
      ).toEqual([]);
      expect(JSON.stringify(second)).not.toMatch(
        /PRIVATE-PHONE|leadGuest|razorpay/,
      );
      await expect(
        cashierBookings(cashier.uid, foreign, {}),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        cashierBookings(owner.uid, id, { cursor: first.nextCursor }),
      ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
      await expect(
        cashierBookings(cashier.uid, id, { cursor: "tampered" }),
      ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    });
    it("accepts email-bound invitations, discovers assigned hotels and enforces changed/revoked permissions", async () => {
      const owner = await user("partner"),
        employee = await user(),
        stranger = await user(),
        a = await hotel(owner.uid),
        b = await hotel(owner.uid);
      await ready(owner.uid, a);
      const invite = await team.manageTeam(owner.uid, a, {
        action: "invite",
        email: employee.email,
        role: "receptionist",
      });
      await expect(
        team.acceptInvitation(
          stranger.uid,
          invite.invitationId!,
          invite.token!,
        ),
      ).rejects.toMatchObject({ status: 403 });
      await team.acceptInvitation(
        employee.uid,
        invite.invitationId!,
        invite.token!,
      );
      await team.acceptInvitation(
        employee.uid,
        invite.invitationId!,
        invite.token!,
      );
      expect(
        (await access.operationalAccess(employee.uid, a, "reservation.operate"))
          .role,
      ).toBe("receptionist");
      await expect(
        access.propertyAccess(employee.uid, b),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        access.operationalAccess(employee.uid, a, "payment.refund"),
      ).rejects.toMatchObject({ status: 403 });
      const { loadPartnerShell } = await import("@/lib/services/partner-shell"),
        { getUserByUid } = await import("@/lib/auth/users");
      expect(
        (
          await loadPartnerShell((await getUserByUid(employee.uid))!)
        ).properties.map((p) => p.id),
      ).toEqual([a]);
      await team.manageTeam(owner.uid, a, {
        action: "role",
        userId: employee.uid,
        role: "cashier",
      });
      await expect(
        access.propertyAccess(employee.uid, a, "reservation.read"),
      ).rejects.toMatchObject({ status: 403 });
      expect(
        (await access.operationalAccess(employee.uid, a, "payment.collect"))
          .role,
      ).toBe("cashier");
      await team.manageTeam(owner.uid, a, {
        action: "revoke",
        userId: employee.uid,
      });
      await expect(
        access.operationalAccess(employee.uid, a, "payment.collect"),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        team.acceptInvitation(
          employee.uid,
          invite.invitationId!,
          invite.token!,
        ),
      ).rejects.toMatchObject({ status: 409 });
      const history = await team.listTeam(owner.uid, a);
      expect(history.events.map((e) => e.type)).toContain("team_revoke");
      expect(
        history.members.find((m) => m.userId === employee.uid)?.status,
      ).toBe("revoked");
      expect(JSON.stringify(history)).not.toContain(invite.token);
    });
    it("rejects expired, cancelled and unverified invitations and protects ownership", async () => {
      const owner = await user("partner"),
        employee = await user(),
        unverified = await user("customer", false),
        id = await hotel(owner.uid);
      const invite = await team.manageTeam(owner.uid, id, {
        action: "invite",
        email: employee.email,
        role: "housekeeper",
      });
      await team.manageTeam(owner.uid, id, {
        action: "cancel",
        invitationId: invite.invitationId,
      });
      await expect(
        team.acceptInvitation(
          employee.uid,
          invite.invitationId!,
          invite.token!,
        ),
      ).rejects.toMatchObject({ status: 409 });
      const expired = await team.manageTeam(owner.uid, id, {
        action: "invite",
        email: employee.email,
        role: "maintenance",
      });
      await db
        .collection("propertyInvitations")
        .doc(expired.invitationId!)
        .update({ expiresAt: Timestamp.fromMillis(1) });
      await expect(
        team.acceptInvitation(
          employee.uid,
          expired.invitationId!,
          expired.token!,
        ),
      ).rejects.toMatchObject({ status: 409 });
      const pending = await team.manageTeam(owner.uid, id, {
        action: "invite",
        email: unverified.email,
        role: "cashier",
      });
      await expect(
        team.acceptInvitation(
          unverified.uid,
          pending.invitationId!,
          pending.token!,
        ),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        team.manageTeam(owner.uid, id, { action: "revoke", userId: owner.uid }),
      ).rejects.toMatchObject({ status: 409 });
    });
    it("continues internal bookings during owner pause, but keeps public and admin restrictions effective", async () => {
      const owner = await user("partner"),
        id = await hotel(owner.uid);
      await ready(owner.uid, id);
      const day = new Date(Date.now() + 3 * 86400000)
          .toISOString()
          .slice(0, 10),
        end = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
      const input = {
        propertySlug: id,
        roomTypeId: `${id}-room`,
        ratePlanId: `${id}-rate`,
        bookingMode: "overnight" as const,
        checkIn: day,
        checkOut: end,
        adults: 1,
        children: 0,
        infants: 0,
      };
      await setup.updatePms(owner.uid, id, {
        action: "marketplace",
        paused: true,
      });
      expect((await setup.setupStatus(owner.uid, id)).state).toBe("ready");
      await expect(bookings.quote(input)).rejects.toThrow(
        "PROPERTY_NOT_AVAILABLE",
      );
      const manual = await bookings.createManualReservation(
        owner.uid,
        { ...input, propertyId: id, guestName: "Test Guest" },
        crypto.randomUUID(),
      );
      expect(
        (await db.collection("bookings").doc(manual.id).get()).get(
          "bookingStatus",
        ),
      ).toBe("confirmed");
      await expect(
        bookings.bookingForGuest(owner.uid, manual.id),
      ).rejects.toThrow("BOOKING_NOT_FOUND");
      await setup.updatePms(owner.uid, id, { action: "disable" });
      await expect(
        access.operationalAccess(owner.uid, id, "reservation.operate"),
      ).rejects.toMatchObject({ status: 409 });
      await db.collection("properties").doc(id).update({
        "pms.adminDisabled": true,
        "pms.adminReason": "Test administrative block",
      });
      await expect(
        setup.updatePms(owner.uid, id, { action: "resume" }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        setup.updatePms(owner.uid, id, {
          action: "marketplace",
          paused: false,
        }),
      ).rejects.toMatchObject({ status: 403 });
    });
  },
);
