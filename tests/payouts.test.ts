import { describe, expect, it } from "vitest";
import { bookingPosition, deductionTotal, dueGuidance, payoutLines, unknownDeductions, type Assessment, type Deductions, type Evidence } from "@/lib/payouts/domain";
import { assess, assertBalanced, hash } from "@/lib/accounting/domain";
import { summary, type Journal } from "@/lib/accounting/posting";
import { accountingFixture } from "./helpers/accounting";
const zero: Deductions = { commissionTax: { status: "amount", amountPaise: 0, reason: "Explicit zero" }, statutory: { status: "not_applicable", reason: "Not applicable for this booking" }, gatewayFees: { status: "amount", amountPaise: 1000, reason: "Verified fee" }, other: { status: "amount", amountPaise: 0, reason: "No adjustment" } };
function fixture(delay: number | undefined = 2, completed = true) {
  const f = accountingFixture(210000, 0, completed); f.b.actualCheckOutAt = "2026-11-24T00:00:00Z";
  if (delay !== undefined) f.agreement.terms.effective.payoutDelayDays = delay;
  const a = assess("booking", f.b, f.agreement, f.proof, f.sources);
  const journal = [...a.effects.map(e => ({ ...e, id: e.key })), { id: "recognition", key: "recognition", lines: a.recognition.length ? a.recognition : [{ account: "commission_income", debitPaise: 0, creditPaise: 0 }, { account: "commission_unallocated", debitPaise: 0, creditPaise: 0 }], type: "recognition" }].map(e => ({ ...e, bookingId: "booking", propertyId: "hotel", currency: "INR" })) as Journal[];
  const evidence: Evidence = { booking: f.b, agreement: f.agreement, proof: f.proof, sources: f.sources, journal, state: { enrolledAt: "yes", status: a.status, processedAt: "yes", recognitionId: "recognition", summary: summary(journal) } };
  const now = new Date("2026-11-26T00:00:00Z"), p = bookingPosition("booking", evidence, null, now);
  const assessment: Assessment = { version: 1, fingerprint: p.fingerprint, items: zero, actorId: "admin", assessedAt: now.toISOString() };
  return { evidence, assessment, now };
}
describe("hotel payout eligibility and assessment", () => {
  it("starts every deduction Unknown; requires explicit zero or Not applicable and reasons", () => {
    expect(deductionTotal(unknownDeductions())).toBeNull(); expect(deductionTotal(zero)).toBe(1000);
    expect(() => deductionTotal({ ...zero, commissionTax: { status: "amount", amountPaise: -1, reason: "bad" } })).toThrow();
    expect(() => deductionTotal({ ...zero, statutory: { status: "not_applicable", reason: "" } })).toThrow();
  });
  it("uses elapsed 24-hour days with an inclusive eligibility boundary", () => {
    const { evidence, assessment, now } = fixture();
    expect(bookingPosition("booking", evidence, assessment, new Date(now.getTime() - 1)).eligible).toBe(false);
    expect(bookingPosition("booking", evidence, assessment, now)).toMatchObject({ eligible: true, grossPaise: 190000, deductionsPaise: 1000, finalPaise: 189000, verifiedOnlinePaise: 210000, commissionPaise: 20000 });
  });
  it("requires saved delay and actual checkout, without using scheduled checkout", () => {
    const f = fixture(); delete f.evidence.agreement!.terms.effective.payoutDelayDays;
    expect(bookingPosition("booking", f.evidence, f.assessment, f.now).eligibleAt).toBeNull();
    const mismatch = fixture(); mismatch.evidence.booking!.actualCheckOutAt = "2026-11-23T00:00:00Z";
    expect(bookingPosition("booking", mismatch.evidence, mismatch.assessment, mismatch.now).reasons).toContain("Actual checkout timestamp differs from validated checkout proof.");
    const g = fixture(); delete g.evidence.booking!.actualCheckOutAt;
    expect(bookingPosition("booking", g.evidence, g.assessment, g.now).eligibleAt).toBeNull();
  });
  it("blocks pending checkout funds and pending accounting", () => {
    const f = fixture(0, false);
    expect(bookingPosition("booking", f.evidence, f.assessment, f.now)).toMatchObject({ eligible: false, pendingOnlinePaise: 210000 });
    const g = fixture(); g.evidence.state.dirty = true;
    expect(bookingPosition("booking", g.evidence, g.assessment, g.now).eligible).toBe(false);
  });
  it("invalidates the assessment when financial evidence changes", () => {
    const f = fixture(); f.evidence.sources.online[0].amountPaise--;
    expect(bookingPosition("booking", f.evidence, f.assessment, f.now)).toMatchObject({ eligible: false, assessmentCurrent: false });
  });
  it("blocks zero and excessive deductions and preserves separate clearing categories", () => {
    const f = fixture(); f.assessment.items = { ...zero, gatewayFees: { status: "amount", amountPaise: 190000, reason: "All payable" } };
    expect(bookingPosition("booking", f.evidence, f.assessment, f.now).eligible).toBe(false);
    const lines = payoutLines(190000, zero); assertBalanced(lines);
    expect(lines).toContainEqual({ account: "hotel_payable", debitPaise: 190000, creditPaise: 0 });
    expect(lines).toContainEqual({ account: "external_payment_clearing", debitPaise: 0, creditPaise: 189000 });
    expect(lines).toContainEqual({ account: "deduction_gatewayFees", debitPaise: 0, creditPaise: 1000 });
    expect(() => payoutLines(1000, zero)).toThrow();
    expect(hash(lines)).not.toBe(hash(payoutLines(200000, zero)));
  });
  it("uses hotel-local daily and weekly dates and reports missing configuration", () => {
    const now = new Date("2026-11-24T23:30:00Z");
    expect(dueGuidance({ payoutCycle: "daily" }, "Asia/Kolkata", now).date).toBe("2026-11-25");
    expect(dueGuidance({ payoutCycle: "weekly", payoutWeekday: "monday" }, "Asia/Kolkata", now).date).toBe("2026-11-30");
    expect(dueGuidance({ payoutCycle: "weekly" }, "Asia/Kolkata", now).issue).toBeTruthy();
    expect(dueGuidance({ payoutCycle: "daily" }, null, now).issue).toBeTruthy();
  });
});
