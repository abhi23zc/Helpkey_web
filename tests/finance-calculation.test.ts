import { describe, it, expect } from "vitest";
import { allocate, calculateLine, calculateAgreement, cancellationRefundV2, resolvePaymentChoices, reverseLine, reverseCommission, sumMoney, validateRegistry, taxRuleSchema, type ChargeInput, type TaxProfile } from "@/lib/finance/calculation";
import { syntheticRules } from "@/lib/finance/development-fixtures";
import { DEFAULT_POLICY } from "@/lib/finance/domain";
const profile: TaxProfile = { jurisdiction: "example", registration: "registered", profileKind: "example", supplierId: "hotel", invoiceResponsibility: "hotel", reviewedBy: "admin", reviewedAt: "2026-01-01T00:00:00.000Z", profileContentRevision: 1 };
const charge: ChargeInput = { id: "room:2027-01-01", kind: "room", category: "accommodation", quantity: 1, enteredUnitPaise: 200000, basis: "tax_exclusive", reviewedBasis: "tax_exclusive", bookingMode: "overnight", serviceDates: { night_date: "2027-01-01" }, supplierId: "hotel", invoiceResponsibility: "hotel" };
const rules = syntheticRules();
const cancellation = { freeUntil: "2026-12-30T00:00:00.000Z", lateCharge: { kind: "percentage" as const, basisPoints: 2500, basis: "final_total" as const }, noShow: { kind: "fixed" as const, amountPaise: 999999 }, taxTreatmentReference: "reviewed-example" };
const policy = { ...DEFAULT_POLICY, paymentOptions: ["full_online", "advance_online", "pay_at_property"] as ("full_online" | "advance_online" | "pay_at_property")[] };
const agreement = (changes = {}) => calculateAgreement({ charges: [charge], profile, rules, global: policy, effective: policy, source: "marketplace", cancellation, versions: { taxRegistry: 1, policy: 1 }, ...changes });
describe("authoritative financial calculation v2", () => {
  it("calculates synthetic exclusive ₹2,000 → ₹2,200", () => expect(calculateLine(charge, profile, rules)).toMatchObject({ taxablePaise: 200000, taxPaise: 20000, totalPaise: 220000 }));
  it("reverses inclusive ₹2,200 to taxable ₹2,000 without changing gross", () => expect(calculateLine({ ...charge, basis: "tax_inclusive", reviewedBasis: "tax_inclusive", enteredUnitPaise: 220000 }, profile, rules)).toMatchObject({ taxablePaise: 200000, taxPaise: 20000, totalPaise: 220000 }));
  it("uses stable component order for rounding remainders", () => {
    const line = calculateLine({ ...charge, enteredUnitPaise: 5 }, profile, rules);
    expect(line.taxPaise).toBe(1); expect(line.components.map(c => c.amountPaise)).toEqual([1, 0]);
  });
  it("rejects arithmetic overflow", () => { expect(() => calculateLine({ ...charge, enteredUnitPaise: Number.MAX_SAFE_INTEGER, quantity: 2 }, profile, rules)).toThrow(); expect(() => sumMoney([Number.MAX_SAFE_INTEGER, 1])).toThrow("MONEY_OVERFLOW"); });
  it("requires reviewed price basis", () => expect(() => calculateLine({ ...charge, reviewedBasis: "tax_inclusive" }, profile, rules)).toThrow("PRICE_REVIEW_REQUIRED"));
  it("requires hourly treatment", () => {
    const hourly = { ...charge, bookingMode: "hourly" as const, serviceDates: { hourly_start: "2027-01-01" } };
    expect(calculateLine(hourly, profile, rules).totalPaise).toBe(220000);
    expect(() => calculateLine(hourly, profile, rules.filter(r => r.serviceDateBasis !== "hourly_start"))).toThrow("MISSING_TAX_COVERAGE");
  });
  it("rejects missing fulfilment dates", () => expect(() => calculateLine({ ...charge, bookingMode: "service", category: "food", serviceDates: {} }, profile, rules)).toThrow("MISSING_SERVICE_DATE"));
  it("fails closed on expired, missing and ambiguous coverage", () => {
    expect(() => calculateLine({ ...charge, serviceDates: { night_date: "2031-01-01" } }, profile, rules)).toThrow("MISSING_TAX_COVERAGE");
    expect(() => calculateLine(charge, { ...profile, jurisdiction: "unknown" }, rules)).toThrow("MISSING_TAX_COVERAGE");
    expect(() => calculateLine(charge, profile, [...rules, rules[0]])).toThrow("AMBIGUOUS_TAX_COVERAGE");
  });
  it("validates nightly thresholds per unit/day including inclusive candidates", () => {
    const first = rules[0];
    const tiers = [ { ...first, scope: { ...first.scope, maximumTaxablePaise: 199999 } }, { ...first, id: "higher", components: [{ code: "example", basisPoints: 2000 }], scope: { ...first.scope, minimumTaxablePaise: 200000 } } ];
    expect(calculateLine({ ...charge, enteredUnitPaise: 100000, quantity: 2 }, profile, tiers).taxPaise).toBe(20000);
    expect(calculateLine({ ...charge, enteredUnitPaise: 240000, basis: "tax_inclusive", reviewedBasis: "tax_inclusive" }, profile, tiers).ruleId).toBe("higher");
  });
  it("rejects overlapping publication and synthetic production rules", () => { expect(() => validateRegistry(rules)).toThrow("SYNTHETIC_PRODUCTION_RULE"); expect(() => validateRegistry([...rules, { ...rules[0], id: "overlap" }], false)).toThrow("OVERLAPPING_TAX_RULES"); });
  it("zero and exempt rules require reasons and no tax", () => {
    for (const treatment of ["zero_rated", "exempt"] as const) {
      const r = { ...rules[0], treatment, components: [], reason: "Reviewed statutory reason" };
      expect(calculateLine(charge, profile, [r]).taxPaise).toBe(0);
      expect(() => taxRuleSchema.parse({ ...r, reason: "" })).toThrow();
    }
  });
  it("applies advance to room plus extra taxes", () => {
    const extra = { ...charge, id: "extra", kind: "extra" as const, category: "food", bookingMode: "service" as const, serviceDates: { fulfilment_date: "2027-01-01" }, enteredUnitPaise: 100000 };
    expect(agreement({ charges: [charge, extra], selected: "advance_online" }).publicCalculation).toMatchObject({ totalPaise: 330000, payableNowPaise: 82500, hotelBalancePaise: 247500 });
  });
  it("caps fixed advances and filters gateway minimum", () => {
    const fixed = { ...policy, advance: { kind: "fixed" as const, amountPaise: 999999 } };
    expect(resolvePaymentChoices(1000, policy, fixed, undefined, "advance_online").payableNowPaise).toBe(1000);
    const result = resolvePaymentChoices(200, policy, policy);
    expect(result.available).toEqual(["full_online", "pay_at_property"]); expect(result.excluded).toContainEqual({ option: "advance_online", reason: "gateway_minimum" });
  });
  it("rejects invalid restrictions and disallowed options", () => {
    expect(resolvePaymentChoices(1000, DEFAULT_POLICY, policy).available).toEqual(policy.paymentOptions);
    expect(() => resolvePaymentChoices(1000, policy, policy, [])).toThrow("INVALID_PAYMENT_RESTRICTION");
    expect(() => resolvePaymentChoices(1000, policy, policy, ["full_online"], "pay_at_property")).toThrow("PAYMENT_OPTION_NOT_AVAILABLE");
    expect(() => resolvePaymentChoices(1, DEFAULT_POLICY, DEFAULT_POLICY)).toThrow("NO_PAYMENT_OPTIONS");
  });
  it("requires positive advance and defaults to full online", () => { expect(agreement().publicCalculation.selected).toBe("full_online"); expect(resolvePaymentChoices(1000, policy, { ...policy, advance: { kind: "fixed", amountPaise: 0 } }).excluded).toContainEqual({ option: "advance_online", reason: "positive_advance_required" }); });
  it("selects direct commission separately and keeps customer DTO private", () => {
    const result = agreement({ source: "hotel_direct" });
    expect(result.internal.commissionPaise).toBe(0); expect(result.publicCalculation).not.toHaveProperty("commission"); expect(result.publicCalculation).not.toHaveProperty("deductions"); expect(agreement().internal.commissionPaise).toBe(20000); expect(result.internal.providerCharges.amountPaise).toBeNull();
  });
  it("does not mutate deduction provenance or accumulate values", () => { const inputs = { accumulatedValue: 100, asOf: "saved" }; const a = agreement({ deductionInputs: inputs }); agreement({ deductionInputs: inputs }); expect(inputs).toEqual({ accumulatedValue: 100, asOf: "saved" }); expect(a.internal.deductions.status).toBe("pending_assessment"); });
  it("refunds collected funds by deadline and caps late/no-show penalties", () => {
    const c = agreement().publicCalculation;
    expect(cancellationRefundV2(c, 55000, 0, Date.parse(c.cancellation.freeUntil))).toBe(55000);
    expect(cancellationRefundV2(c, 55000, 0, Date.parse(c.cancellation.freeUntil) + 1)).toBe(0);
    expect(cancellationRefundV2(c, 220000, 0, Date.parse(c.cancellation.freeUntil) + 1)).toBe(165000);
    expect(cancellationRefundV2(c, 55000, 0, Date.now(), true)).toBe(0);
  });
  it("reverses saved components with caps and exact reconciliation", () => {
    const line = calculateLine(charge, profile, rules);
    const first = reverseLine(line, 12345), last = reverseLine(line, line.totalPaise - first.totalPaise, [first]);
    expect(first.taxablePaise + first.taxPaise).toBe(first.totalPaise); expect(first.taxPaise).toBe(sumMoney(first.components.map(c => c.amountPaise)));
    expect(first.taxablePaise + last.taxablePaise).toBe(line.taxablePaise); expect(first.taxPaise + last.taxPaise).toBe(line.taxPaise);
    expect(() => reverseLine(line, 1, [first, last])).toThrow("REDUCTION_EXCEEDS_REMAINING");
  });
  it("reverses saved commission cumulatively without penny drift", () => {
    const line = calculateLine({ ...charge, enteredUnitPaise: 3 }, profile, [{ ...rules[0], treatment: "exempt", components: [] }]);
    const a = reverseLine(line, 1), b = reverseLine(line, 1, [a]), c = reverseLine(line, 1, [a, b]);
    expect(reverseCommission(line, 1, a) + reverseCommission(line, 1, b, [a]) + reverseCommission(line, 1, c, [a, b])).toBe(1);
  });
  it("allocates negotiated aggregate room prices deterministically", () => expect(allocate(10001, [1, 1, 1])).toEqual([3334, 3334, 3333]));
});
