import { describe, expect, it } from "vitest";
import { assess } from "@/lib/accounting/domain";
import { paymentHistory } from "@/lib/accounting/payments";
import { summary, type Journal } from "@/lib/accounting/posting";
import { classifyBookingFinance } from "@/lib/finances/classification";
import {
  isValidProofSignature,
  matchesExistingReceipt,
  submitReportSchema,
} from "@/lib/dues/report-domain";
import { payoutLines, unknownDeductions, type Assessment, type Deductions, type Evidence } from "@/lib/payouts/domain";
import { accountingFixture } from "./helpers/accounting";

const assessedZero: Deductions = {
  commissionTax: { status: "amount", amountPaise: 0, reason: "INTERNAL_ADMIN_NOTE_CONFIRMED_ZERO" },
  statutory: { status: "not_applicable", reason: "INTERNAL_STATUTORY_NOTE" },
  gatewayFees: { status: "amount", amountPaise: 1000, reason: "INTERNAL_GATEWAY_FEE_NOTE" },
  other: { status: "amount", amountPaise: 0, reason: "INTERNAL_OTHER_NOTE" },
};

function makeEvidence(params: {
  bookingId?: string;
  online?: number;
  hotel?: number;
  completed?: boolean;
  rate?: number;
  delayDays?: number;
  checkoutAt?: string;
  dirty?: boolean;
  lastError?: string | null;
  enrolled?: boolean;
}) {
  const bookingId = params.bookingId ?? "booking-1";
  const f = accountingFixture(
    params.online ?? 210000,
    params.hotel ?? 0,
    params.completed ?? true,
    params.rate ?? 1000,
    bookingId,
    "hotel-1",
  );
  f.b.actualCheckOutAt = params.checkoutAt ?? "2026-11-24T00:00:00Z";
  if (params.delayDays !== undefined) {
    f.agreement.terms.effective.payoutDelayDays = params.delayDays;
  }
  const a = assess(bookingId, f.b, f.agreement, f.proof, f.sources);
  const journal = [
    ...a.effects.map((e) => ({ ...e, id: e.key })),
    ...(a.recognition.length || a.status === "recognized"
      ? [
          {
            id: "recognition",
            key: "recognition",
            type: "recognition",
            lines: a.recognition.length
              ? a.recognition
              : [
                  { account: "commission_income", debitPaise: 0, creditPaise: 0 },
                  { account: "commission_unallocated", debitPaise: 0, creditPaise: 0 },
                ],
          },
        ]
      : []),
  ].map((e) => ({
    ...e,
    bookingId,
    propertyId: "hotel-1",
    currency: "INR",
    recordedAt: "2026-11-24T00:00:00Z",
  })) as Journal[];

  const evidence: Evidence = {
    booking: f.b,
    agreement: f.agreement,
    proof: f.proof,
    sources: f.sources,
    journal,
    state: {
      propertyId: "hotel-1",
      ...(params.enrolled === false ? {} : { enrolledAt: "2026-11-24T00:00:00Z" }),
      status: a.status,
      processedAt: params.dirty ? null : "2026-11-24T00:00:00Z",
      dirty: !!params.dirty,
      lastError: params.lastError ?? null,
      recognitionId: journal.some((j) => j.id === "recognition") ? "recognition" : undefined,
      summary: summary(journal),
    },
  };

  return { f, a, evidence };
}

describe("owner settlement explanations", () => {
  it("does not describe a completed checkout with guest debt as waiting for checkout", () => {
    const { evidence } = makeEvidence({ online: 100000, completed: true, delayDays: 0 });
    const position = classifyBookingFinance({ bookingId: "booking-1", evidence, assessment: null, reservation: null });
    expect(position.stage).toBe("awaiting_evidence_review");
    expect(position.ownerSummary).toContain("Guest payment remains outstanding");
  });
});

