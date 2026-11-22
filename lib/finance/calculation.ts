import { z } from "zod";
import { validDate } from "@/lib/booking/domain";
import type { FinancePolicy } from "./domain";

export const moneySchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const basisSchema = z.enum(["tax_exclusive", "tax_inclusive"]);
export const paymentOptions = ["full_online", "advance_online", "pay_at_property"] as const;
export const paymentOptionSchema = z.enum(paymentOptions);
export type PaymentOption = z.infer<typeof paymentOptionSchema>;
const id = z.string().min(1).max(180).regex(/^[a-zA-Z0-9_-]+$/);
const date = z.string().refine(validDate);
const bps = z.number().int().min(0).max(10000);
const unique = <T>(v: T[]) => new Set(v).size === v.length;
export const priceReviewSchema = z.object({ basis: basisSchema, reviewedBy: z.string().min(1), reviewedAt: z.string().datetime() }).strict();
export const taxRuleSchema = z.object({
  id, version: z.number().int().positive(), category: id,
  treatment: z.enum(["percentage", "zero_rated", "exempt"]), reason: z.string().max(2000),
  components: z.array(z.object({ code: id, basisPoints: bps }).strict()).max(10).refine(v => unique(v.map(c => c.code))),
  serviceDateBasis: z.enum(["night_date", "hourly_start", "fulfilment_date", "agreement_date"]),
  scope: z.object({ jurisdictions: z.array(id).min(1), registrations: z.array(z.enum(["registered", "unregistered", "composition", "exempt"])).min(1), bookingModes: z.array(z.enum(["overnight", "hourly", "service"])).min(1), profileKinds: z.array(id).min(1), minimumTaxablePaise: moneySchema, maximumTaxablePaise: moneySchema.nullable(), effectiveFrom: date, effectiveThrough: date }).strict(),
  legalReference: z.string().trim().min(3).max(4000), reviewedBy: z.string().trim().min(1), reviewedAt: z.string().datetime(), synthetic: z.boolean(),
}).strict().superRefine((r, c) => {
  const fail = (message: string) => c.addIssue({ code: "custom", message });
  if (r.scope.effectiveFrom > r.scope.effectiveThrough) fail("Invalid effective dates");
  if (r.scope.maximumTaxablePaise !== null && r.scope.maximumTaxablePaise < r.scope.minimumTaxablePaise) fail("Invalid taxable range");
  const total = r.components.reduce((n, v) => n + v.basisPoints, 0);
  if (total > 10000 || (r.treatment === "percentage" ? total <= 0 : total !== 0 || !r.reason.trim())) fail("Invalid treatment, reason or components");
  if (r.serviceDateBasis === "night_date" && r.scope.bookingModes.some(m => m !== "overnight")) fail("Night-date rules only cover overnight accommodation");
  if (r.serviceDateBasis === "hourly_start" && r.scope.bookingModes.some(m => m !== "hourly")) fail("Hourly rules must be explicit");
});
export type TaxRule = z.infer<typeof taxRuleSchema>;
export type PriceBasis = z.infer<typeof basisSchema>;
export const taxProfileSchema = z.object({ jurisdiction: id, registration: z.enum(["registered", "unregistered", "composition", "exempt"]), profileKind: id, supplierId: id, invoiceResponsibility: z.enum(["hotel", "helpkey", "supplier"]), reviewedBy: z.string().min(1), reviewedAt: z.string().datetime(), profileContentRevision: z.number().int().nonnegative() }).strict();
export type TaxProfile = z.infer<typeof taxProfileSchema>;
export const cancellationSchema = z.object({
  freeUntil: z.string().datetime(), lateCharge: z.discriminatedUnion("kind", [z.object({ kind: z.literal("fixed"), amountPaise: moneySchema }).strict(), z.object({ kind: z.literal("percentage"), basisPoints: bps, basis: z.enum(["final_total", "taxable_total"]) }).strict()]),
  noShow: z.discriminatedUnion("kind", [z.object({ kind: z.literal("fixed"), amountPaise: moneySchema }).strict(), z.object({ kind: z.literal("percentage"), basisPoints: bps, basis: z.enum(["final_total", "taxable_total"]) }).strict()]),
  taxTreatmentReference: z.string().trim().min(1),
}).strict();
export type CancellationTerms = z.infer<typeof cancellationSchema>;
export type ChargeInput = {
  id: string; kind: "room" | "extra" | "service" | "customer_fee"; category: string;
  quantity: number; enteredUnitPaise: number; basis: PriceBasis; reviewedBasis: PriceBasis;
  bookingMode: "overnight" | "hourly" | "service"; serviceDates: Partial<Record<TaxRule["serviceDateBasis"], string>>;
  supplierId: string; invoiceResponsibility: TaxProfile["invoiceResponsibility"];
};
export type ChargeLine = ChargeInput & { ruleId: string; ruleVersion: number; serviceDate: string; taxablePaise: number; taxPaise: number; totalPaise: number; components: { code: string; basisPoints: number; amountPaise: number }[] };
export function checked(n: bigint): number {
  if (n < BigInt(0) || n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("MONEY_OVERFLOW");
  return Number(n);
}
export function halfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator < BigInt(0) || denominator <= BigInt(0)) throw new Error("INVALID_ROUNDING_INPUT");
  return (numerator + denominator / BigInt(2)) / denominator;
}
export function percentage(amount: number, basisPoints: number) { return checked(halfUp(BigInt(moneySchema.parse(amount)) * BigInt(bps.parse(basisPoints)), BigInt(10000))); }
export function sumMoney(values: number[]) { return checked(values.reduce((n, v) => n + BigInt(moneySchema.parse(v)), BigInt(0))); }
/** Floors first, then gives remainder paise to components in saved order. */
export function allocate(amount: number, weights: number[]): number[] {
  moneySchema.parse(amount); weights.forEach(w => moneySchema.parse(w));
  const total = weights.reduce((n, w) => n + BigInt(w), BigInt(0));
  if (!total) { if (amount) throw new Error("INVALID_ALLOCATION"); return weights.map(() => 0); }
  const parts = weights.map(w => checked(BigInt(amount) * BigInt(w) / total));
  let remainder = amount - sumMoney(parts);
  for (let i = 0; remainder > 0; i = (i + 1) % parts.length) if (weights[i] > 0) { parts[i]++; remainder--; }
  return parts;
}
export function scopesOverlap(a: TaxRule, b: TaxRule) {
  const shared = (x: string[], y: string[]) => x.some(v => y.includes(v));
  return a.category === b.category && shared(a.scope.jurisdictions, b.scope.jurisdictions) && shared(a.scope.registrations, b.scope.registrations) && shared(a.scope.bookingModes, b.scope.bookingModes) && shared(a.scope.profileKinds, b.scope.profileKinds) && a.scope.effectiveFrom <= b.scope.effectiveThrough && b.scope.effectiveFrom <= a.scope.effectiveThrough && a.scope.minimumTaxablePaise <= (b.scope.maximumTaxablePaise ?? Number.MAX_SAFE_INTEGER) && b.scope.minimumTaxablePaise <= (a.scope.maximumTaxablePaise ?? Number.MAX_SAFE_INTEGER);
}
export function validateRegistry(raw: TaxRule[], production = true) {
  const rules = raw.map(r => taxRuleSchema.parse(r));
  if (!unique(rules.map(r => `${r.id}:${r.version}`))) throw new Error("DUPLICATE_TAX_RULE");
  for (let i = 0; i < rules.length; i++) {
    if (production && rules[i].synthetic) throw new Error("SYNTHETIC_PRODUCTION_RULE");
    if (rules.slice(i + 1).some(r => scopesOverlap(rules[i], r))) throw new Error("OVERLAPPING_TAX_RULES");
  }
  return rules;
}
export function calculateLine(input: ChargeInput, profile: TaxProfile, rawRules: TaxRule[]): ChargeLine {
  if (input.supplierId !== profile.supplierId || input.invoiceResponsibility !== profile.invoiceResponsibility) throw new Error("SUPPLIER_TAX_PROFILE_REQUIRED");
  if (input.basis !== input.reviewedBasis) throw new Error("PRICE_REVIEW_REQUIRED");
  if (!input.id || !Number.isSafeInteger(input.quantity) || input.quantity < 1) throw new Error("INVALID_CHARGE");
  const unit = moneySchema.parse(input.enteredUnitPaise);
  const candidates = rawRules.map(r => taxRuleSchema.parse(r)).filter(r => r.category === input.category && r.scope.jurisdictions.includes(profile.jurisdiction) && r.scope.registrations.includes(profile.registration) && r.scope.profileKinds.includes(profile.profileKind) && r.scope.bookingModes.includes(input.bookingMode)).flatMap(r => {
    const serviceDate = input.serviceDates[r.serviceDateBasis];
    if (!serviceDate || !validDate(serviceDate)) throw new Error("MISSING_SERVICE_DATE");
    if (serviceDate < r.scope.effectiveFrom || serviceDate > r.scope.effectiveThrough) return [];
    const rate = r.components.reduce((n, c) => n + c.basisPoints, 0);
    const taxableUnit = input.basis === "tax_inclusive" ? checked(halfUp(BigInt(unit) * BigInt(10000), BigInt(10000 + rate))) : unit;
    if (taxableUnit < r.scope.minimumTaxablePaise || taxableUnit > (r.scope.maximumTaxablePaise ?? Number.MAX_SAFE_INTEGER)) return [];
    const entered = checked(BigInt(unit) * BigInt(input.quantity));
    const taxablePaise = input.basis === "tax_inclusive" ? checked(halfUp(BigInt(entered) * BigInt(10000), BigInt(10000 + rate))) : entered;
    const taxPaise = input.basis === "tax_inclusive" ? entered - taxablePaise : percentage(taxablePaise, rate);
    const amounts = allocate(taxPaise, r.components.map(c => c.basisPoints));
    return [{ ...input, ruleId: r.id, ruleVersion: r.version, serviceDate, taxablePaise, taxPaise, totalPaise: sumMoney([taxablePaise, taxPaise]), components: r.components.map((c, i) => ({ ...c, amountPaise: amounts[i] })) }];
  });
  if (candidates.length !== 1) throw new Error(candidates.length ? "AMBIGUOUS_TAX_COVERAGE" : "MISSING_TAX_COVERAGE");
  return candidates[0];
}
export class NoPaymentOptionsError extends Error {
  constructor(readonly exclusions: { option: PaymentOption; reason: string }[]) { super("NO_PAYMENT_OPTIONS"); }
}
export function resolvePaymentChoices(total: number, global: FinancePolicy, effective: FinancePolicy, restrictions?: PaymentOption[], selected?: PaymentOption, gatewayMinimum = 100) {
  moneySchema.parse(total); moneySchema.parse(gatewayMinimum);
  global.paymentOptions.forEach(v => paymentOptionSchema.parse(v)); effective.paymentOptions.forEach(v => paymentOptionSchema.parse(v)); restrictions?.forEach(v => paymentOptionSchema.parse(v)); if (selected) paymentOptionSchema.parse(selected);
  if (restrictions && (!restrictions.length || !unique(restrictions))) throw new Error("INVALID_PAYMENT_RESTRICTION");
  const advancePaise = effective.advance.kind === "fixed" ? Math.min(total, moneySchema.parse(effective.advance.amountPaise)) : percentage(total, effective.advance.basisPoints);
  const excluded: { option: PaymentOption; reason: string }[] = [];
  const available = paymentOptions.filter(option => {
    const reason = !effective.paymentOptions.includes(option) || restrictions && !restrictions.includes(option) ? "policy_or_rate_restriction" : option === "advance_online" && advancePaise <= 0 ? "positive_advance_required" : option !== "pay_at_property" && (option === "full_online" ? total : advancePaise) < gatewayMinimum ? "gateway_minimum" : null;
    if (reason) excluded.push({ option, reason });
    return !reason;
  });
  if (!available.length) throw new NoPaymentOptionsError(excluded);
  const option = selected ?? available[0];
  if (!available.includes(option)) throw new Error("PAYMENT_OPTION_NOT_AVAILABLE");
  const payableNowPaise = option === "pay_at_property" ? 0 : option === "full_online" ? total : advancePaise;
  return { available, excluded, selected: option, advanceBasis: effective.advance, payableNowPaise, hotelBalancePaise: total - payableNowPaise };
}
export function calculateAgreement(input: { charges: ChargeInput[]; profile: TaxProfile; supplierProfiles?: Record<string, TaxProfile>; rules: TaxRule[]; global: FinancePolicy; effective: FinancePolicy; source: "marketplace" | "hotel_direct"; restrictions?: PaymentOption[]; selected?: PaymentOption; cancellation: CancellationTerms; versions: Record<string, string | number>; deductionInputs?: Record<string, unknown> }) {
  cancellationSchema.parse(input.cancellation);
  if (!input.charges.length || !unique(input.charges.map(c => c.id))) throw new Error("INVALID_CHARGE_LINES");
  const lines = input.charges.map(c => calculateLine(c, input.supplierProfiles?.[c.supplierId] ?? input.profile, input.rules));
  const taxablePaise = sumMoney(lines.map(l => l.taxablePaise)), taxPaise = sumMoney(lines.map(l => l.taxPaise)), totalPaise = sumMoney(lines.map(l => l.totalPaise));
  const choices = resolvePaymentChoices(totalPaise, input.global, input.effective, input.restrictions, input.selected);
  const commission = lines.filter(l => l.kind !== "customer_fee").map(l => ({ lineId: l.id, taxablePaise: l.taxablePaise, basisPoints: input.source === "hotel_direct" ? input.effective.directBookingCommissionBps : l.kind === "room" ? input.effective.roomCommissionBps : input.effective.extrasCommissionBps })).map(c => ({ ...c, amountPaise: percentage(c.taxablePaise, c.basisPoints) }));
  const publicCalculation = { version: 2 as const, lines, taxablePaise, taxPaise, totalPaise, ...choices, cancellation: input.cancellation, versions: input.versions };
  return { publicCalculation, internal: { version: 2 as const, source: input.source, commission, commissionPaise: sumMoney(commission.map(c => c.amountPaise)), providerCharges: { allocatedTo: input.effective.providerCharges, amountPaise: null }, deductions: { status: "pending_assessment", reasons: ["phase_3_assessment_required"], inputs: input.deductionInputs ?? {} } } };
}
/** Returns only explicitly public fields; never spread an internal agreement into a DTO. */
export function publicCalculation(agreement: ReturnType<typeof calculateAgreement>) { return agreement.publicCalculation; }
export function cancellationRefundV2(calculation: ReturnType<typeof calculateAgreement>["publicCalculation"], collected: number, refunded: number, now: number, noShow = false) {
  const remaining = Math.max(0, moneySchema.parse(collected) - moneySchema.parse(refunded));
  if (!noShow && now <= Date.parse(calculation.cancellation.freeUntil)) return remaining;
  const charge = noShow ? calculation.cancellation.noShow : calculation.cancellation.lateCharge;
  const penalty = charge.kind === "fixed" ? charge.amountPaise : percentage(charge.basis === "final_total" ? calculation.totalPaise : calculation.taxablePaise, charge.basisPoints);
  return Math.max(0, remaining - Math.min(remaining, penalty));
}
/** Partial reductions use saved components and cap each remaining amount. Never read current rules. */
export type LineReversal = { originalLineId: string; ruleId: string; ruleVersion: number; totalPaise: number; taxablePaise: number; taxPaise: number; components: ChargeLine["components"] };
export function reverseLine(line: ChargeLine, amountPaise: number, previous: LineReversal[] = []): LineReversal {
  moneySchema.parse(amountPaise);
  if (previous.some(r => r.originalLineId !== line.id || r.ruleId !== line.ruleId || r.ruleVersion !== line.ruleVersion)) throw new Error("INVALID_REDUCTION_REFERENCE");
  const remaining = [line.taxablePaise, ...line.components.map(c => c.amountPaise)].map((v, i) => v - sumMoney(previous.map(r => i === 0 ? r.taxablePaise : r.components[i - 1]?.amountPaise ?? 0)));
  if (remaining.some(v => v < 0) || amountPaise > sumMoney(remaining)) throw new Error("REDUCTION_EXCEEDS_REMAINING");
  const parts = allocate(amountPaise, remaining);
  return { originalLineId: line.id, ruleId: line.ruleId, ruleVersion: line.ruleVersion, totalPaise: amountPaise, taxablePaise: parts[0], taxPaise: sumMoney(parts.slice(1)), components: line.components.map((c, i) => ({ ...c, amountPaise: parts[i + 1] })) };
}

