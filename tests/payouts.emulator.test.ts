import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { accountingFixture } from "./helpers/accounting";
import {
  processAccounting,
  readEvidence,
  stateCollection,
  journalCollection,
  summary,
} from "@/lib/accounting/posting";
import { hash, totals } from "@/lib/accounting/domain";
import type { Deductions } from "@/lib/payouts/domain";
const safe = /^(127\.0\.0\.1|localhost):\d+$/.test(
  process.env.FIRESTORE_EMULATOR_HOST ?? "",
);
const items: Deductions = {
  commissionTax: { status: "amount", amountPaise: 0, reason: "Explicit zero" },
  statutory: { status: "not_applicable", reason: "Not applicable" },
  gatewayFees: {
    status: "amount",
    amountPaise: 1000,
    reason: "Verified invoice",
  },
  other: { status: "amount", amountPaise: 0, reason: "No adjustment" },
};
describe.skipIf(!safe)("isolated hotel payouts", { timeout: 60000 }, () => {
  let db: typeof import("@/lib/firebase/admin").adminDb,
    service: typeof import("@/lib/payouts/service");
  const prefix = `payout-${crypto.randomUUID()}`,
    hotel = `${prefix}-hotel`,
    admin = `${prefix}-admin`,
    owner = `${prefix}-owner`,
    staff = `${prefix}-staff`,
    other = `${prefix}-other`;
  const ids: string[] = [];
  beforeAll(async () => {
    process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-finance";
    delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    process.env.HOTEL_ACCOUNTING_START_AT = "2026-01-01T00:00:00Z";
    process.env.BACKGROUND_MODE = "legacy";
    db = (await import("@/lib/firebase/admin")).adminDb;
    service = await import("@/lib/payouts/service");
    for (const uid of [admin, owner, staff])
      await db
        .collection("users")
        .doc(uid)
        .set({
          roles: [uid === admin ? "admin" : "partner"],
          accountStatus: "active",
          isActive: true,
        });
    for (const h of [hotel, other])
      await db.collection("properties").doc(h).set({
        name: h,
        timezone: "Asia/Kolkata",
        ownerId: owner,
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
    await policy(0);
  });
  afterAll(async () => {
    for (const bookingId of ids) {
      for (const name of [
        journalCollection,
        "paymentAttempts",
        "propertyPayments",
        "refunds",
      ]) {
        const rows = await db
          .collection(name)
          .where("bookingId", "==", bookingId)
          .get();
        await Promise.all(rows.docs.map((d) => db.recursiveDelete(d.ref)));
      }
      for (const name of [
        "bookings",
        "bookingFinanceAgreementsV1",
        stateCollection,
        service.collections.assessments,
        service.collections.reservations,
      ])
        await db.recursiveDelete(db.collection(name).doc(bookingId));
      for (const name of ["projectionOutbox", "projectionJobs"]) {
        const rows = await db
          .collection(name)
          .where("entityId", "==", bookingId)
          .get();
        await Promise.all(rows.docs.map((d) => db.recursiveDelete(d.ref)));
      }
    }
    for (const name of [
      service.collections.payouts,
      service.collections.requests,
    ]) {
      const rows = await db
        .collection(name)
        .where("propertyId", "==", hotel)
        .get();
      await Promise.all(rows.docs.map((d) => db.recursiveDelete(d.ref)));
    }
    for (const h of [hotel, other]) {
      await db.collection("properties").doc(h).delete();
      await db.collection("hotelFinanceSettingsV1").doc(`hotel_${h}`).delete();
    }
    for (const uid of [owner, staff])
      await db
        .collection("propertyMemberships")
        .doc(`${hotel}_${uid}`)
        .delete();
    for (const uid of [admin, owner, staff])
      await db.collection("users").doc(uid).delete();
    delete process.env.HOTEL_ACCOUNTING_START_AT;
  });
  async function policy(minimumPayoutPaise: number | null) {
    await db
      .collection("hotelFinanceSettingsV1")
      .doc(`hotel_${hotel}`)
      .set({
        revision: 8,
        settings: {
          payoutDelayDays: 365,
          payoutCycle: "weekly",
          payoutWeekday: "monday",
          ...(minimumPayoutPaise === null ? {} : { minimumPayoutPaise }),
        },
      });
  }
  async function fixture(ready = true) {
    const bookingId = `${prefix}-${ids.length}`;
    ids.push(bookingId);
    const f = accountingFixture(210000, 0, ready, 1000, bookingId, hotel);
    f.b.actualCheckOutAt = "2026-01-02T00:00:00Z";
    f.b.createdAt = "2026-01-01T00:00:00Z";
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
        { ...f.proof, createdAt: f.b.actualCheckOutAt },
      );
    batch.set(
      db.collection("paymentAttempts").doc(f.sources.online[0].id),
      f.sources.online[0],
    );
    await batch.commit();
    await processAccounting(db, bookingId);
    return bookingId;
  }
  const cmd = (
    input: Record<string, unknown>,
    requestId = crypto.randomUUID(),
  ) =>
    service.payoutCommand(admin, hotel, {
      ...input,
      ...(input.action === "pay"
        ? { acknowledgedBankVersion: hash([hotel, owner, 0]) }
        : {}),
      requestId,
    });
  const assess = (bookingId: string, custom = items, expectedVersion = 0) =>
    cmd({ action: "assess", bookingId, items: custom, expectedVersion });
  const prepare = (bookingIds: string[], requestId?: string) =>
    cmd({ action: "prepare", bookingIds }, requestId);
  const payInput = (payoutId: string) => ({
    action: "pay",
    payoutId,
    paymentDate: "2026-01-03",
    method: "bank_transfer",
    reference: "LOCAL-ONLY-REFERENCE",
    notes: "Disposable emulator payment",
  });
  const state = async (id: string) =>
    (await db.collection(stateCollection).doc(id).get()).data()!;
  async function prepared() {
    const b = await fixture();
    await assess(b);
    return { b, payout: await prepare([b]) };
  }
  it("previews without reserving money and confirms the exact reviewed payout once", async () => {
    await policy(0);
    const b = await fixture();
    await assess(b);
    const beforeJournal = (
      await db.collection(journalCollection).where("bookingId", "==", b).get()
    ).size;
    const beforePayouts = (
      await db
        .collection(service.collections.payouts)
        .where("propertyId", "==", hotel)
        .get()
    ).size;
    const preview = await service.previewPayout(admin, hotel, {
      bookingIds: [b],
    });
    expect(preview).toMatchObject({
      grossPaise: 190000,
      deductionsPaise: 1000,
      finalPaise: 189000,
      deductions: { gatewayFees: 1000 },
    });
    expect(
      (await db.collection(service.collections.reservations).doc(b).get())
        .exists,
    ).toBe(false);
    expect(
      (await db.collection(journalCollection).where("bookingId", "==", b).get())
        .size,
    ).toBe(beforeJournal);
    expect(
      (
        await db
          .collection(service.collections.payouts)
          .where("propertyId", "==", hotel)
          .get()
      ).size,
    ).toBe(beforePayouts);
    const requestId = crypto.randomUUID(),
      input = {
        action: "prepare",
        bookingIds: [b],
        expectedReviewFingerprint: preview.reviewFingerprint,
      };
    const result = await cmd(input, requestId);
    expect(await cmd(input, requestId)).toEqual(result);
    expect(
      (
        await db.collection(service.collections.payouts).doc(result.id).get()
      ).get("finalPaise"),
    ).toBe(189000);
    await expect(
      service.previewPayout(admin, hotel, { bookingIds: [b] }),
    ).rejects.toThrow(/reserved/);
    await cmd({
      action: "cancel",
      payoutId: result.id,
      reason: "Disposable reviewed payout complete",
    });
  });
  it("rejects a stale preparation review after assessment, policy, selection or source changes", async () => {
    const b = await fixture();
    await assess(b);
    const preview = await service.previewPayout(admin, hotel, {
      bookingIds: [b],
    });
    await assess(
      b,
      {
        ...items,
        gatewayFees: {
          status: "amount",
          amountPaise: 2000,
          reason: "Verified changed fee",
        },
      },
      1,
    );
    const confirm = (reviewFingerprint: string, bookingIds = [b]) =>
      cmd({
        action: "prepare",
        bookingIds,
        expectedReviewFingerprint: reviewFingerprint,
      });
    await expect(confirm(preview.reviewFingerprint)).rejects.toMatchObject({
      code: "PAYOUT_REVIEW_STALE",
    });
    const second = await service.previewPayout(admin, hotel, {
      bookingIds: [b],
    });
    await policy(1);
    await expect(confirm(second.reviewFingerprint)).rejects.toMatchObject({
      code: "PAYOUT_REVIEW_STALE",
    });
    await policy(0);
    const otherBooking = await fixture();
    await assess(otherBooking);
    const third = await service.previewPayout(admin, hotel, {
      bookingIds: [b],
    });
    await expect(
      confirm(third.reviewFingerprint, [otherBooking]),
    ).rejects.toMatchObject({ code: "PAYOUT_REVIEW_STALE" });
    await db
      .collection("bookings")
      .doc(b)
      .update({ bookingStatus: "cancelled" });
    await expect(confirm(third.reviewFingerprint)).rejects.toThrow();
    expect(
      (await db.collection(service.collections.reservations).doc(b).get())
        .exists,
    ).toBe(false);
  });
  it("enforces preview permissions, unique selections, batch limits and positive payment", async () => {
    const b = await fixture();
    await assess(b);
    for (const uid of [owner, staff])
      await expect(
        service.previewPayout(uid, hotel, { bookingIds: [b] }),
      ).rejects.toMatchObject({ status: 403 });
    await db
      .collection("hotelFinanceSettingsV1")
      .doc(`hotel_${other}`)
      .set({ revision: 1, settings: { minimumPayoutPaise: 0 } });
    await expect(
      service.previewPayout(admin, other, { bookingIds: [b] }),
    ).rejects.toMatchObject({ status: 404 });
    for (const bookingIds of [
      [],
      [b, b],
      Array.from({ length: 51 }, (_, i) => `limit-${i}`),
    ])
      await expect(
        service.previewPayout(admin, hotel, { bookingIds }),
      ).rejects.toThrow();
    await expect(
      assess(
        b,
        {
          ...items,
          gatewayFees: {
            status: "amount",
            amountPaise: 190000,
            reason: "Would consume full payment",
          },
        },
        1,
      ),
    ).rejects.toThrow(/positive/);
  });
  it("blocks pending checkout, unknown deductions, and missing minimum", async () => {
    const pending = await fixture(false);
    await expect(assess(pending)).rejects.toThrow();
    const b = await fixture();
    await expect(prepare([b])).rejects.toThrow(/assessment/);
    await assess(b);
    await policy(null);
    await expect(prepare([b])).rejects.toThrow(/minimum/);
    await policy(0);
  });
  it("uses combined final amount after deductions and saves current policy, preserving saved delay", async () => {
    const a = await fixture(),
      b = await fixture();
    await assess(a);
    await assess(b);
    await policy(190000);
    await expect(prepare([a])).rejects.toThrow(/below/);
    const result = await prepare([a, b]);
    const payout = (
      await db.collection(service.collections.payouts).doc(result.id).get()
    ).data()!;
    expect(payout).toMatchObject({
      status: "Prepared",
      finalPaise: 378000,
      grossPaise: 380000,
      deductionsPaise: 2000,
      policy: { hotelRevision: 8, minimumPayoutPaise: 190000 },
    });
    expect(payout.bookings[0].savedDelayDays).toBe(0);
    expect((await state(a)).summary.payablePaise).toBe(190000);
    await cmd({
      action: "cancel",
      payoutId: result.id,
      reason: "Local threshold test complete",
    });
    await policy(0);
  });
  it("serializes overlapping preparations and releases reservations on cancellation", async () => {
    const b = await fixture();
    await assess(b);
    const race = await Promise.allSettled([prepare([b]), prepare([b])]);
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const winner = race.find(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<{ id: string }>;
    await cmd({
      action: "cancel",
      payoutId: winner.value.id,
      reason: "Release local reservation",
    });
    expect(
      (await db.collection(service.collections.reservations).doc(b).get()).get(
        "status",
      ),
    ).toBe("released");
    await expect(prepare([b])).resolves.toMatchObject({ status: "Prepared" });
  });
  it("returns committed results for identical/lost-response requests and rejects changed payloads", async () => {
    const b = await fixture();
    await assess(b);
    const requestId = crypto.randomUUID();
    const p = await prepare([b], requestId);
    expect(await prepare([b], requestId)).toEqual(p);
    const req = crypto.randomUUID(),
      input = payInput(p.id);
    const paid = await cmd(input, req);
    expect(await cmd(input, req)).toEqual(paid);
    await expect(cmd({ ...input, reference: "CONFLICT" }, req)).rejects.toThrow(
      /different content/,
    );
    await expect(
      cmd({ action: "cancel", payoutId: p.id, reason: "Cannot cancel paid" }),
    ).rejects.toThrow(/immutable/);
  });
  it("records gross debit, external payment and category deductions once; unchanged processing never recreates payable", async () => {
    const { b, payout } = await prepared();
    await cmd(payInput(payout.id));
    expect((await state(b)).summary.payablePaise).toBe(0);
    for (let i = 0; i < 3; i++) await processAccounting(db, b);
    const e = await db.runTransaction((tx) => readEvidence(db, tx, b));
    const a = totals(e.journal);
    expect(e.journal.filter((j) => j.type === "payout")).toHaveLength(1);
    expect(a).toMatchObject({
      hotel_payable: 0,
      external_payment_clearing: -189000,
      deduction_gatewayFees: -1000,
    });
    expect(e.state.summary).toEqual(summary(e.journal));
    const reconciliation = await (
      await import("@/lib/accounting/service")
    ).reconcileAccount(admin, hotel);
    expect(reconciliation.findings.filter((f) => f.bookingId === b)).toEqual(
      [],
    );
  });
  it("blocks changed evidence before preparation and after preparation but permits cancellation with missing evidence", async () => {
    const b = await fixture();
    await assess(b);
    await db
      .collection("bookings")
      .doc(b)
      .update({ bookingStatus: "cancelled" });
    await expect(prepare([b])).rejects.toThrow();
    const p = await prepared();
    await db
      .collection("refunds")
      .doc(`${p.b}-refund`)
      .set({
        bookingId: p.b,
        propertyId: hotel,
        status: "pending",
        amountPaise: 1000,
        paymentId: `${p.b}-pay`,
        createdAt: "2026-01-03T00:00:00Z",
      });
    await expect(cmd(payInput(p.payout.id))).rejects.toThrow(/changed/);
    expect(
      (await service.readPayouts(admin, hotel)).payouts.find(
        (x) => x.id === p.payout.id,
      )!.reviewWarnings.length,
    ).toBeGreaterThan(0);
    await db.collection("bookings").doc(p.b).delete();
    await expect(
      cmd({
        action: "cancel",
        payoutId: p.payout.id,
        reason: "Source removed; release reservation",
      }),
    ).resolves.toMatchObject({ status: "Cancelled" });
  });
  it("preserves paid history and reverses recognition after refunds, with debit payable requiring review", async () => {
    const { b, payout } = await prepared();
    await cmd(payInput(payout.id));
    await db
      .collection("refunds")
      .doc(`${b}-refund`)
      .set({
        bookingId: b,
        propertyId: hotel,
        status: "processed",
        amountPaise: 1000,
        paymentId: `${b}-pay`,
        createdAt: "2026-01-03T00:00:00Z",
      });
    await db.collection("bookings").doc(b).update({ refundedPaise: 1000 });
    await processAccounting(db, b);
    const s = await state(b);
    expect(s.summary.payablePaise).toBe(-190000);
    expect(s.status).toBe("review");
    expect(s.reasons.join(" ")).toMatch(/Debit hotel payable/);
    expect(
      (
        await db.collection(service.collections.payouts).doc(payout.id).get()
      ).get("status"),
    ).toBe("Paid");
    const e = await db.runTransaction((tx) => readEvidence(db, tx, b));
    expect(
      e.journal.some((j) => j.type === "recognition_reversal" && j.reverses),
    ).toBe(true);
    expect(totals(e.journal).external_payment_clearing).toBe(-189000);
    expect(
      (await service.readPayouts(admin, hotel)).payouts
        .find((p) => p.id === payout.id)!
        .reviewWarnings.join(" "),
    ).toMatch(/recorded payment is preserved/);
  });
  it("treats changed provider refund status as evidence requiring review after payment", async () => {
    const { b, payout } = await prepared();
    await cmd(payInput(payout.id));
    await db
      .collection("paymentAttempts")
      .doc(`${b}-pay`)
      .update({ status: "refund_pending" });
    await processAccounting(db, b);
    const current = await state(b);
    expect(current.status).toBe("review");
    expect(current.summary.payablePaise).toBe(-190000);
    expect(
      (
        await db.collection(service.collections.payouts).doc(payout.id).get()
      ).get("status"),
    ).toBe("Paid");
  });
  it("rolls back preparation and payment atomically and rejects future dates", async () => {
    const b = await fixture();
    await assess(b);
    const requestId = crypto.randomUUID();
    await expect(
      service.payoutCommand(
        admin,
        hotel,
        { action: "prepare", bookingIds: [b], requestId },
        () => {
          throw Error("INJECTED_ROLLBACK");
        },
      ),
    ).rejects.toThrow("INJECTED");
    expect(
      (await db.collection(service.collections.reservations).doc(b).get())
        .exists,
    ).toBe(false);
    const p = await prepare([b], requestId),
      before = hash((await state(b)).summary);
    await expect(
      cmd({ ...payInput(p.id), paymentDate: "2099-01-01" }),
    ).rejects.toThrow(/future/);
    await expect(
      service.payoutCommand(
        admin,
        hotel,
        {
          ...payInput(p.id),
          acknowledgedBankVersion: hash([hotel, owner, 0]),
          requestId: crypto.randomUUID(),
        },
        () => {
          throw Error("INJECTED_ROLLBACK");
        },
      ),
    ).rejects.toThrow("INJECTED");
    expect(hash((await state(b)).summary)).toBe(before);
    expect(
      (await db.collection(service.collections.payouts).doc(p.id).get()).get(
        "status",
      ),
    ).toBe("Prepared");
    await cmd(payInput(p.id));
  });
  it("limits batches, serializes payment against cancellation, and rebuilds a paid summary", async () => {
    await expect(
      prepare(Array.from({ length: 51 }, (_, i) => `limit-${i}`)),
    ).rejects.toThrow(/50/);
    const { b, payout } = await prepared();
    const results = await Promise.allSettled([
      cmd(payInput(payout.id)),
      cmd({
        action: "cancel",
        payoutId: payout.id,
        reason: "Concurrent local cancellation",
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const committed = (
      await db.collection(service.collections.payouts).doc(payout.id).get()
    ).data()!;
    const reservation = (
      await db.collection(service.collections.reservations).doc(b).get()
    ).data()!;
    expect(reservation.status).toBe(
      committed.status === "Paid" ? "consumed" : "released",
    );
    const paid = await prepared();
    await cmd(payInput(paid.payout.id));
    await db
      .collection(stateCollection)
      .doc(paid.b)
      .update({ summary: { payablePaise: 999 } });
    const accounting = await import("@/lib/accounting/service");
    await accounting.accountingCommand(admin, hotel, {
      action: "rebuild_summary",
      bookingId: paid.b,
      requestId: crypto.randomUUID(),
    });
    const evidence = await db.runTransaction((tx) =>
      readEvidence(db, tx, paid.b),
    );
    expect(evidence.state.summary).toEqual(summary(evidence.journal));
    expect(evidence.state.summary.payablePaise).toBe(0);
    expect(
      (await service.readPayouts(admin, hotel)).payouts.find(
        (p) => p.id === paid.payout.id,
      )!.reviewWarnings,
    ).toEqual([]);
  });
  it("requires bank acknowledgement for legacy baselines and changes, rejects stale acknowledgement, and preserves Paid snapshots", async () => {
    const readiness = await import("@/lib/payout-readiness/service");
    process.env.HOTEL_BANK_ENCRYPTION_KEY = "cd".repeat(32);
    const account = {
      holderName: "Fixture Owner",
      accountNumber: "000123456789",
      confirmation: "000123456789",
      ifsc: "HDFC0001234",
      bankName: "Fixture Bank",
    };
    const saveBank = async (bankName: string) =>
      readiness.readinessCommand(admin, hotel, {
        action: "bank",
        bank: { ...account, bankName },
        expectedVersion: (await readiness.readReadiness(admin, hotel)).version,
        requestId: crypto.randomUUID(),
      });
    const directPay = (
      payoutId: string,
      acknowledgedBankVersion?: string,
      requestId = crypto.randomUUID(),
    ) =>
      service.payoutCommand(admin, hotel, {
        ...payInput(payoutId),
        ...(acknowledgedBankVersion ? { acknowledgedBankVersion } : {}),
        requestId,
      });
    try {
      const legacy = await prepared();
      await db
        .collection(service.collections.payouts)
        .doc(legacy.payout.id)
        .update({ readinessSnapshot: null });
      await expect(directPay(legacy.payout.id)).rejects.toMatchObject({
        code: "BANK_ACKNOWLEDGEMENT_REQUIRED",
      });
      await directPay(
        legacy.payout.id,
        (await readiness.readReadiness(admin, hotel)).bankVersion,
      );
      expect(
        (
          await db
            .collection(service.collections.payouts)
            .doc(legacy.payout.id)
            .get()
        ).get("readinessSnapshot"),
      ).toBeNull();
      await saveBank("First Bank");
      const unchanged = await prepared();
      await directPay(unchanged.payout.id);
      const normal = await prepared();
      const ref = db
        .collection(service.collections.payouts)
        .doc(normal.payout.id);
      const original = (await ref.get()).get("readinessSnapshot");
      expect(original.bank.maskedAccount).toBe("•••• 6789");
      const version1 = (await readiness.readReadiness(admin, hotel))
        .bankVersion;
      await saveBank("Second Bank");
      await expect(directPay(normal.payout.id)).rejects.toMatchObject({
        code: "BANK_ACKNOWLEDGEMENT_REQUIRED",
      });
      await expect(directPay(normal.payout.id, version1)).rejects.toMatchObject(
        { code: "BANK_ACKNOWLEDGEMENT_REQUIRED" },
      );
      const version2 = (await readiness.readReadiness(admin, hotel))
        .bankVersion;
      await saveBank("Third Bank");
      await expect(directPay(normal.payout.id, version2)).rejects.toMatchObject(
        { code: "BANK_ACKNOWLEDGEMENT_REQUIRED" },
      );
      const current = (await readiness.readReadiness(admin, hotel)).bankVersion,
        requestId = crypto.randomUUID();
      const paid = await directPay(normal.payout.id, current, requestId);
      expect(await directPay(normal.payout.id, current, requestId)).toEqual(
        paid,
      );
      const committed = (await ref.get()).data()!;
      expect(committed.readinessSnapshot).toEqual(original);
      expect(committed.payment.bank.bankName).toBe("Third Bank");
      expect(committed.payment.acknowledgedBankVersion).toBe(current);
      const { settlementStatement } = await import("@/lib/payouts/statement");
      const statement = settlementStatement(
        committed as import("@/lib/payouts/service").Payout,
      );
      await saveBank("Fourth Bank");
      expect(
        settlementStatement(
          (await ref.get()).data() as import("@/lib/payouts/service").Payout,
        ),
      ).toEqual(statement);
      expect(
        JSON.stringify(
          (await ref.collection("history").get()).docs.map((d) => d.data()),
        ),
      ).not.toContain(account.accountNumber);
      await expect(directPay(normal.payout.id, current)).rejects.toThrow();
      await db.collection("properties").doc(hotel).update({ ownerId: staff });
      await db
        .collection("propertyMemberships")
        .doc(`${hotel}_${staff}`)
        .update({ role: "owner" });
      try {
        await expect(
          service.readPayouts(owner, hotel, true),
        ).rejects.toMatchObject({ status: 403 });
        const newOwner = await service.readPayouts(staff, hotel, true);
        const historical = newOwner.payouts.find(
          (p) => p.id === normal.payout.id,
        )!;
        expect(historical.readinessSnapshot?.bank).toBeNull();
        expect(historical.payment?.bank).toBeNull();
        expect(JSON.stringify(historical.history)).not.toContain("Third Bank");
      } finally {
        await db.collection("properties").doc(hotel).update({ ownerId: owner });
        await db
          .collection("propertyMemberships")
          .doc(`${hotel}_${staff}`)
          .update({ role: "manager" });
      }
    } finally {
      await db.recursiveDelete(
        db.collection(readiness.bankCollection).doc(hotel),
      );
      await db.recursiveDelete(
        db.collection(readiness.reviewCollection).doc(hotel),
      );
      delete process.env.HOTEL_BANK_ENCRYPTION_KEY;
    }
  });
  it("enforces owner-only history, active admin and cross-hotel isolation", async () => {
    expect(
      (await service.readPayouts(owner, hotel, true)).payouts.length,
    ).toBeGreaterThan(0);
    await expect(service.readPayouts(staff, hotel, true)).rejects.toThrow();
    await expect(service.readPayouts(owner, hotel)).rejects.toThrow();
    const { b, payout } = await prepared();
    await expect(
      service.payoutCommand(admin, other, {
        ...payInput(payout.id),
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toThrow();
    await expect(
      service.payoutCommand(admin, other, {
        action: "prepare",
        bookingIds: [b],
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toThrow();
    await db.collection("users").doc(admin).update({ isActive: false });
    await expect(service.readPayouts(admin, hotel)).rejects.toThrow();
    await expect(cmd(payInput(payout.id))).rejects.toThrow();
    await db.collection("users").doc(admin).update({ isActive: true });
  });
});