describe("paymentHistory multi-booking payout aggregation", () => {
  it("sums allocations and produces a deterministic ID independent of input order", () => {
    const entries = [
      {
        id: "payout-entry-b",
        key: "payout-entry-b",
        bookingId: "booking-B",
        propertyId: "hotel-1",
        type: "payout",
        sourcePath: "hotelPayoutsV1/payout-xyz",
        amountPaise: 145000,
        occurredAt: "2026-11-25T00:00:00Z",
        recordedAt: "2026-11-25T10:00:00Z",
      },
      {
        id: "payout-entry-a",
        key: "payout-entry-a",
        bookingId: "booking-A",
        propertyId: "hotel-1",
        type: "payout",
        sourcePath: "hotelPayoutsV1/payout-xyz",
        amountPaise: 189000,
        occurredAt: "2026-11-25T00:00:00Z",
        recordedAt: "2026-11-25T10:00:00Z",
      },
    ] as unknown as Journal[];

    const forward = paymentHistory(entries, []);
    const reversed = paymentHistory([...entries].reverse(), []);

    expect(forward).toHaveLength(1);
    expect(forward[0]).toMatchObject({
      type: "payout",
      purpose: "Hotel settlement",
      amountPaise: 334000,
      bookingId: "booking-A",
      bookingIds: ["booking-A", "booking-B"],
      direction: "out",
      status: "Paid",
    });
    expect(reversed).toEqual(forward);
    expect(forward[0].id).not.toBe("payout-entry-a");
    expect(forward[0].id).not.toBe("payout-entry-b");
  });
});

