import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { accountingFixture } from "./helpers/accounting";
import { hash } from "@/lib/accounting/domain";
import {
  journalCollection,
  processAccounting,
  stateCollection,
} from "@/lib/accounting/posting";
import type { Deductions } from "@/lib/payouts/domain";

const r2Store = new Map<
  string,
  { body: Uint8Array; contentType: string; sha256: string }
>();

vi.mock("@/lib/r2", () => ({
  createPrivateUploadUrl: async (
    key: string,
    contentType: string,
    checksum: string,
  ) => ({
    uploadUrl: `https://r2.test/upload/${encodeURIComponent(key)}`,
    headers: { "Content-Type": contentType, "x-amz-meta-sha256": checksum },
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
  }),
  createPrivateReadUrl: async (key: string) => {
    if (!r2Store.has(key)) throw new Error("R2_OBJECT_NOT_FOUND");
    return {
      url: `https://r2.test/read/${encodeURIComponent(key)}?sig=shortlived`,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    };
  },
  verifyR2Object: async (
    key: string,
    expectedSize: number,
    expectedChecksum: string,
  ) => {
    const item = r2Store.get(key);
    if (
      !item ||
      item.body.byteLength !== expectedSize ||
      item.sha256 !== expectedChecksum
    ) {
      throw new Error("R2_OBJECT_VERIFICATION_FAILED");
    }
  },
  getPrivateObject: async (key: string) => {
    const item = r2Store.get(key);
    if (!item) throw new Error("R2_OBJECT_NOT_FOUND");
    return item.body;
  },
  copyPrivateObject: async (src: string, dest: string) => {
    const item = r2Store.get(src);
    if (!item) throw new Error("R2_OBJECT_NOT_FOUND");
    r2Store.set(dest, { ...item });
  },
  deletePrivateObject: async (key: string) => {
    r2Store.delete(key);
  },
}));

const safe = /^(127\.0\.0\.1|localhost):\d+$/.test(
  process.env.FIRESTORE_EMULATOR_HOST ?? "",
);

const assessedDeductions: Deductions = {
  commissionTax: {
    status: "amount",
    amountPaise: 0,
    reason: "SECRET_INTERNAL_ASSESSMENT_REASON_TAX",
  },
  statutory: {
    status: "not_applicable",
    reason: "SECRET_INTERNAL_STATUTORY_REASON",
  },
  gatewayFees: {
    status: "amount",
    amountPaise: 1000,
    reason: "SECRET_INTERNAL_GATEWAY_REASON",
  },
  other: {
    status: "amount",
    amountPaise: 0,
    reason: "SECRET_INTERNAL_OTHER_REASON",
  },
};

