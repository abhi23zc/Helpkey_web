import { describe, it, expect } from "vitest";
import { applyJournal, assertBalanced, emptyProjection, fingerprint, replay, reversedLines, transfer, allocateReceipt, type Journal } from "@/lib/finance/ledger";
import { assessmentPreview, counterPeriod, type DeductionRule } from "@/lib/finance/assessments";
import { accountSummary, nextPreparationDate, eligibleAllocations } from "@/lib/finance/accounts";
import { DEFAULT_POLICY } from "@/lib/finance/domain";
import type { AccountLine, BookingAccount } from "@/lib/finance/source-integration";
const journal = (revision: number, lines = transfer("helpkey_cash", "customer_obligation", 100)): Journal => ({ id: String(revision), propertyId: "hotel", eventKey: String(revision), fingerprint: "test", currency: "INR", sourceRef: "payment/one", actorId: "admin", reason: "Synthetic test", createdAt: "2026-11-22T00:00:00Z", effectiveAt: "2026-11-22T00:00:00Z", reversalOf: null, ruleRef: null, assessmentRef: null, revision, lines });
export const exampleDeduction: DeductionRule = { id: "synthetic", version: 1, title: "Synthetic example", legalReference: "Synthetic fixture; not legal guidance", synthetic: true, category: "room", recognitionEvent: "checkout", base: "taxable", outcome: "assess", calculation: { kind: "percentage", basisPoints: 100 }, rounding: "half_up_paise", effectiveFrom: "2026-01-01", effectiveThrough: "2027-12-31", applicability: { jurisdictions: ["example"], registrations: ["unregistered"], propertyIds: [], legalParticipant: "hotel_pan" }, threshold: null, correction: "reverse_saved" };
const l: AccountLine = { agreementId: "original", lineId: "room", acceptedAt: "2026-11-01T00:00:00Z", outstandingPaise: 0, helpkeyOwned: false, requestId: null, kind: "room", grossPaise: 10000, taxablePaise: 10000, commissionPaise: 1000, recognizedCommissionPaise: 1000, reducedPaise: 0, commissionReversedPaise: 0, fundedPaise: 10000, hotelFundedPaise: 0, refundReservedPaise: 0, waitHours: 0, fulfilledAt: null, eligibleAt: "2026-11-20T00:00:00Z", providerCharges: "helpkey", assessment: "complete", ruleRefs: [], assessmentId: "assessment", jurisdiction: "example", registration: "unregistered", participant: "ABCDE1234F" };
const booking = (): BookingAccount => ({ bookingId: "booking", propertyId: "hotel", reference: "HK123", status: "checked_out", actualCheckOutAt: "2026-11-20T00:00:00Z", financialResolvedAt: null, scheduledCheckOutAt: "2026-11-20T00:00:00Z", lines: [{ ...l }], allocations: [{ id: "allocation", receiptId: "payment", agreementId: "original", lineId: "room", amountPaise: 10000, reversedPaise: 0, source: "helpkey", feeResolved: true, offsetPaise: 0 }], unallocatedPaise: 0, retentionPending: false, revision: 1 });
describe("immutable finance journals", () => {
  it("rejects unbalanced, empty, fractional and two-sided lines", () => {
    expect(() => assertBalanced([])).toThrow("EMPTY_JOURNAL");
    expect(() => assertBalanced([transfer("helpkey_cash", "customer_obligation", 100)[0]])).toThrow("UNBALANCED");
    expect(() => transfer("helpkey_cash", "customer_obligation", 1.5)).toThrow();
    const x = transfer("helpkey_cash", "customer_obligation", 100); x[0].creditPaise = 1; expect(() => assertBalanced(x)).toThrow("INVALID_JOURNAL_LINE");
  });
  it("replays deterministic balanced reversals without mutating earlier projections", () => {
    const a = journal(1), before = applyJournal(emptyProjection(), a), b = journal(2, reversedLines(a));
    expect(replay([a, b]).balances).toEqual(emptyProjection().balances); expect(before.balances.helpkey_cash).toBe(100);
    expect(() => replay([b])).toThrow("SEQUENCE");
  });
  it("uses stable canonical fingerprints", () => expect(fingerprint({ b: 1, a: { z: 2, x: 3 } })).toBe(fingerprint({ a: { x: 3, z: 2 }, b: 1 })));
  it("allocates oldest accepted agreement first and preserves saved line order", () => {
    const result = allocateReceipt(250, [{ agreementId: "new", lineId: "one", acceptedAt: "2026-02-01", outstandingPaise: 300, helpkeyOwned: false, requestId: null }, { agreementId: "old", lineId: "two", acceptedAt: "2026-01-01", outstandingPaise: 200, helpkeyOwned: false, requestId: null }]);
    expect(result.allocations.map(a => a.amountPaise)).toEqual([200, 50]); expect(result.unallocatedPaise).toBe(0);
  });
  it("restricts bundled receipts to explicit service agreements", () => {
    expect(allocateReceipt(20, [{ agreementId: "room", lineId: "one", acceptedAt: "2026-01-01", outstandingPaise: 100, helpkeyOwned: false, requestId: null }], ["service"]).unallocatedPaise).toBe(20);
  });
});
describe("reviewed assessments", () => {
  it("rounds half up and records reviewed not-applicable outcomes", () => { expect(assessmentPreview(exampleDeduction, 50).amountPaise).toBe(1); expect(assessmentPreview({ ...exampleDeduction, outcome: "not_applicable" }, 10000).amountPaise).toBe(0); });
  it("assesses only excess on crossing and saves counters", () => {
    const r = { ...exampleDeduction, threshold: { amountPaise: 10000, period: "calendar_year" as const, aggregation: "participant" as const, treatment: "excess" as const, timezone: "Asia/Kolkata" } };
    expect(assessmentPreview(r, 5000, 8000)).toMatchObject({ counterBeforePaise: 8000, counterAfterPaise: 13000, qualifyingBasePaise: 3000, amountPaise: 30 });
    expect(assessmentPreview(r, 5000, 13000).amountPaise).toBe(50);
  });
  it("uses the configured financial-year timezone at midnight", () => {
    const r = { ...exampleDeduction, threshold: { amountPaise: 10000, period: "indian_financial_year" as const, aggregation: "participant" as const, treatment: "excess" as const, timezone: "Asia/Kolkata" } };
    expect(counterPeriod(r, "2026-03-31T18:29:59Z")).toBe("2025"); expect(counterPeriod(r, "2026-03-31T18:30:00Z")).toBe("2026");
  });
});
describe("property eligibility and schedules", () => {
  const now = "2026-11-22T00:00:00Z";
  it("excludes unpaid money and HelpKey customer fees", () => { const b = booking(); b.lines[0].helpkeyOwned = true; expect(eligibleAllocations([b], [], true, now)[0].availablePaise).toBe(0); });
  it.each(["assessment", "fee", "retention", "readiness", "waiting"])("holds unresolved %s", reason => {
    const b = booking(); if (reason === "assessment") b.lines[0].assessment = "pending"; if (reason === "fee") b.allocations[0].feeResolved = false; if (reason === "retention") b.retentionPending = true; if (reason === "waiting") b.lines[0].eligibleAt = "2026-11-25T00:00:00Z";
    expect(eligibleAllocations([b], [], reason !== "readiness", now)[0].eligiblePaise).toBe(0);
  });
  it("counts overlapping holds once and shows all reasons", () => { const b = booking(); const h = { amountPaise: 3000, bookingId: null, responsibleAdmin: "admin", releaseCondition: "Review", releasedAt: null, createdAt: now }; const a = eligibleAllocations([b], [{ ...h, id: "one", reason: "Dispute" }, { ...h, id: "two", reason: "Evidence" }], true, now)[0]; expect(a.eligiblePaise).toBe(7000); expect(a.reasons).toEqual(["Dispute", "Evidence"]); });
  it("reserves pending refunds once across multiple allocations", () => { const b = booking(); b.lines[0].refundReservedPaise = 3000; b.allocations[0].amountPaise = 2000; b.allocations.push({ ...b.allocations[0], id: "second", amountPaise: 8000 }); expect(eligibleAllocations([b], [], true, now).reduce((n, a) => n + a.availablePaise, 0)).toBe(7000); });
  it("offsets only eligible funds and preserves separate hotel credit", () => { const p = emptyProjection(); p.balances.hotel_charges = 2000; p.balances.hotel_credit = -1000; const a = accountSummary(p, [booking()], [], DEFAULT_POLICY, true, now); expect(a.balances).toMatchObject({ eligiblePaise: 8000, offsetEstimatePaise: 2000, hotelCreditPaise: 1000 }); expect(a.scheduleEstimate.executionEnabled).toBe(false); });
  it("keeps credit from a reversed settled charge visible", () => { const p = emptyProjection(); p.balances.hotel_charges = -100; expect(accountSummary(p, [], [], DEFAULT_POLICY, true, now).balances.hotelCreditPaise).toBe(100); });
  it("explains minimum payout and invalid readiness without hiding balances", () => { const a = accountSummary(emptyProjection(), [booking()], [], { ...DEFAULT_POLICY, minimumPayoutPaise: 20000 }, false, now); expect(a.balances.helpkeyHeldPaise).toBe(0); expect(a.scheduleEstimate.preparationAt).toBeNull(); });
  it("uses local weekdays and interval boundaries", () => { expect(nextPreparationDate(now, { kind: "weekdays", weekdays: [1], timezone: "Asia/Kolkata", localTime: "10:00" })).toBe("2026-11-23T04:30:00.000Z"); expect(nextPreparationDate(now, { kind: "interval", everyDays: 2, anchorDate: "2026-11-22", timezone: "Asia/Kolkata", localTime: "10:00" })).toBe("2026-11-22T04:30:00.000Z"); });
  it("handles DST skipped and repeated local hours", () => { expect(nextPreparationDate("2026-03-08T05:00:00Z", { kind: "daily", timezone: "America/New_York", localTime: "02:30" })).toBe("2026-03-09T06:30:00.000Z"); expect(nextPreparationDate("2026-11-01T05:45:00Z", { kind: "daily", timezone: "America/New_York", localTime: "01:30" })).toBe("2026-11-01T06:30:00.000Z"); });
});