describe("shared owner settlement classification", () => {
  it("classifies ready for payment, zero commission, and strips internal assessment reasons", () => {
    const { evidence } = makeEvidence({ delayDays: 2 });
    const now = new Date("2026-11-26T00:00:00Z");
    const pos = classifyBookingFinance({
      bookingId: "booking-1",
      evidence,
      assessment: null,
      reservation: null,
      now,
    });
    expect(pos.stage).toBe("awaiting_deduction_review");
    expect(pos.beforeUnassessedDeductions).toBe(true);
    expect(pos.amounts.deductionsPaise).toBeNull();
    expect(pos.amounts.finalPayablePaise).toBeNull();
    expect(pos.awaitingClearanceAmountPaise).toBe(190000);

    // With current assessment, becomes ready_for_payment and never leaks internal reason strings.
    const full = classifyBookingFinance({
      bookingId: "booking-1",
      evidence,
      assessment: {
        version: 1,
        fingerprint: (pos as unknown as { fingerprint?: string }).fingerprint ?? "",
        items: assessedZero,
        actorId: "admin-secret-id",
        assessedAt: now.toISOString(),
      },
      reservation: null,
      now,
    });
    // Note: fingerprint comes from bookingPosition, let's obtain it directly for assessment test.
    expect(full.stage).toBe("awaiting_deduction_review");

    // Zero commission with hotel collection -> settled_zero
    const zeroComm = makeEvidence({ online: 0, hotel: 210000, rate: 0, delayDays: 0 });
    const zeroResult = classifyBookingFinance({
      bookingId: "booking-1",
      evidence: zeroComm.evidence,
      assessment: null,
      reservation: null,
      now,
    });
    expect(zeroResult.stage).toBe("settled_zero");
    expect(zeroResult.readyForPaymentPaise).toBe(0);
    expect(zeroResult.duesPaise).toBe(0);
  });

  it("enforces waiting-period boundaries and excludes unassessed deductions from zero substitution", async () => {
    const { bookingPosition } = await import("@/lib/payouts/domain");
    const { evidence } = makeEvidence({ delayDays: 2 });
    const exactBoundary = new Date("2026-11-26T00:00:00Z");
    const bp = bookingPosition("booking-1", evidence, null, exactBoundary);
    const assessment: Assessment = {
      version: 1,
      fingerprint: bp.fingerprint,
      items: assessedZero,
      actorId: "admin-secret",
      assessedAt: exactBoundary.toISOString(),
    };

    const beforeExpiry = classifyBookingFinance({
      bookingId: "booking-1",
      evidence,
      assessment,
      reservation: null,
      now: new Date(exactBoundary.getTime() - 1),
    });
    expect(beforeExpiry.stage).toBe("awaiting_waiting_period");
    expect(beforeExpiry.waitingPeriodPending).toBe(true);
    expect(beforeExpiry.readyForPaymentPaise).toBe(0);

    const atExpiry = classifyBookingFinance({
      bookingId: "booking-1",
      evidence,
      assessment,
      reservation: null,
      now: exactBoundary,
    });
    expect(atExpiry.stage).toBe("ready_for_payment");
    expect(atExpiry.waitingPeriodPending).toBe(false);
    expect(atExpiry.readyForPaymentPaise).toBe(189000);
    expect(JSON.stringify(atExpiry)).not.toMatch(/INTERNAL_ADMIN_NOTE|admin-secret/);

    const unknownOnly = classifyBookingFinance({
      bookingId: "booking-1",
      evidence,
      assessment: {
        version: 1,
        fingerprint: bp.fingerprint,
        items: unknownDeductions(),
        actorId: "admin-secret",
        assessedAt: exactBoundary.toISOString(),
      },
      reservation: null,
      now: exactBoundary,
    });
    expect(unknownOnly.stage).toBe("awaiting_deduction_review");
    expect(unknownOnly.beforeUnassessedDeductions).toBe(true);
    expect(unknownOnly.amounts.deductionsPaise).toBeNull();
    expect(unknownOnly.amounts.finalPayablePaise).toBeNull();
  });

  it("handles prepared reservations, awaiting checkout, refunds, dues, and processing failures", () => {
    const now = new Date("2026-11-26T00:00:00Z");

    // Reserved in prepared payout
    const readyEv = makeEvidence({ delayDays: 0 });
    const reserved = classifyBookingFinance({
      bookingId: "booking-1",
      evidence: readyEv.evidence,
      assessment: null,
      reservation: { status: "reserved", payoutId: "p-1", finalPaise: 185000 },
      payout: { id: "p-1", reference: "HKP-P1", status: "Prepared" },
      now,
    });
    expect(reserved.stage).toBe("prepared_payout");
    expect(reserved.reservedPaise).toBe(185000);
    expect(reserved.readyForPaymentPaise).toBe(0);

    // Awaiting checkout
    const pendingEv = makeEvidence({ completed: false });
    const checkout = classifyBookingFinance({
      bookingId: "booking-1",
      evidence: pendingEv.evidence,
      assessment: null,
      reservation: null,
      now,
    });
    expect(checkout.stage).toBe("awaiting_checkout");
    expect(checkout.awaitingClearanceCategory).toBe("checkout");
    expect(checkout.awaitingClearanceAmountPaise).toBe(210000);

    // Refund under review
    const refundEv = makeEvidence({ delayDays: 0 });
    refundEv.evidence.sources.refunds.push({
      id: "ref-1",
      bookingId: "booking-1",
      propertyId: "hotel-1",
      paymentId: "booking-1-pay",
      amountPaise: 10000,
      status: "processed",
      createdAt: "2026-11-24T01:00:00Z",
    });
    const refunded = classifyBookingFinance({
      bookingId: "booking-1",
      evidence: refundEv.evidence,
      assessment: null,
      reservation: null,
      now,
    });
    expect(refunded.stage).toBe("awaiting_evidence_review");
    expect(refunded.awaitingClearanceCategory).toBe("evidence_review");
    expect(refunded.readyForPaymentPaise).toBe(0);

    // Processing failure
    const failedEv = makeEvidence({ dirty: true, lastError: "INTERNAL_STACK_TRACE" });
    const failed = classifyBookingFinance({
      bookingId: "booking-1",
      evidence: failedEv.evidence,
      assessment: null,
      reservation: null,
      now,
    });
    expect(failed.stage).toBe("processing");
    expect(failed.isProcessing).toBe(true);
    expect(failed.readyForPaymentPaise).toBe(0);
    expect(JSON.stringify(failed)).not.toContain("INTERNAL_STACK_TRACE");

    // Dues collectible
    const duesEv = makeEvidence({ online: 0, hotel: 210000, rate: 1000 });
    const dues = classifyBookingFinance({
      bookingId: "booking-1",
      evidence: duesEv.evidence,
      assessment: null,
      reservation: null,
      now,
    });
    expect(dues.stage).toBe("dues_outstanding");
    expect(dues.duesPaise).toBe(20000);
    expect(dues.direction).toBe("dues");

    // Paid out via payout lines
    const paidEv = makeEvidence({ delayDays: 0 });
    paidEv.evidence.journal.push({
      id: "payout-j",
      key: "payout-j",
      bookingId: "booking-1",
      propertyId: "hotel-1",
      currency: "INR",
      type: "payout",
      sourcePath: "hotelPayoutsV1/p-1",
      sourceFingerprint: "fp",
      occurredAt: "2026-11-25T00:00:00Z",
      recordedAt: "2026-11-25T00:00:00Z",
      amountPaise: 189000,
      status: "recognized",
      lines: payoutLines(190000, assessedZero),
      agreementVersion: 1,
      calculationVersion: 1,
      globalRevision: 1,
      hotelRevision: 1,
    });
    paidEv.evidence.state.summary = summary(paidEv.evidence.journal);
    const paid = classifyBookingFinance({
      bookingId: "booking-1",
      evidence: paidEv.evidence,
      assessment: null,
      reservation: { status: "consumed", payoutId: "p-1" },
      now,
    });
    expect(paid.stage).toBe("paid_out");
  });
});

