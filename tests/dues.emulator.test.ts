import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { accountingFixture } from "./helpers/accounting";
import {
  processAccounting,
  readEvidence,
  journalCollection,
  stateCollection,
  summary,
} from "@/lib/accounting/posting";
import { hash } from "@/lib/accounting/domain";
import type { Confirmation } from "@/lib/dues/service";
import { receiptEventId } from "@/lib/dues/domain";
const safe = /^(127\.0\.0\.1|localhost):\d+$/.test(
  process.env.FIRESTORE_EMULATOR_HOST ?? "",
);
describe.skipIf(!safe)(
  "isolated hotel dues payments",
  { timeout: 60000 },
  () => {
    let db: typeof import("@/lib/firebase/admin").adminDb,
      service: typeof import("@/lib/dues/service");
    const prefix = `dues-${crypto.randomUUID()}`,
      hotel = `${prefix}-hotel`,
      otherHotel = `${prefix}-other`,
      admin = `${prefix}-admin`,
      second = `${prefix}-second`,
      owner = `${prefix}-owner`,
      staff = `${prefix}-staff`,
      stranger = `${prefix}-stranger`,
      ids: string[] = [];
    beforeAll(async () => {
      process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-finance";
      delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
      delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
      process.env.HOTEL_ACCOUNTING_START_AT = "2026-01-01T00:00:00Z";
      process.env.BACKGROUND_MODE = "legacy";
      db = (await import("@/lib/firebase/admin")).adminDb;
      service = await import("@/lib/dues/service");
      for (const uid of [admin, second, owner, staff, stranger])
        await db
          .collection("users")
          .doc(uid)
          .set({
            roles: [uid === admin || uid === second ? "admin" : "partner"],
            accountStatus: "active",
            isActive: true,
          });
      for (const h of [hotel, otherHotel])
        await db
          .collection("properties")
          .doc(h)
          .set({
            name: h,
            ownerId: h === hotel ? owner : stranger,
            timezone: "Asia/Kolkata",
            status: "active",
          });
      for (const [uid, role] of [
        [owner, "owner"],
        [staff, "manager"],
      ])
        await db
          .collection("propertyMemberships")
          .doc(`${hotel}_${uid}`)
          .set({ propertyId: hotel, userId: uid, role, status: "active" });
      await db
        .collection("hotelFinanceSettingsV1")
        .doc(`hotel_${hotel}`)
        .set({
          revision: 8,
          settings: {
            commissionBasisPoints: 9999,
            minimumPayoutPaise: 0,
            payoutCycle: "daily",
            duesLimit: { type: "limited", amountPaise: 10000 },
            duesWarningPaise: 5000,
            duesGraceDays: 7,
          },
        });
    });
    afterAll(async () => {
      for (const bookingId of ids) {
        for (const name of [
          journalCollection,
          "paymentAttempts",
          "propertyPayments",
          "refunds",
        ]) {
          const records = await db
            .collection(name)
            .where("bookingId", "==", bookingId)
            .get();
          await Promise.all(records.docs.map((d) => db.recursiveDelete(d.ref)));
        }
        for (const name of [
          "bookings",
          "bookingFinanceAgreementsV1",
          stateCollection,
        ])
          await db.recursiveDelete(db.collection(name).doc(bookingId));
        for (const name of ["projectionOutbox", "projectionJobs"]) {
          const records = await db
            .collection(name)
            .where("entityId", "==", bookingId)
            .get();
          await Promise.all(records.docs.map((d) => db.recursiveDelete(d.ref)));
        }
      }
      for (const name of Object.values(service.collections)) {
        const records = await db
          .collection(name)
          .where("propertyId", "==", hotel)
          .get();
        await Promise.all(records.docs.map((d) => db.recursiveDelete(d.ref)));
      }
      for (const name of ["hotelPayoutsV1", "hotelPayoutRequestsV1"]) {
        const records = await db
          .collection(name)
          .where("propertyId", "==", hotel)
          .get();
        await Promise.all(records.docs.map((d) => db.recursiveDelete(d.ref)));
      }
      for (const bookingId of ids)
        for (const name of [
          "hotelPayoutAssessmentsV1",
          "hotelPayoutReservationsV1",
        ])
          await db.recursiveDelete(db.collection(name).doc(bookingId));
      const accountingRequests = await db
        .collection("hotelAccountingRequestsV1")
        .where("actorId", "==", admin)
        .get();
      await Promise.all(accountingRequests.docs.map((d) => d.ref.delete()));
      for (const uid of [owner, staff])
        await db
          .collection("propertyMemberships")
          .doc(`${hotel}_${uid}`)
          .delete();
      for (const uid of [admin, second, owner, staff, stranger])
        await db.collection("users").doc(uid).delete();
      for (const h of [hotel, otherHotel])
        await db.collection("properties").doc(h).delete();
      await db
        .collection("hotelFinanceSettingsV1")
        .doc(`hotel_${hotel}`)
        .delete();
      delete process.env.HOTEL_ACCOUNTING_START_AT;
    });
    async function fixture(rate = 1000, completed = true, online = 0) {
      const bookingId = `${prefix}-${String(ids.length).padStart(3, "0")}`;
      ids.push(bookingId);
      const f = accountingFixture(
        online,
        210000 - online,
        completed,
        rate,
        bookingId,
        hotel,
      );
      f.b.actualCheckOutAt = "2026-11-24T00:00:00.000Z";
      f.agreement.terms.effective.payoutDelayDays = 0;
      const batch = db.batch();
      batch.set(db.collection("bookings").doc(bookingId), f.b);
      batch.set(
        db.collection("bookingFinanceAgreementsV1").doc(bookingId),
        f.agreement,
      );
      if (f.proof)
        batch.set(
          db
            .collection("bookingFinanceAgreementsV1")
            .doc(bookingId)
            .collection("proofs")
            .doc("checkout"),
          f.proof,
        );
      for (const r of f.sources.property)
        batch.set(db.collection("propertyPayments").doc(r.id), r);
      for (const r of f.sources.online)
        batch.set(db.collection("paymentAttempts").doc(r.id), r);
      await batch.commit();
      await processAccounting(db, bookingId);
      return bookingId;
    }
    const cmd = (
      input: Record<string, unknown>,
      uid = admin,
      requestId = crypto.randomUUID(),
    ) => service.duesCommand(uid, hotel, { ...input, requestId });
    const payment = (
      bookingIds: string[],
      amountRupees = "200",
      transactionReference = crypto.randomUUID(),
    ) => ({
      bookingIds,
      amountRupees,
      paymentDate: "2026-11-24",
      method: "upi",
      transactionReference,
      notes: "Disposable local test",
      replacesId: null as string | null,
    });
    async function preview(p: ReturnType<typeof payment>, uid = admin) {
      const result = await cmd({ action: "preview_payment", payment: p }, uid);
      if (!("confirmation" in result)) throw Error("Expected preview");
      return result.confirmation;
    }
    async function confirm(p: Confirmation, uid = admin, requestId?: string) {
      return cmd(
        {
          action: p.kind === "payment" ? "record_payment" : "correct_payment",
          confirmationId: p.id,
        },
        uid,
        requestId,
      );
    }
    async function receive(bookingIds: string[], amount = "200", ref?: string) {
      const p = await preview(payment(bookingIds, amount, ref));
      const result = await confirm(p);
      if (!("paymentId" in result)) throw Error("Expected receipt");
      return result.paymentId;
    }
    async function correction(paymentId: string, uid = admin) {
      const result = await cmd(
        {
          action: "preview_correction",
          paymentId,
          reason: "Mistaken local recording",
        },
        uid,
      );
      if (!("confirmation" in result))
        throw Error("Expected correction preview");
      return result.confirmation;
    }
    const state = async (id: string) =>
      (await db.collection(stateCollection).doc(id).get()).data()!;
    it("does not flag untouched historical bookings or warn about a zero balance", async () => {
      const bookingId = `${prefix}-historical`;
      ids.push(bookingId);
      await db.collection("bookings").doc(bookingId).set({
        propertyId: otherHotel,
        createdAt: "2025-01-01T00:00:00Z",
        status: "checked_out",
      });
      const policyRef = db
        .collection("hotelFinanceSettingsV1")
        .doc(`hotel_${otherHotel}`);
      try {
        await policyRef.set({
          revision: 1,
          settings: {
            duesLimit: { type: "limited", amountPaise: 0 },
            duesWarningPaise: 0,
          },
        });
        const view = await service.readDues(admin, otherHotel);
        expect(view.attention).toEqual([]);
        expect(view.outstanding).toEqual([]);
        expect(view.warnings).toEqual([]);
      } finally {
        await policyRef.delete();
      }
    });
    it("derives completed pay-at-hotel dues from saved terms, preserves current policy and excludes pending checkout", async () => {
      const b = await fixture(),
        pending = await fixture(1000, false);
      const view = await service.readDues(admin, hotel);
      expect(view.outstanding.find((p) => p.bookingId === b)?.duesPaise).toBe(
        20000,
      );
      expect(view.outstanding.some((p) => p.bookingId === pending)).toBe(false);
      expect(view.policy).toMatchObject({
        duesLimit: { type: "limited", amountPaise: 10000 },
        duesGraceDays: 7,
      });
      expect(view.warnings).toHaveLength(2);
      await expect(preview(payment([pending]))).rejects.toThrow();
    });
    it("clears full dues and allocates partial payments oldest first", async () => {
      const a = await fixture(),
        b = await fixture(1500);
      const p = await preview(payment([b, a], "350"));
      expect(
        p.allocations.map((x) => [x.bookingId, x.amountPaise, x.afterPaise]),
      ).toEqual([
        [a, 20000, 0],
        [b, 15000, 15000],
      ]);
      await confirm(p);
      expect((await state(a)).summary.duesPaise).toBe(0);
      expect((await state(b)).summary.duesPaise).toBe(15000);
      await receive([b], "150");
      expect((await state(b)).summary.duesPaise).toBe(0);
    });
    it("rejects overpayment, too many bookings, future dates, and unknown evidence", async () => {
      const b = await fixture();
      await expect(preview(payment([b], "200.01"))).rejects.toThrow(/Maximum/);
      await expect(
        preview(
          payment(
            Array.from({ length: 51 }, (_, i) => `limit-${i}`),
            "1",
          ),
        ),
      ).rejects.toThrow();
      await expect(
        preview({ ...payment([b]), paymentDate: "2099-01-01" }),
      ).rejects.toThrow(/future/);
      await db
        .collection("bookings")
        .doc(b)
        .update({ bookingStatus: "cancelled" });
      await expect(preview(payment([b]))).rejects.toThrow();
    });
    it("protects identical retries, conflicting payloads, duplicate references and duplicate confirmations", async () => {
      const a = await fixture(),
        b = await fixture(),
        ref = crypto.randomUUID(),
        p = await preview(payment([a], "200", ref)),
        requestId = crypto.randomUUID();
      const first = await confirm(p, admin, requestId);
      expect(await confirm(p, admin, requestId)).toEqual(first);
      await expect(
        cmd(
          { action: "correct_payment", confirmationId: p.id },
          admin,
          requestId,
        ),
      ).rejects.toThrow(/different/);
      await expect(confirm(p)).rejects.toThrow();
      await expect(
        preview(payment([b], "200", ` ${ref.toUpperCase()} `)),
      ).rejects.toThrow(/already/);
      expect(
        (
          await db.runTransaction((tx) => readEvidence(db, tx, a))
        ).journal.filter((j) => j.type === "dues_payment"),
      ).toHaveLength(1);
    });
    it("serializes concurrent admins and forces stale confirmations to be reviewed", async () => {
      const b = await fixture(),
        first = await preview(payment([b], "150")),
        secondPreview = await preview(payment([b], "100"), second);
      const result = await Promise.allSettled([
        confirm(first),
        confirm(secondPreview, second),
      ]);
      expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await state(b)).summary.duesPaise).toBeGreaterThanOrEqual(0);
      const stale = result.find(
        (r) => r.status === "rejected",
      ) as PromiseRejectedResult;
      expect(stale.reason.code).toBe("DUES_CONFIRMATION_STALE");
    });
    it("prevents two admins recording one transaction reference against different bookings", async () => {
      const a = await fixture(),
        b = await fixture(),
        ref = crypto.randomUUID();
      const previews = await Promise.all([
        preview(payment([a], "200", ref)),
        preview(payment([b], "200", ref), second),
      ]);
      const results = await Promise.allSettled([
        confirm(previews[0]),
        confirm(previews[1], second),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (await state(a)).summary.duesPaise + (await state(b)).summary.duesPaise,
      ).toBe(20000);
    });
    it("reverses an entire recording once and supports exactly one linked replacement with the same reference", async () => {
      const a = await fixture(),
        b = await fixture(1500),
        ref = crypto.randomUUID(),
        receiptId = await receive([a, b], "350", ref),
        c = await correction(receiptId),
        requestId = crypto.randomUUID();
      await confirm(c, admin, requestId);
      expect(await confirm(c, admin, requestId)).toMatchObject({
        status: "Corrected",
      });
      expect((await state(a)).summary.duesPaise).toBe(20000);
      expect((await state(b)).summary.duesPaise).toBe(30000);
      await expect(correction(receiptId)).rejects.toThrow(/already/);
      await expect(preview(payment([a, b], "350", ref))).rejects.toThrow(
        /already/,
      );
      const replacement = await preview({
        ...payment([b], "250", ref),
        replacesId: receiptId,
      });
      await confirm(replacement);
      await expect(
        preview({ ...payment([a], "100", ref), replacesId: receiptId }),
      ).rejects.toThrow(/twice/);
      const view = await service.readDues(admin, hotel);
      expect(view.payments.find((p) => p.id === receiptId)).toMatchObject({
        status: "Corrected",
        replacedBy: replacement.id,
      });
      expect(
        view.payments.find((p) => p.id === replacement.id)?.replacesId,
      ).toBe(receiptId);
    });
    it("serializes simultaneous corrections and rolls back receipt and correction atomically", async () => {
      const b = await fixture(),
        p = await preview(payment([b]));
      await expect(
        service.duesCommand(
          admin,
          hotel,
          {
            action: "record_payment",
            confirmationId: p.id,
            requestId: crypto.randomUUID(),
          },
          () => {
            throw Error("INJECTED_ROLLBACK");
          },
        ),
      ).rejects.toThrow("INJECTED");
      expect((await state(b)).summary.duesPaise).toBe(20000);
      expect(
        (await db.collection(service.collections.receipts).doc(p.id).get())
          .exists,
      ).toBe(false);
      await confirm(p);
      const c = await correction(p.id),
        other = await correction(p.id, second);
      await expect(
        service.duesCommand(
          admin,
          hotel,
          {
            action: "correct_payment",
            confirmationId: c.id,
            requestId: crypto.randomUUID(),
          },
          () => {
            throw Error("INJECTED_ROLLBACK");
          },
        ),
      ).rejects.toThrow("INJECTED");
      expect((await state(b)).summary.duesPaise).toBe(0);
      const results = await Promise.allSettled([
        confirm(c),
        confirm(other, second),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await state(b)).summary.duesPaise).toBe(20000);
    });
    it("preserves receipts through accounting retries, reconciliation and summary rebuilding", async () => {
      const b = await fixture(),
        receipt = await receive([b], "125");
      for (let i = 0; i < 3; i++) await processAccounting(db, b);
      expect((await state(b)).summary.duesPaise).toBe(7500);
      const accounting = await import("@/lib/accounting/service");
      expect(
        (await accounting.reconcileAccount(admin, hotel)).findings.filter(
          (f) => f.bookingId === b,
        ),
      ).toEqual([]);
      await db
        .collection(stateCollection)
        .doc(b)
        .update({ summary: { duesPaise: 999 } });
      await accounting.accountingCommand(admin, hotel, {
        action: "rebuild_summary",
        bookingId: b,
        requestId: crypto.randomUUID(),
      });
      const evidence = await db.runTransaction((tx) => readEvidence(db, tx, b));
      expect(evidence.state.summary).toEqual(summary(evidence.journal));
      expect(evidence.state.summary.duesPaise).toBe(7500);
      await confirm(await correction(receipt));
      await processAccounting(db, b);
      expect((await state(b)).summary.duesPaise).toBe(20000);
    });
    it("preserves payments after booking changes and supports correcting them without moving money elsewhere", async () => {
      const b = await fixture(),
        receipt = await receive([b]);
      await db
        .collection("bookings")
        .doc(b)
        .update({ bookingStatus: "cancelled" });
      await processAccounting(db, b);
      const s = await state(b);
      expect(s.summary.duesPaise).toBe(-20000);
      expect(s.status).toBe("review");
      expect(s.reasons.join(" ")).toMatch(/exceed current/);
      const view = await service.readDues(owner, hotel, true);
      expect(view.attention.find((p) => p.bookingId === b)?.duesPaise).toBe(
        -20000,
      );
      expect(view.payments.find((p) => p.id === receipt)?.status).toBe(
        "Received",
      );
      await confirm(await correction(receipt));
      expect((await state(b)).summary.duesPaise).toBe(0);
    });
    it("keeps a hotel refund after receipt in review and allows correction when a source booking disappears", async () => {
      const b = await fixture(),
        receipt = await receive([b]);
      await db
        .collection("propertyPayments")
        .doc(`${b}-refund`)
        .set({
          bookingId: b,
          propertyId: hotel,
          type: "refund",
          receiptId: `${b}-cash`,
          amountPaise: 1000,
          createdAt: "2026-11-24T01:00:00Z",
        });
      await processAccounting(db, b);
      expect((await state(b)).summary.duesPaise).toBe(-20000);
      expect(
        (await service.readDues(admin, hotel)).attention.some(
          (p) => p.bookingId === b,
        ),
      ).toBe(true);
      await db.collection("bookings").doc(b).delete();
      await confirm(await correction(receipt));
      expect((await state(b)).summary.duesPaise).toBe(0);
      expect(
        (await service.readDues(owner, hotel, true)).payments.find(
          (p) => p.id === receipt,
        )?.status,
      ).toBe("Corrected");
    });
    it("detects journal corruption, expiry and source changes between preview and confirmation", async () => {
      const b = await fixture(),
        p = await preview(payment([b]));
      await db
        .collection(service.collections.confirmations)
        .doc(p.id)
        .update({ expiresAt: "2000-01-01T00:00:00Z" });
      await expect(confirm(p)).rejects.toThrow(/expired/);
      const current = await preview(payment([b]));
      await db
        .collection("bookings")
        .doc(b)
        .update({ bookingStatus: "cancelled" });
      await expect(confirm(current)).rejects.toThrow(/changed/);
      const healthy = await fixture(),
        id = await receive([healthy]);
      await db
        .collection(journalCollection)
        .doc(receiptEventId(id, healthy))
        .delete();
      expect(
        (await service.readDues(admin, hotel)).attention.some(
          (p) => p.bookingId === healthy,
        ),
      ).toBe(true);
      await expect(correction(id)).rejects.toThrow(/Reconcile/);
    });
    it("keeps payouts and dues receipts independent within one hotel", async () => {
      const duesBooking = await fixture(),
        payoutBooking = await fixture(1000, true, 210000);
      const payouts = await import("@/lib/payouts/service");
      const items = {
        commissionTax: { status: "not_applicable", reason: "Local assessment" },
        statutory: { status: "not_applicable", reason: "Local assessment" },
        gatewayFees: { status: "not_applicable", reason: "Local assessment" },
        other: { status: "not_applicable", reason: "Local assessment" },
      };
      await payouts.payoutCommand(admin, hotel, {
        action: "assess",
        bookingId: payoutBooking,
        expectedVersion: 0,
        items,
        requestId: crypto.randomUUID(),
      });
      const prepared = await payouts.payoutCommand(admin, hotel, {
        action: "prepare",
        bookingIds: [payoutBooking],
        requestId: crypto.randomUUID(),
      });
      const receipt = await receive([duesBooking]);
      expect(
        (await payouts.readPayouts(admin, hotel)).payouts.find(
          (p) => p.id === prepared.id,
        )?.reviewWarnings,
      ).toEqual([]);
      await payouts.payoutCommand(admin, hotel, {
        action: "pay",
        payoutId: prepared.id,
        paymentDate: "2026-11-24",
        method: "upi",
        reference: "LOCAL-DUES-PAYOUT",
        notes: "Local test",
        requestId: crypto.randomUUID(),
      });
      await confirm(await correction(receipt));
      await processAccounting(db, payoutBooking);
      expect((await state(payoutBooking)).summary.payablePaise).toBe(0);
      expect((await state(duesBooking)).summary.duesPaise).toBe(20000);
      expect(
        (await payouts.readPayouts(admin, hotel)).payouts.find(
          (p) => p.id === prepared.id,
        )?.status,
      ).toBe("Paid");
    });
    it("enforces active admin, owner-only read access and cross-hotel isolation", async () => {
      const b = await fixture();
      expect((await service.readDues(owner, hotel, true)).hotel.id).toBe(hotel);
      await expect(service.readDues(staff, hotel, true)).rejects.toThrow();
      await expect(service.readDues(stranger, hotel, true)).rejects.toThrow();
      await expect(service.readDues(owner, otherHotel, true)).rejects.toThrow();
      await expect(
        cmd({ action: "preview_payment", payment: payment([b]) }, owner),
      ).rejects.toThrow();
      await expect(
        service.duesCommand(admin, otherHotel, {
          action: "preview_payment",
          payment: payment([b]),
          requestId: crypto.randomUUID(),
        }),
      ).rejects.toThrow();
      const p = await preview(payment([b]));
      await expect(confirm(p, second)).rejects.toThrow();
      await db.collection("users").doc(admin).update({ isActive: false });
      await expect(confirm(p)).rejects.toThrow();
      await expect(service.readDues(admin, hotel)).rejects.toThrow();
      await db.collection("users").doc(admin).update({ isActive: true });
      expect(hash((await state(b)).summary)).toBeTruthy();
    });
  },
);