describe.skipIf(!safe)(
  "unified owner finances & dues report emulator suite",
  { timeout: 60000 },
  () => {
    let db: typeof import("@/lib/firebase/admin").adminDb;
    let finances: typeof import("@/lib/finances/service");
    let projections: typeof import("@/lib/finances/projections");
    let reports: typeof import("@/lib/dues/reports");
    let payouts: typeof import("@/lib/payouts/service");
    let dues: typeof import("@/lib/dues/service");
    let notifications: typeof import("@/lib/notifications/service");

    const prefix = `fin-${crypto.randomUUID()}`;
    const hotel = `${prefix}-hotel`;
    const otherHotel = `${prefix}-other-hotel`;
    const admin = `${prefix}-admin`;
    const admin2 = `${prefix}-admin2`;
    const owner = `${prefix}-owner`;
    const newOwner = `${prefix}-new-owner`;
    const staff = `${prefix}-staff`;
    const stranger = `${prefix}-stranger`;
    const bookingIds: string[] = [];

    async function seedBooking(opts: {
      id: string;
      online: number;
      hotelCash: number;
      completed?: boolean;
      checkoutAt?: string;
      delayDays?: number;
      rate?: number;
    }) {
      bookingIds.push(opts.id);
      const f = accountingFixture(
        opts.online,
        opts.hotelCash,
        opts.completed ?? true,
        opts.rate ?? 1000,
        opts.id,
        hotel,
      );
      f.agreement.ownerId = owner;
      if (opts.delayDays !== undefined) {
        f.agreement.terms.effective.payoutDelayDays = opts.delayDays;
      }
      if (opts.checkoutAt) {
        f.b.actualCheckOutAt = opts.checkoutAt;
        if (f.proof) {
          (f.proof as unknown as { createdAt: string }).createdAt = opts.checkoutAt;
        }
      }
      f.b.createdAt = Timestamp.fromDate(new Date("2026-11-24T12:00:00Z"));
      const batch = db.batch();
      batch.create(db.collection("bookings").doc(opts.id), f.b);
      batch.create(
        db.collection("bookingFinanceAgreementsV1").doc(opts.id),
        f.agreement,
      );
      if (f.proof) {
        batch.create(
          db
            .collection("bookingFinanceAgreementsV1")
            .doc(opts.id)
            .collection("proofs")
            .doc("checkout"),
          f.proof,
        );
      }
      for (const r of f.sources.online)
        batch.create(db.collection("paymentAttempts").doc(r.id), r);
      for (const r of f.sources.property)
        batch.create(db.collection("propertyPayments").doc(r.id), r);
      await batch.commit();
      await processAccounting(db, opts.id);
      return f;
    }

    beforeAll(async () => {
      process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-finance";
      delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
      delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
      process.env.HOTEL_ACCOUNTING_START_AT = "2026-01-01T00:00:00Z";
      process.env.BACKGROUND_MODE = "legacy";

      db = (await import("@/lib/firebase/admin")).adminDb;
      finances = await import("@/lib/finances/service");
      projections = await import("@/lib/finances/projections");
      reports = await import("@/lib/dues/reports");
      payouts = await import("@/lib/payouts/service");
      dues = await import("@/lib/dues/service");
      notifications = await import("@/lib/notifications/service");

      for (const uid of [admin, admin2, owner, newOwner, staff, stranger]) {
        await db
          .collection("users")
          .doc(uid)
          .set({
            roles: [uid === admin || uid === admin2 ? "admin" : "partner"],
            accountStatus: "active",
            isActive: true,
          });
      }
      await db.collection("properties").doc(hotel).set({
        name: "Unified Finance Test Hotel",
        ownerId: owner,
        partnerId: owner,
        timezone: "Asia/Kolkata",
        status: "active",
      });
      await db.collection("properties").doc(otherHotel).set({
        name: "Other Hotel",
        ownerId: stranger,
        partnerId: stranger,
        timezone: "Asia/Kolkata",
        status: "active",
      });
      for (const [uid, role] of [
        [owner, "owner"],
        [staff, "manager"],
      ] as const) {
        await db
          .collection("propertyMemberships")
          .doc(`${hotel}_${uid}`)
          .set({ propertyId: hotel, userId: uid, role, status: "active" });
      }
      await db
        .collection("hotelFinanceSettingsV1")
        .doc(`hotel_${hotel}`)
        .set({
          revision: 1,
          settings: {
            commissionBasisPoints: 1000,
            minimumPayoutPaise: 300000, // ₹3,000 minimum
            payoutCycle: "daily",
            payoutDelayDays: 2,
          },
        });
    });

    afterAll(async () => {
      for (const id of bookingIds) {
        for (const name of [
          journalCollection,
          "paymentAttempts",
          "propertyPayments",
          "refunds",
        ]) {
          const rows = await db
            .collection(name)
            .where("bookingId", "==", id)
            .get();
          await Promise.all(rows.docs.map((d) => db.recursiveDelete(d.ref)));
        }
        for (const name of [
          "bookings",
          "bookingFinanceAgreementsV1",
          stateCollection,
          payouts.collections.assessments,
          payouts.collections.reservations,
          projections.ownerFinanceCollections.bookings,
        ]) {
          await db.recursiveDelete(db.collection(name).doc(id));
        }
      }
      for (const col of [
        ...Object.values(dues.collections),
        payouts.collections.payouts,
        payouts.collections.requests,
        projections.ownerFinanceCollections.activity,
        "hotelDuesReportsV1",
        "hotelDuesReportRequestsV1",
        "pendingUploads",
      ]) {
        const rows = await db
          .collection(col)
          .where("propertyId", "==", hotel)
          .get();
        await Promise.all(rows.docs.map((d) => db.recursiveDelete(d.ref)));
      }
      await db
        .collection(projections.ownerFinanceCollections.overview)
        .doc(hotel)
        .delete()
        .catch(() => {});
      for (const uid of [owner, newOwner, admin, admin2, staff, stranger]) {
        const notifs = await db
          .collection("notifications")
          .where("userId", "==", uid)
          .get();
        await Promise.all(notifs.docs.map((d) => d.ref.delete()));
        await db.collection("users").doc(uid).delete();
      }
      for (const uid of [owner, newOwner, staff]) {
        await db
          .collection("propertyMemberships")
          .doc(`${hotel}_${uid}`)
          .delete()
          .catch(() => {});
      }
      await db.collection("properties").doc(hotel).delete();
      await db.collection("properties").doc(otherHotel).delete();
      await db
        .collection("hotelFinanceSettingsV1")
        .doc(`hotel_${hotel}`)
        .delete();
      delete process.env.HOTEL_ACCOUNTING_START_AT;
      delete process.env.BACKGROUND_MODE;
    });

    it("refreshes waiting-period expiry without booking mutation, enforces minimum payout explanation, and handles freshness", async () => {
      const bReady = `${prefix}-b-ready`;
      const bWait = `${prefix}-b-wait`;
      const bCheckout = `${prefix}-b-checkout`;
      const bDues = `${prefix}-b-dues`;

      await seedBooking({
        id: bReady,
        online: 210000,
        hotelCash: 0,
        checkoutAt: "2026-11-24T00:00:00Z",
        delayDays: 0,
      });
      await seedBooking({
        id: bWait,
        online: 210000,
        hotelCash: 0,
        checkoutAt: "2026-11-24T00:00:00Z",
        delayDays: 2,
      });
      await seedBooking({
        id: bCheckout,
        online: 100000,
        hotelCash: 0,
        completed: false,
      });
      await seedBooking({
        id: bDues,
        online: 0,
        hotelCash: 210000,
        checkoutAt: "2026-11-24T00:00:00Z",
        delayDays: 0,
      });

      // Assess bReady and bWait
      for (const bid of [bReady, bWait]) {
        await payouts.payoutCommand(admin, hotel, {
          action: "assess",
          bookingId: bid,
          expectedVersion: 0,
          items: assessedDeductions,
          requestId: crypto.randomUUID(),
        });
      }

      // Before waiting period expires (2026-11-25T23:59:59Z)
      const before = await finances.readOwnerFinancesOverview(
        owner,
        hotel,
        new Date("2026-11-25T23:59:59Z"),
      );
      expect(before.readyForPayment.amountPaise).toBe(189000);
      expect(before.readyForPayment.meetsMinimum).toBe(false);
      expect(before.readyForPayment.shortfallPaise).toBe(111000);
      expect(before.awaitingClearance.waitingPeriodPaise).toBe(189000);
      expect(before.awaitingClearance.checkoutPaise).toBe(100000);
      expect(before.youOweHelpkey.amountPaise).toBe(20000);
      expect(JSON.stringify(before)).not.toMatch(/SECRET_INTERNAL_/);

      // After waiting period expires (2026-11-26T00:00:00Z) WITHOUT touching the booking doc!
      const after = await finances.readOwnerFinancesOverview(
        owner,
        hotel,
        new Date("2026-11-26T00:00:00Z"),
      );
      expect(after.readyForPayment.amountPaise).toBe(378000); // 189000 + 189000
      expect(after.readyForPayment.meetsMinimum).toBe(true);
      expect(after.awaitingClearance.waitingPeriodPaise).toBe(0);

      // Freshness: mark bReady accounting dirty -> excluded from verified availability!
      await db
        .collection(stateCollection)
        .doc(bReady)
        .update({ dirty: true });
      await db
        .collection(projections.ownerFinanceCollections.bookings)
        .doc(bReady)
        .update({ dirty: true, isProcessing: true });
      const dirtyView = await finances.readOwnerFinancesOverview(
        owner,
        hotel,
        new Date("2026-11-26T00:00:00Z"),
      );
      expect(dirtyView.freshness.status).toBe("updating");
      expect(dirtyView.readyForPayment.amountPaise).toBe(189000);
      // Restore bReady
      await processAccounting(db, bReady);
      await finances.readOwnerFinancesOverview(
        owner,
        hotel,
        new Date("2026-11-26T00:00:00Z"),
      );
    });

    it("supports multi-booking payout aggregation, pagination, search, IST date boundaries, and non-mutating backfill", async () => {
      const bReady = `${prefix}-b-ready`;
      const bWait = `${prefix}-b-wait`;

      // Snapshot journal before payout & backfill
      const journalBefore = (
        await db
          .collection(journalCollection)
          .where("propertyId", "==", hotel)
          .get()
      ).docs.map((d) => ({ id: d.id, data: d.data() }));

      await projections.rebuildOwnerFinanceProjections(
        db,
        hotel,
        new Date("2026-11-26T00:00:00Z"),
      );

      const journalAfterBackfill = (
        await db
          .collection(journalCollection)
          .where("propertyId", "==", hotel)
          .get()
      ).docs.map((d) => ({ id: d.id, data: d.data() }));
      expect(journalAfterBackfill).toEqual(journalBefore);

      // Prepare and pay multi-booking payout
      const preview = await payouts.previewPayout(admin, hotel, {
        bookingIds: [bReady, bWait],
      });
      const prepared = await payouts.payoutCommand(admin, hotel, {
        action: "prepare",
        bookingIds: [bReady, bWait],
        expectedReviewFingerprint: preview.reviewFingerprint,
        requestId: crypto.randomUUID(),
      });
      const overviewPrepared = await finances.readOwnerFinancesOverview(
        owner,
        hotel,
        new Date("2026-11-26T00:00:00Z"),
      );
      expect(overviewPrepared.preparedPayouts.totalPaise).toBe(378000);
      expect(overviewPrepared.readyForPayment.amountPaise).toBe(0);

      await payouts.payoutCommand(admin, hotel, {
        action: "pay",
        payoutId: prepared.id,
        paymentDate: "2026-11-25",
        method: "bank_transfer",
        reference: "UTR-MULTI-PAYOUT",
        notes: "SECRET_ADMIN_PAYOUT_NOTE",
        acknowledgedBankVersion: hash([hotel, owner, 0]),
        requestId: crypto.randomUUID(),
      });

      const activity = await finances.listOwnerFinanceActivity(
        owner,
        hotel,
        { type: "payouts" },
        new Date("2026-11-26T00:00:00Z"),
      );
      expect(activity.items).toHaveLength(1);
      expect(activity.items[0]).toMatchObject({
        type: "payout",
        amountPaise: 378000,
        bookingIds: [bReady, bWait].sort(),
        transactionReference: "UTR-MULTI-PAYOUT",
      });
      expect(activity.items[0].statementUrl).toContain(prepared.id);
      expect(JSON.stringify(activity)).not.toContain("SECRET_ADMIN_PAYOUT_NOTE");

      // Pagination & search & hotel-timezone date filter
      const page1 = await finances.listOwnerFinanceBookings(
        owner,
        hotel,
        { limit: "2" },
        new Date("2026-11-26T00:00:00Z"),
      );
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).toBeTruthy();
      const page2 = await finances.listOwnerFinanceBookings(
        owner,
        hotel,
        { limit: "2", cursor: page1.nextCursor! },
        new Date("2026-11-26T00:00:00Z"),
      );
      expect(page2.items).toHaveLength(2);
      const allIds = [...page1.items, ...page2.items].map((b) => b.bookingId);
      expect(new Set(allIds).size).toBe(4);

      // Tampered/mismatched cursor check
      await expect(
        finances.listOwnerFinanceBookings(
          owner,
          hotel,
          { status: "dues", cursor: page1.nextCursor! },
          new Date("2026-11-26T00:00:00Z"),
        ),
      ).rejects.toMatchObject({ code: "INVALID_CURSOR" });

      // Search & date range
      const searched = await finances.listOwnerFinanceBookings(
        owner,
        hotel,
        { q: "b-dues", from: "2026-11-24", to: "2026-11-24" },
        new Date("2026-11-26T00:00:00Z"),
      );
      expect(searched.items).toHaveLength(1);
      expect(searched.items[0].bookingId).toBe(`${prefix}-b-dues`);
    });

    it("enforces owner permissions, cross-hotel isolation, attachment privacy, and ownership changes", async () => {
      for (const badUid of [staff, stranger]) {
        await expect(
          finances.readOwnerFinancesOverview(badUid, hotel),
        ).rejects.toMatchObject({ status: 403 });
      }
      await expect(
        finances.readOwnerFinancesOverview(owner, otherHotel),
      ).rejects.toMatchObject({ status: 403 });

      // Upload proof & submit report
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
      const checksum = createHash("sha256").update(pdfBytes).digest("hex");
      const up = await reports.createDuesReportUploadUrl(owner, hotel, {
        fileName: "proof.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.byteLength,
        checksum,
      });
      r2Store.set(`uploads/finance-proofs/${hotel}/${up.uploadId}`, {
        body: pdfBytes,
        contentType: "application/pdf",
        sha256: checksum,
      });

      const created = await reports.submitDuesReport(
        owner,
        hotel,
        {
          requestId: crypto.randomUUID(),
          amountPaise: 5000,
          paymentDate: "2026-11-25",
          method: "upi",
          transactionReference: "UTR-OWNER-PROOF-1",
          notes: "First partial transfer",
          uploadId: up.uploadId,
        },
        new Date("2026-11-26T00:00:00Z"),
      );

      // Owner and admin can read attachment; staff/stranger cannot.
      const ownerUrl = await reports.getOwnerReportAttachmentUrl(
        owner,
        hotel,
        created.reportId,
      );
      expect(ownerUrl.url).toContain("finance-proofs");
      const adminUrl = await reports.getAdminReportAttachmentUrl(
        admin,
        hotel,
        created.reportId,
      );
      expect(adminUrl.url).toContain("finance-proofs");
      await expect(
        reports.getOwnerReportAttachmentUrl(staff, hotel, created.reportId),
      ).rejects.toMatchObject({ status: 403 });

      // Ownership change: transfer to newOwner
      await db
        .collection("properties")
        .doc(hotel)
        .update({ ownerId: newOwner, partnerId: newOwner });
      await db
        .collection("propertyMemberships")
        .doc(`${hotel}_${newOwner}`)
        .set({ propertyId: hotel, userId: newOwner, role: "owner", status: "active" });

      // Former owner loses access; newOwner has overview access but CANNOT open former owner's proof!
      await expect(
        finances.readOwnerFinancesOverview(owner, hotel),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        reports.getOwnerReportAttachmentUrl(owner, hotel, created.reportId),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        reports.getOwnerReportAttachmentUrl(newOwner, hotel, created.reportId),
      ).rejects.toMatchObject({ status: 403 });

      // Restore ownership for remaining tests
      await db
        .collection("properties")
        .doc(hotel)
        .update({ ownerId: owner, partnerId: owner });
      await db
        .collection("propertyMemberships")
        .doc(`${hotel}_${newOwner}`)
        .delete();
      // Withdraw that report so we can test fresh report workflows
      await reports.withdrawDuesReport(
        owner,
        hotel,
        { action: "withdraw", reportId: created.reportId, requestId: crypto.randomUUID() },
        new Date("2026-11-26T00:00:00Z"),
      );
    });

    it("supports full dues report verification: duplicate checks, rejection, recording, linking, concurrent admins, notifications, and receipt correction", async () => {
      const bDues = `${prefix}-b-dues`;
      const now = new Date("2026-11-26T00:00:00Z");

      // Overpayment above collectible cap fails
      await expect(
        reports.submitDuesReport(
          owner,
          hotel,
          {
            requestId: crypto.randomUUID(),
            amountPaise: 25000,
            paymentDate: "2026-11-25",
            method: "upi",
            transactionReference: "UTR-TOO-MUCH",
          },
          now,
        ),
      ).rejects.toMatchObject({ code: "DUES_OVERPAYMENT" });

      // Submit report A (₹50) with idempotent retry
      const reqA = crypto.randomUUID();
      const repA = await reports.submitDuesReport(
        owner,
        hotel,
        {
          requestId: reqA,
          amountPaise: 5000,
          paymentDate: "2026-11-25",
          method: "upi",
          transactionReference: " utR-report-a ",
        },
        now,
      );
      const repAReplay = await reports.submitDuesReport(
        owner,
        hotel,
        {
          requestId: reqA,
          amountPaise: 5000,
          paymentDate: "2026-11-25",
          method: "upi",
          transactionReference: " utR-report-a ",
        },
        now,
      );
      expect(repAReplay).toEqual(repA);

      // Duplicate pending reference blocked
      await expect(
        reports.submitDuesReport(
          owner,
          hotel,
          {
            requestId: crypto.randomUUID(),
            amountPaise: 5000,
            paymentDate: "2026-11-25",
            method: "upi",
            transactionReference: "UTR-REPORT-A",
          },
          now,
        ),
      ).rejects.toMatchObject({ code: "DUPLICATE_TRANSACTION_REFERENCE" });

      // Admin rejects report A -> deterministic notification written in same tx
      await dues.duesCommand(admin, hotel, {
        action: "reject_report",
        reportId: repA.reportId,
        reason: "Reference not found in bank statement",
        requestId: crypto.randomUUID(),
      });
      const notifsAfterReject = await notifications.listNotifications(owner);
      expect(
        notifsAfterReject.notifications.some(
          (n) =>
            n.eventType === "dues_report.rejected" &&
            n.data.reportId === repA.reportId,
        ),
      ).toBe(true);

      // Submit report B (₹100) -> Admin records it, concurrent admin2 cannot also reject/record
      const repB = await reports.submitDuesReport(
        owner,
        hotel,
        {
          requestId: crypto.randomUUID(),
          amountPaise: 10000,
          paymentDate: "2026-11-25",
          method: "bank_transfer",
          transactionReference: "NEFT-B-100",
        },
        now,
      );
      const previewB = await dues.duesCommand(admin, hotel, {
        action: "preview_report_payment",
        reportId: repB.reportId,
        bookingIds: [bDues],
        requestId: crypto.randomUUID(),
      });
      expect("confirmation" in previewB).toBe(true);
      if (!("confirmation" in previewB)) throw Error("Expected confirmation");

      const recReq = crypto.randomUUID();
      const recordedB = await dues.duesCommand(admin, hotel, {
        action: "record_report_payment",
        confirmationId: previewB.confirmation.id,
        requestId: recReq,
      });
      // Lost response replay
      const recordedBReplay = await dues.duesCommand(admin, hotel, {
        action: "record_report_payment",
        confirmationId: previewB.confirmation.id,
        requestId: recReq,
      });
      expect(recordedBReplay).toEqual(recordedB);

      // Concurrent second admin cannot reject or withdraw an already recorded report
      await expect(
        dues.duesCommand(admin2, hotel, {
          action: "reject_report",
          reportId: repB.reportId,
          reason: "Late reject",
          requestId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "REPORT_STATUS_CONFLICT" });
      await expect(
        reports.withdrawDuesReport(
          owner,
          hotel,
          {
            action: "withdraw",
            reportId: repB.reportId,
            requestId: crypto.randomUUID(),
          },
          now,
        ),
      ).rejects.toMatchObject({ code: "REPORT_STATUS_CONFLICT" });

      // Receipt correction keeps recorded report linked and shows correction + replacement history
      if (!("paymentId" in recordedB)) throw Error("Expected paymentId");
      const corrPreview = await dues.duesCommand(admin, hotel, {
        action: "preview_correction",
        paymentId: recordedB.paymentId,
        reason: "Fix allocation date",
        requestId: crypto.randomUUID(),
      });
      if (!("confirmation" in corrPreview)) throw Error("Expected confirmation");
      await dues.duesCommand(admin, hotel, {
        action: "correct_payment",
        confirmationId: corrPreview.confirmation.id,
        requestId: crypto.randomUUID(),
      });

      const ownerReports = await reports.listOwnerDuesReports(owner, hotel, {});
      const repBView = ownerReports.items.find((r) => r.id === repB.reportId);
      expect(repBView?.status).toBe("recorded");
      expect(repBView?.linkedReceipt?.corrected).toBe(true);
      expect(repBView?.linkedReceipt?.correctionReason).toBe(
        "Fix allocation date",
      );

      // Existing-receipt linking: Admin records ₹50 manually, owner submits matching report, admin links without creating duplicate payment
      const manualPreview = await dues.duesCommand(admin, hotel, {
        action: "preview_payment",
        payment: {
          bookingIds: [bDues],
          amountRupees: "50",
          paymentDate: "2026-11-25",
          method: "cash",
          transactionReference: "CASH-50-EXISTING",
          notes: "",
          replacesId: null,
        },
        requestId: crypto.randomUUID(),
      });
      if (!("confirmation" in manualPreview)) throw Error("Expected confirmation");
      const manualReceipt = await dues.duesCommand(admin, hotel, {
        action: "record_payment",
        confirmationId: manualPreview.confirmation.id,
        requestId: crypto.randomUUID(),
      });
      if (!("paymentId" in manualReceipt)) throw Error("Expected paymentId");

      const repC = await reports.submitDuesReport(
        owner,
        hotel,
        {
          requestId: crypto.randomUUID(),
          amountPaise: 5000,
          paymentDate: "2026-11-25",
          method: "cash",
          transactionReference: "cash-50-existing",
        },
        now,
      );
      const immutableReceiptBefore = (await db.collection(dues.collections.receipts).doc(manualReceipt.paymentId).get()).data();
      const linked = await dues.duesCommand(admin, hotel, {
        action: "link_report_receipt",
        reportId: repC.reportId,
        paymentId: manualReceipt.paymentId,
        requestId: crypto.randomUUID(),
      });
      expect(linked).toMatchObject({
        reportId: repC.reportId,
        paymentId: manualReceipt.paymentId,
        status: "Recorded",
      });
      expect((await db.collection(dues.collections.receipts).doc(manualReceipt.paymentId).get()).data()).toEqual(immutableReceiptBefore);
      const linkedDues = await dues.readDues(admin, hotel);
      expect(linkedDues.attention.flatMap((p) => p.reasons)).not.toContain("The journal differs from a recorded hotel payment or correction.");
    });
    it("preserves exactly one proof under concurrent identical submission retries", async () => {
      const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
      const checksum = createHash("sha256").update(bytes).digest("hex");
      const upload = await reports.createDuesReportUploadUrl(owner, hotel, {
        fileName: "retry.pdf", mimeType: "application/pdf", sizeBytes: bytes.byteLength, checksum,
      });
      r2Store.set(`uploads/finance-proofs/${hotel}/${upload.uploadId}`, { body: bytes, contentType: "application/pdf", sha256: checksum });
      const input = { requestId: crypto.randomUUID(), amountPaise: 100, paymentDate: "2026-11-25", method: "upi", transactionReference: "proof-concurrent-retry", uploadId: upload.uploadId };
      const results = await Promise.all([
        reports.submitDuesReport(owner, hotel, input),
        reports.submitDuesReport(owner, hotel, input),
      ]);
      expect(results[0]).toEqual(results[1]);
      const saved = (await db.collection("hotelDuesReportsV1").doc(results[0].reportId).get()).data()!;
      expect(r2Store.has(saved.attachment.objectKey)).toBe(true);
      expect([...r2Store.keys()].filter((key) => key.startsWith(`finance-proofs/${hotel}/${results[0].reportId}/`))).toEqual([saved.attachment.objectKey]);
      expect((await db.collection("pendingUploads").doc(upload.uploadId).get()).exists).toBe(false);
      const duplicateReference = { amountPaise: 100, paymentDate: "2026-11-25", method: "upi", transactionReference: "proof-reference-race" };
      const duplicateAttempts = await Promise.allSettled([
        reports.submitDuesReport(owner, hotel, { ...duplicateReference, requestId: crypto.randomUUID() }),
        reports.submitDuesReport(owner, hotel, { ...duplicateReference, requestId: crypto.randomUUID() }),
      ]);
      expect(duplicateAttempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(duplicateAttempts.filter((r) => r.status === "rejected")).toHaveLength(1);

    });

    it("keeps a cursor through sparse filters and opens details beyond the first page", async () => {
      await projections.ensureFreshOwnerProjections(db, hotel);
      const ids = Array.from({ length: 270 }, (_, i) => `${prefix}-sparse-${String(i).padStart(3, "0")}`);
      const batch = db.batch();
      for (const [i, id] of ids.entries()) {
        batch.set(db.collection(projections.ownerFinanceCollections.activity).doc(hash([hotel, id])), {
          id, docId: hash([hotel, id]), propertyId: hotel, type: "payout", typeGroup: i < 260 ? "collections" : "payouts",
          searchTokens: ["sparse-search"], sortAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 270 - i)).toISOString(),
          localDate: "2026-01-01", amountPaise: 100,
          bookingIds: [], bookingReferences: [],
        });
      }
      await batch.commit();
      let cursor: string | null = null;
      const found: string[] = [];
      let firstPage = true;
      do {
        const page = await finances.listOwnerFinanceActivity(owner, hotel, {
          q: "sparse-search", type: "payouts", limit: 20, ...(cursor ? { cursor } : {}),
        });
        if (firstPage) {
          expect(page.items).toHaveLength(0);
          expect(page.nextCursor).not.toBeNull();
          firstPage = false;
        }
        found.push(...page.items.map((r) => r.id));
        cursor = page.nextCursor;
      } while (cursor);
      expect(found).toEqual(ids.slice(260));
      const detail = await finances.listOwnerFinanceActivity(owner, hotel, { detailId: ids[269], limit: 1 });
      expect(detail.items.map((r) => r.id)).toEqual([ids[269]]);
      await expect(finances.listOwnerFinanceActivity(owner, hotel, { from: "2026-02-30", to: "2026-03-01" })).rejects.toThrow();
    });

    it("counts all pending reports and paginates the admin queue beyond 100 records", async () => {
      const before = await finances.readOwnerFinancesOverview(owner, hotel);
      const batch = db.batch();
      const ids = Array.from({ length: 102 }, (_, i) => `${prefix}-queue-${String(i).padStart(3, "0")}`);
      for (const [i, id] of ids.entries()) {
        batch.set(db.collection("hotelDuesReportsV1").doc(id), {
          id, reference: id, propertyId: hotel, ownerId: owner,
          amountPaise: 100, method: "upi", transactionReference: id, normalizedReference: id.toUpperCase(),
          paymentDate: "2026-01-01", status: "awaiting_verification", attachment: null, linkedReceiptId: null,
          submittedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
        });
      }
      await batch.commit();
      const after = await finances.readOwnerFinancesOverview(owner, hotel);
      expect(after.youOweHelpkey.pendingReportsCount).toBe(before.youOweHelpkey.pendingReportsCount + 102);
      expect(after.youOweHelpkey.pendingReportsAmountPaise).toBe(before.youOweHelpkey.pendingReportsAmountPaise + 10200);
      const first = await dues.readDues(admin, hotel);
      expect(first.reports).toHaveLength(100);
      expect(first.pendingReportsCount).toBe(after.youOweHelpkey.pendingReportsCount);
      expect(first.nextReportsCursor).not.toBeNull();
      const second = await dues.readDues(admin, hotel, false, null, first.nextReportsCursor);
      expect(second.reports.some((r) => r.id === ids[0])).toBe(true);
    });

    it("excludes dirty bookings beyond the refresh budget and recomputes overview-only invalidations", async () => {
      const tempHotel = `${prefix}-backlog`;
      await db.collection("properties").doc(tempHotel).set({ ownerId: owner, timezone: "Asia/Kolkata" });
      await db.collection("propertyMemberships").doc(`${tempHotel}_${owner}`).set({ role: "owner", status: "active" });
      await projections.rebuildOwnerFinanceProjections(db, tempHotel);
      const batch = db.batch();
      for (let i = 0; i < 51; i++) {
        const id = `${tempHotel}-${i}`;
        batch.set(db.collection(projections.ownerFinanceCollections.bookings).doc(id), {
          bookingId: id, propertyId: tempHotel, stage: "ready_for_payment", readyForPaymentPaise: 1000, dirty: true, isProcessing: false,
        });
      }
      batch.set(db.collection(projections.ownerFinanceCollections.overview).doc(tempHotel), { dirty: true }, { merge: true });
      await batch.commit();
      const view = await projections.ensureFreshOwnerProjections(db, tempHotel);
      expect(view.readyForPaymentPaise).toBe(0);
      expect(view.processingCount).toBe(1);
      await projections.ensureFreshOwnerProjections(db, tempHotel);
      await db.collection("hotelPayoutsV1").doc(`${tempHotel}-paid`).set({ propertyId: tempHotel, status: "Paid", finalPaise: 1234 });
      await db.collection(projections.ownerFinanceCollections.overview).doc(tempHotel).set({ dirty: true }, { merge: true });
      const refreshed = await projections.ensureFreshOwnerProjections(db, tempHotel);
      expect(refreshed.paidOutTotalPaise).toBe(1234);
      await db.recursiveDelete(db.collection("properties").doc(tempHotel));
      await db.collection("propertyMemberships").doc(`${tempHotel}_${owner}`).delete();
      await db.collection("hotelPayoutsV1").doc(`${tempHotel}-paid`).delete();
      await db.collection(projections.ownerFinanceCollections.overview).doc(tempHotel).delete();
    });

  },
);