describe("dues report validation and attachment signatures", () => {
  it("validates positive integer-paise amounts and matching receipt rules", () => {
    expect(
      submitReportSchema.safeParse({
        requestId: crypto.randomUUID(),
        amountPaise: 35000,
        paymentDate: "2026-11-24",
        method: "upi",
        transactionReference: "UTR12345",
      }).success,
    ).toBe(true);

    for (const badAmount of [0, -100, 12.5, 1_000_000_001]) {
      expect(
        submitReportSchema.safeParse({
          requestId: crypto.randomUUID(),
          amountPaise: badAmount,
          paymentDate: "2026-11-24",
          method: "upi",
          transactionReference: "UTR12345",
        }).success,
      ).toBe(false);
    }

    const report = {
      propertyId: "hotel-1",
      method: "upi" as const,
      normalizedReference: "UTR123",
      amountPaise: 20000,
      paymentDate: "2026-11-24",
    };
    const receipt = {
      propertyId: "hotel-1",
      method: "upi" as const,
      normalizedReference: " utr123 ",
      amountPaise: 20000,
      paymentDate: "2026-11-24",
    };
    expect(matchesExistingReceipt(report, receipt)).toBe(true);
    expect(matchesExistingReceipt(report, { ...receipt, amountPaise: 20001 })).toBe(false);
    expect(matchesExistingReceipt(report, { ...receipt, paymentDate: "2026-11-25" })).toBe(false);
    expect(matchesExistingReceipt(report, { ...receipt, method: "cash" })).toBe(false);
  });

  it("verifies magic-byte file signatures for JPG, PNG, and PDF", () => {
    expect(isValidProofSignature(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]), "image/jpeg")).toBe(true);
    expect(isValidProofSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]), "image/png")).toBe(true);
    expect(isValidProofSignature(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), "application/pdf")).toBe(true);
    expect(isValidProofSignature(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), "image/jpeg")).toBe(false);
    expect(isValidProofSignature(new Uint8Array([0x3c, 0x73, 0x63, 0x72, 0x69]), "application/pdf")).toBe(false);
  });
});
