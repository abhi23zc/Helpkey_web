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
const safe = /^(127\.0\.0\.1|localhost):\d+$/.test(
  process.env.FIRESTORE_EMULATOR_HOST ?? "",
);
describe.skipIf(!safe)(
  "isolated service settlement",
  { timeout: 60000 },
  () => {
    let db: typeof import("@/lib/firebase/admin").adminDb,
      command: typeof import("@/lib/booking-finance/service-commands").serviceCommand;
    const prefix = `service-${crypto.randomUUID()}`,
      hotel = `${prefix}-hotel`,
      admin = `${prefix}-admin`,
      owner = `${prefix}-owner`,
      ids: string[] = [];
    beforeAll(async () => {
      process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-finance";
      delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
      delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
      process.env.BACKGROUND_MODE = "legacy";
      process.env.HOTEL_ACCOUNTING_START_AT = "2026-01-01T00:00:00Z";
      db = (await import("@/lib/firebase/admin")).adminDb;
      command = (await import("@/lib/booking-finance/service-commands"))
        .serviceCommand;
      await db
        .collection("users")
        .doc(admin)
        .set({ roles: ["admin"], accountStatus: "active", isActive: true });
      await db
        .collection("users")
        .doc(owner)
        .set({ roles: ["partner"], accountStatus: "active", isActive: true });
      await db.collection("properties").doc(hotel).set({
        name: "Service Test Hotel",
        timezone: "Asia/Kolkata",
        ownerId: owner,
      });
      await db
        .collection("hotelFinanceSettingsV1")
        .doc(`hotel_${hotel}`)
        .set({
          revision: 1,
          settings: { minimumPayoutPaise: 0, payoutCycle: "daily" },
        });
    });
    afterAll(async () => {
      for (const id of ids) {
        for (const c of [
          journalCollection,
          "paymentAttempts",
          "refunds",
          "hotelPayoutsV1",
          "hotelPayoutRequestsV1",
        ]) {
          const rows = await db
            .collection(c)
            .where(
              c === "hotelPayoutsV1" || c === "hotelPayoutRequestsV1"
                ? "propertyId"
                : "bookingId",
              "==",
              c === "hotelPayoutsV1" || c === "hotelPayoutRequestsV1"
                ? hotel
                : id,
            )
            .get();
          await Promise.all(rows.docs.map((d) => db.recursiveDelete(d.ref)));
        }
        for (const c of [
          "bookings",
          "bookingFinanceAgreementsV1",
          stateCollection,
          "hotelPayoutAssessmentsV1",
          "hotelPayoutReservationsV1",
        ])
          await db.recursiveDelete(db.collection(c).doc(id));
        for (const c of ["projectionOutbox", "projectionJobs"]) {
          const rows = await db.collection(c).where("entityId", "==", id).get();
          await Promise.all(rows.docs.map((d) => db.recursiveDelete(d.ref)));
        }
      }
      const receipts = await db
        .collection("hotelAccountingRequestsV1")
        .where("actorId", "==", admin)
        .get();
      await Promise.all(receipts.docs.map((d) => d.ref.delete()));
      await db.recursiveDelete(db.collection("properties").doc(hotel));
      await db
        .collection("hotelFinanceSettingsV1")
        .doc(`hotel_${hotel}`)
        .delete();
      await db.collection("users").doc(admin).delete();
      await db.collection("users").doc(owner).delete();
    });
    async function fixture(catalog = true) {
      const id = `${prefix}-${ids.length}`;
      ids.push(id);
      const f = accountingFixture(210000, 0, true, 1000, id, hotel);
      f.b.actualCheckOutAt = "2026-11-24T00:00:00Z";
      f.agreement.terms.effective.payoutDelayDays = 0;
      const r = {
        id: "extra",
        offeringId: id,
        offeringVersion: 1,
        name: "Pickup",
        kind: "service",
        agreementVersion: 2,
        status: "confirmed",
        settlement: "paid",
        quote: {
          version: 1,
          status: "accepted",
          amountPaise: 10000,
          acceptedAt: "2026-11-24T00:10:00Z",
          scope: "Pickup",
          conditions: "Hotel service",
          paymentId: `${id}-extra-pay`,
          paymentStatus: "paid",
        },
      };
      f.b.customizations = [r];
      f.b.stayPaymentReceipts = [
        {
          requestId: r.id,
          quoteVersion: 1,
          paymentId: r.quote.paymentId,
          orderId: `${id}-order`,
          amountPaise: 10000,
          status: "paid",
        },
      ];
      await db.collection("bookings").doc(id).set(f.b);
      await db
        .collection("bookingFinanceAgreementsV1")
        .doc(id)
        .set(f.agreement);
      await db
        .collection("bookingFinanceAgreementsV1")
        .doc(id)
        .collection("proofs")
        .doc("checkout")
        .set(f.proof!);
      await db
        .collection("paymentAttempts")
        .doc(f.sources.online[0].id)
        .set(f.sources.online[0]);
      await db
        .collection("paymentAttempts")
        .doc(r.quote.paymentId)
        .set({
          bookingId: id,
          propertyId: hotel,
          paymentId: r.quote.paymentId,
          orderId: `${id}-order`,
          currency: "INR",
          amountPaise: 10000,
          stayQuote: true,
          status: "captured",
          createdAt: "2026-11-24T00:11:00Z",
        });
      if (catalog)
        await db
          .collection("properties")
          .doc(hotel)
          .collection("stayCustomizations")
          .doc(id)
          .set({ version: 1, kind: "service", category: "transport" });
      await processAccounting(db, id);
      return { id, f, r };
    }
    const reconcile = (id: string, requestId = crypto.randomUUID()) =>
      command(admin, hotel, { action: "reconcile", bookingId: id, requestId });
    const evidence = (id: string) =>
      db.runTransaction((tx) => readEvidence(db, tx, id));
    it("reconciles legacy service evidence once and keeps money and original agreements intact", async () => {
      const { id, f } = await fixture(),
        before = await evidence(id);
      expect(before.state.status).toBe("review");
      const request = crypto.randomUUID();
      await Promise.all([reconcile(id, request), reconcile(id, request)]);
      await processAccounting(db, id);
      const e = await evidence(id);
      expect(e.state.status).toBe("recognized");
      expect(e.state.summary.payablePaise).toBe(200000);
      expect(e.sources.serviceAgreements).toHaveLength(1);
      expect(hash(e.agreement)).toBe(hash(f.agreement));
      expect(e.journal.filter((j) => j.type === "capture")).toHaveLength(2);
      expect(e.state.summary).toEqual(summary(e.journal));
      await processAccounting(db, id);
      expect((await evidence(id)).journal).toHaveLength(e.journal.length);
      const view = await (
        await import("@/lib/accounting/service")
      ).readAccount(admin, hotel);
      expect(view.payments.filter((p) => p.bookingId === id)).toHaveLength(2);
      expect(
        view.payments
          .filter((p) => p.bookingId === id)
          .every((p) => p.status === "Received"),
      ).toBe(true);
    });
    it("records lifecycle evidence without reversing unchanged financial lines", async () => {
      const { id } = await fixture();
      await reconcile(id);
      await processAccounting(db, id);
      const before = await evidence(id);
      await db.collection("bookings").doc(id).update({
        bookingStatus: "completed",
        updatedAt: "2026-11-24T01:00:00Z",
      });
      await processAccounting(db, id);
      const after = await evidence(id);
      expect(after.state.recognitionId).toBe(before.state.recognitionId);
      expect(
        after.journal.filter((j) => j.type === "recognition_reversal"),
      ).toHaveLength(
        before.journal.filter((j) => j.type === "recognition_reversal").length,
      );
      expect(after.state.summary).toEqual(before.state.summary);
    });
    it("requires explicit confirmation for unlisted evidence, enforces admin access, immutable terms and retries", async () => {
      const { id } = await fixture(false);
      await reconcile(id);
      expect((await evidence(id)).sources.serviceAgreements).toHaveLength(0);
      const input = {
        action: "confirm",
        bookingId: id,
        serviceRequestId: "extra",
        quoteVersion: 1,
        hotelOwned: true,
        category: null,
        preTaxPaise: null,
        reason: "Verified original hotel quote and matching paid receipt",
        requestId: crypto.randomUUID(),
      };
      await expect(command(owner, hotel, input)).rejects.toThrow();
      await expect(command(admin, `${hotel}-other`, input)).rejects.toThrow();
      const result = await command(admin, hotel, input);
      expect(await command(admin, hotel, input)).toEqual(result);
      await expect(
        command(admin, hotel, { ...input, reason: "Changed reason" }),
      ).rejects.toThrow();
      await expect(
        command(admin, hotel, { ...input, requestId: crypto.randomUUID() }),
      ).rejects.toThrow(/already/);
      await processAccounting(db, id);
      expect((await evidence(id)).state.summary.payablePaise).toBe(200000);
    });
    it("preserves payout idempotency and prevents settlement changes while reserved or paid", async () => {
      const { id } = await fixture();
      await reconcile(id);
      await processAccounting(db, id);
      const payouts = await import("@/lib/payouts/service");
      const items = Object.fromEntries(
        ["commissionTax", "statutory", "gatewayFees", "other"].map((k) => [
          k,
          { status: "not_applicable", reason: "Explicit test assessment" },
        ]),
      );
      await payouts.payoutCommand(admin, hotel, {
        action: "assess",
        bookingId: id,
        expectedVersion: 0,
        items,
        requestId: crypto.randomUUID(),
      });
      const p = await payouts.payoutCommand(admin, hotel, {
        action: "prepare",
        bookingIds: [id],
        requestId: crypto.randomUUID(),
      });
      await expect(reconcile(id)).rejects.toThrow(/reserved or paid/);
      const pay = {
        action: "pay",
        acknowledgedBankVersion: (
          await (
            await import("@/lib/payout-readiness/service")
          ).readReadiness(admin, hotel)
        ).bankVersion,
        payoutId: p.id,
        paymentDate: "2026-11-24",
        method: "bank_transfer",
        reference: "EMULATOR-ONLY",
        requestId: crypto.randomUUID(),
      };
      await payouts.payoutCommand(admin, hotel, pay);
      await payouts.payoutCommand(admin, hotel, pay);
      await processAccounting(db, id);
      const e = await evidence(id);
      expect(e.state.summary.payablePaise).toBe(0);
      expect(e.journal.filter((j) => j.type === "payout")).toHaveLength(1);
      const check = await (
        await import("@/lib/accounting/service")
      ).reconcileAccount(admin, hotel);
      expect(check.findings.filter((f) => f.bookingId === id)).toEqual([]);
    });
    it("captures immutable service terms during customer acceptance, before a payment exists", async () => {
      const { id, r } = await fixture();
      const quote = {
        ...r.quote,
        status: "offered",
        expiresAt: "2026-12-01T00:00:00Z",
      } as Record<string, unknown>;
      delete quote.acceptedAt;
      delete quote.paymentId;
      delete quote.paymentStatus;
      await db
        .collection("bookings")
        .doc(id)
        .update({
          guestId: owner,
          bookingStatus: "confirmed",
          stayRevision: 0,
          customizations: [
            {
              ...r,
              status: "requested",
              settlement: "awaiting_customer",
              quote,
            },
          ],
          stayPaymentReceipts: [],
        });
      await db.collection("paymentAttempts").doc(r.quote.paymentId).delete();
      await (
        await import("@/lib/stay/requests")
      ).decideRequest(
        owner,
        id,
        { action: "accept", requestId: "extra", quoteVersion: 1, revision: 0 },
        false,
      );
      const e = await evidence(id);
      expect(e.sources.serviceAgreements).toHaveLength(1);
      expect(e.sources.serviceAgreements![0]).toMatchObject({
        requestId: "extra",
        commissionPaise: 0,
        amountPaise: 10000,
      });
    });
  },
);
