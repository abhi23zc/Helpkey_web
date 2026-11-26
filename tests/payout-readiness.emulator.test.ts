import { beforeAll, afterAll, describe, it, expect } from "vitest";
const safe = /^(127\.0\.0\.1|localhost):\d+$/.test(
  process.env.FIRESTORE_EMULATOR_HOST ?? "",
);
describe.skipIf(!safe)(
  "private payout readiness transactions",
  { timeout: 60000 },
  () => {
    let db: typeof import("@/lib/firebase/admin").adminDb,
      s: typeof import("@/lib/payout-readiness/service");
    const prefix = `ready-${crypto.randomUUID()}`,
      hotel = `${prefix}-hotel`,
      admin = `${prefix}-admin`,
      owner = `${prefix}-owner`,
      staff = `${prefix}-staff`,
      next = `${prefix}-next`,
      inactive = `${prefix}-inactive`;
    const account = {
      holderName: "Fixture Owner",
      accountNumber: "001234567890",
      confirmation: "001234567890",
      ifsc: "HDFC0001234",
      bankName: "Fixture Bank",
    };
    const policy = {
      commissionBasisPoints: 1000,
      commissionBasis: "rooms",
      marketplaceCommission: true,
      directCommission: false,
      walkInCommission: false,
      payoutCycle: "daily",
      payoutDelayDays: 0,
      minimumPayoutPaise: 0,
    };
    const profile = {
      businessName: "Fixture Company",
      businessEmail: "fixture@example.test",
      businessPhone: "+919876543210",
      businessAddress: {
        line1: "123 Fixture Road",
        line2: null,
        landmark: null,
        district: null,
        city: "Pune",
        state: "Maharashtra",
        postalCode: "411001",
        countryCode: "IN",
      },
    };
    const read = () => s.readReadiness(admin, hotel);
    const command = async (
      body: Record<string, unknown>,
      uid = admin,
      asOwner = false,
    ) =>
      s.readinessCommand(
        uid,
        hotel,
        {
          expectedVersion: (await read()).version,
          requestId: crypto.randomUUID(),
          ...body,
        },
        asOwner,
      );
    beforeAll(async () => {
      process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-finance";
      delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
      delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
      process.env.HOTEL_BANK_ENCRYPTION_KEY = "ab".repeat(32);
      db = (await import("@/lib/firebase/admin")).adminDb;
      s = await import("@/lib/payout-readiness/service");
      for (const uid of [admin, owner, staff, next, inactive])
        await db
          .collection("users")
          .doc(uid)
          .set({
            roles: [uid === admin || uid === inactive ? "admin" : "partner"],
            accountStatus: "active",
            isActive: uid !== inactive,
          });
      await db
        .collection("properties")
        .doc(hotel)
        .set({
          ownerId: owner,
          name: "Fixture Hotel",
          timezone: "Asia/Kolkata",
        });
      await db.collection("partnerProfiles").doc(owner).set(profile);
      await db
        .collection("hotelFinanceSettingsV1")
        .doc(`hotel_${hotel}`)
        .set({ settings: policy });
      for (const [uid, role] of [
        [owner, "owner"],
        [staff, "manager"],
        [next, "owner"],
      ])
        await db
          .collection("propertyMemberships")
          .doc(`${hotel}_${uid}`)
          .set({ role, status: "active" });
    });
    afterAll(async () => {
      for (const collection of [
        "properties",
        "hotelPrivateBanksV1",
        "hotelPayoutReadinessV1",
      ])
        await db.recursiveDelete(db.collection(collection).doc(hotel));
      await db.recursiveDelete(
        db.collection("hotelFinanceSettingsV1").doc(`hotel_${hotel}`),
      );
      await db.recursiveDelete(db.collection("partnerProfiles").doc(owner));
      for (const uid of [admin, owner, staff, next, inactive]) {
        await db.collection("users").doc(uid).delete();
        await db
          .collection("propertyMemberships")
          .doc(`${hotel}_${uid}`)
          .delete();
      }
      delete process.env.HOTEL_BANK_ENCRYPTION_KEY;
    });
    it("uses the existing profile without requiring invoice configuration", async () => {
      expect(await read()).toMatchObject({
        business: { source: "profile", businessName: profile.businessName },
        complete: { business: true, bank: false, commercial: true },
        status: "Setup incomplete",
        next: "bank",
      });
    });
    it("enforces staff, inactive admin, cross-hotel and current-owner access", async () => {
      await expect(s.readReadiness(staff, hotel, true)).rejects.toMatchObject({
        status: 403,
      });
      await expect(s.readReadiness(inactive, hotel)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        s.readReadiness(owner, `${hotel}-other`, true),
      ).rejects.toMatchObject({ status: 403 });
      await expect(s.readReadiness(next, hotel, true)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        command(
          { action: "review", section: "bank", note: "Owner cannot review" },
          owner,
          true,
        ),
      ).rejects.toMatchObject({ status: 403 });
    });
    it("saves encrypted strings, supports explicit reveal, and recovers duplicate requests", async () => {
      const input = {
        action: "bank",
        bank: account,
        expectedVersion: (await read()).version,
        requestId: crypto.randomUUID(),
      };
      const result = await s.readinessCommand(owner, hotel, input, true);
      expect(await s.readinessCommand(owner, hotel, input, true)).toEqual(
        result,
      );
      await expect(
        s.readinessCommand(
          owner,
          hotel,
          { ...input, bank: { ...account, bankName: "Other Bank" } },
          true,
        ),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      const view = await read();
      expect(view.bank?.maskedAccount).toBe("•••• 7890");
      const raw = (
        await db.collection(s.bankCollection).doc(hotel).get()
      ).data();
      expect(JSON.stringify(raw)).not.toContain(account.accountNumber);
      expect(JSON.stringify(view)).not.toContain(account.accountNumber);
      expect(
        await s.revealBank(
          owner,
          hotel,
          { expectedBankVersion: view.bankVersion },
          true,
        ),
      ).toEqual({ accountNumber: account.accountNumber });
      for (const uid of [staff, next])
        await expect(
          s.revealBank(
            uid,
            hotel,
            { expectedBankVersion: view.bankVersion },
            true,
          ),
        ).rejects.toMatchObject({ status: 403 });
    });
    it("marks reviews, preserves no-op bank reviews and invalidates real bank changes", async () => {
      for (const section of ["business", "bank", "commercial"])
        await command({
          action: "review",
          section,
          note: "External check completed",
        });
      const ready = await read();
      expect(ready.status).toBe("Ready for payouts");
      expect(await command({ action: "bank", bank: account })).toEqual({
        changed: false,
      });
      expect((await read()).version).toBe(ready.version);
      await command({
        action: "bank",
        bank: { ...account, bankName: "Updated Fixture Bank" },
      });
      const changed = await read();
      expect(changed).toMatchObject({
        status: "Needs admin review",
        next: "bank",
        reviewed: { bank: false, business: true, commercial: true },
      });
      await expect(
        s.revealBank(admin, hotel, { expectedBankVersion: ready.bankVersion }),
      ).rejects.toMatchObject({ status: 409 });
      const history = await db
        .collection(s.reviewCollection)
        .doc(hotel)
        .collection("bankHistory")
        .get();
      expect(history.size).toBe(2);
      expect(JSON.stringify(history.docs.map((d) => d.data()))).not.toContain(
        account.accountNumber,
      );
    });
    it("retains review on unrelated finance settings and invalidates relevant effective/inheritance changes", async () => {
      const config = db
        .collection("hotelFinanceSettingsV1")
        .doc(`hotel_${hotel}`);
      await config.update({ "settings.duesGraceDays": 3 });
      expect((await read()).reviewed?.commercial).toBe(true);
      await config.update({ "settings.payoutDelayDays": 3 });
      expect((await read()).reviewed?.commercial).toBe(false);
      await command({
        action: "review",
        section: "commercial",
        note: "Confirm new terms",
      });
      await config.update({ "settings.payoutCycle": "weekly" });
      expect((await read()).complete?.commercial).toBe(false);
      await config.update({ "settings.payoutWeekday": "monday" });
      expect((await read()).complete?.commercial).toBe(true);
    });
    it("updates the original shared profile, rejects stale drafts and serializes concurrent save/review", async () => {
      const stale = await read();
      await command({
        action: "profile",
        profile: { ...profile, businessName: "Changed Company" },
      });
      expect(
        (await db.collection("partnerProfiles").doc(owner).get()).get(
          "businessName",
        ),
      ).toBe("Changed Company");
      expect((await read()).reviewed?.business).toBe(false);
      await expect(
        s.readinessCommand(admin, hotel, {
          action: "profile",
          profile,
          expectedVersion: stale.version,
          requestId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "READINESS_CONFLICT" });
      const expectedVersion = (await read()).version;
      const results = await Promise.allSettled([
        s.readinessCommand(admin, hotel, {
          action: "review",
          section: "bank",
          note: "External check",
          expectedVersion,
          requestId: crypto.randomUUID(),
        }),
        s.readinessCommand(
          owner,
          hotel,
          {
            action: "bank",
            bank: { ...account, bankName: "Concurrent Bank" },
            expectedVersion,
            requestId: crypto.randomUUID(),
          },
          true,
        ),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    });
    it("edits configured invoice identity while preserving issuance locks and unrelated settings", async () => {
      const config = db
        .collection("properties")
        .doc(hotel)
        .collection("invoiceConfiguration")
        .doc("current");
      const settings = {
        country: "IN",
        legalName: "Invoice Company",
        address: "Fixture address",
        state: "Maharashtra",
        stateCode: "27",
        contact: "office@example.test",
        registration: "unregistered",
        gstin: "",
        irpRequired: false,
        accountantConfirmed: true,
        invoiceSeries: "INV",
        creditSeries: "CR",
        invoiceStart: 1,
        creditStart: 1,
        signatory: "Owner",
        signatoryDesignation: "Owner",
        footer: "Preserve me",
      };
      await config.set({ settings, revision: 1, used: true });
      const v = await read();
      expect(v.business?.source).toBe("invoice");
      await command({
        action: "invoice",
        identity: {
          ...v.invoiceIdentity,
          legalName: "Updated Invoice Company",
        },
      });
      expect((await config.get()).get("settings.footer")).toBe("Preserve me");
      await command({
        action: "review",
        section: "business",
        note: "Invoice identity checked",
      });
      await config.update({ "settings.footer": "Updated footer" });
      expect((await read()).reviewed?.business).toBe(true);
      await expect(
        command({
          action: "invoice",
          identity: {
            ...(await read()).invoiceIdentity,
            registration: "exempt",
          },
        }),
      ).rejects.toMatchObject({ code: "INVOICE_REVIEW_REQUIRED" });
      await config.update({ "settings.contact": "changed@example.test" });
      expect((await read()).reviewed?.business).toBe(false);
    });
    it("disables storage/reveal without an encryption key while keeping readiness readable", async () => {
      delete process.env.HOTEL_BANK_ENCRYPTION_KEY;
      try {
        expect((await read()).storageAvailable).toBe(false);
        await expect(
          command({ action: "bank", bank: account }),
        ).rejects.toMatchObject({ code: "BANK_STORAGE_UNAVAILABLE" });
        await expect(
          s.revealBank(admin, hotel, {
            expectedBankVersion: (await read()).bankVersion,
          }),
        ).rejects.toMatchObject({ code: "BANK_STORAGE_UNAVAILABLE" });
      } finally {
        process.env.HOTEL_BANK_ENCRYPTION_KEY = "ab".repeat(32);
      }
    });
    it("binds reviews and private bank access to current ownership", async () => {
      await db.collection("properties").doc(hotel).update({ ownerId: next });
      const v = await s.readReadiness(next, hotel, true);
      expect(v.bank).toBeNull();
      expect((await read()).reviewed).toEqual({
        bank: false,
        business: false,
        commercial: false,
      });
      await expect(s.readReadiness(owner, hotel, true)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        s.revealBank(next, hotel, { expectedBankVersion: v.bankVersion }, true),
      ).rejects.toMatchObject({ status: 409 });
    });
  },
);