/** Only the explicitly supported retained-amount treatment is offered in Phase 2. */
export function assertCancellationTreatment(terms: CancellationTerms, rules: TaxRule[], profile: TaxProfile, agreementDate: string) {
  const applicable = rules.filter(r => `${r.id}:${r.version}` === terms.taxTreatmentReference && r.category === "cancellation" && r.serviceDateBasis === "agreement_date" && r.scope.jurisdictions.includes(profile.jurisdiction) && r.scope.registrations.includes(profile.registration) && r.scope.profileKinds.includes(profile.profileKind) && r.scope.bookingModes.includes("service") && r.scope.effectiveFrom <= agreementDate && r.scope.effectiveThrough >= agreementDate);
  if (applicable.length !== 1 || applicable[0].treatment === "percentage" || applicable[0].scope.minimumTaxablePaise !== 0 || applicable[0].scope.maximumTaxablePaise !== null) throw new Error("UNSUPPORTED_CANCELLATION_TAX_TREATMENT");
}

/** Cumulative taxable-value rounding reverses the saved commission without drift or current policy reads. */
export function reverseCommission(line: ChargeLine, savedCommissionPaise: number, reversal: LineReversal, previous: LineReversal[] = []) {
  moneySchema.parse(savedCommissionPaise);
  const before = sumMoney(previous.map(r => r.taxablePaise)), after = sumMoney([before, reversal.taxablePaise]);
  if (after > line.taxablePaise) throw new Error("REDUCTION_EXCEEDS_REMAINING");
  if (!line.taxablePaise) return 0;
  const cumulative = (value: number) => checked(halfUp(BigInt(savedCommissionPaise) * BigInt(value), BigInt(line.taxablePaise)));
  return cumulative(after) - cumulative(before);
}
