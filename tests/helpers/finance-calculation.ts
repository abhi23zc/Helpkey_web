/** Controlled synthetic policy for legacy quote/availability unit tests. No database or legal claims.
 * Real configuration reads, publication and acceptance are exercised by finance-calculation.emulator.test.ts.
 */
import { calculateAgreement, type ChargeInput, type PaymentOption } from "@/lib/finance/calculation";
import { DEFAULT_POLICY } from "@/lib/finance/domain";
import { syntheticRules } from "@/lib/finance/development-fixtures";
type Args = Parameters<typeof import("@/lib/finance/booking-calculation").bookingCalculation>[0];
export async function testBookingCalculation(args: Args) {
  const { rate, stay } = args;
  const taxBasisPoints = rate.legacyFixtureTaxBasisPoints ?? rate.taxBasisPoints;
  if (!Number.isInteger(taxBasisPoints ?? 0) || (taxBasisPoints ?? 0) < 0) throw new Error("INVALID_RATE_CONFIGURATION");
  const selected: PaymentOption = args.selected ?? (rate.paymentMode === "deposit" ? "advance_online" : rate.paymentMode === "pay_at_property" ? "pay_at_property" : "full_online");
  const policy = { ...DEFAULT_POLICY, paymentOptions: [selected], advance: { kind: "percentage" as const, basisPoints: rate.depositBasisPoints ?? 2500 } };
  const dates: string[] = stay.bookingMode === "hourly" ? [stay.checkIn] : Array.from({ length: stay.nights }, (_, i) => new Date(Date.parse(stay.checkIn) + i * 86400000).toISOString().slice(0, 10));
  const identity = { supplierId: "example_hotel", invoiceResponsibility: "hotel" as const, basis: "tax_exclusive" as const, reviewedBasis: "tax_exclusive" as const };
  const charges: ChargeInput[] = dates.map((date, i) => ({ ...identity, id: `room:${date}`, kind: "room", category: "accommodation", quantity: 1, enteredUnitPaise: args.negotiatedPaise === undefined ? stay.bookingMode === "hourly" ? stay.unitPricePaise : rate.datePrices?.[date]?.basePricePaise ?? rate.basePricePaise : Math.floor(args.negotiatedPaise / dates.length) + Number(i < args.negotiatedPaise % dates.length), bookingMode: stay.bookingMode, serviceDates: stay.bookingMode === "hourly" ? { hourly_start: date } : { night_date: date } }));
  for (const r of args.requests) if (r.settlement === "included" && r.totalPaise > 0) charges.push({ ...identity, id: `extra:${r.id}`, kind: "extra", category: "food", quantity: r.billableQuantity ?? r.quantity, enteredUnitPaise: r.unitPricePaise, bookingMode: "service", serviceDates: { fulfilment_date: stay.checkIn } });
  if (rate.customerFeePaise > 0) charges.push({ ...identity, id: "fee", kind: "customer_fee", category: "customer_fee", quantity: 1, enteredUnitPaise: rate.customerFeePaise, bookingMode: "service", serviceDates: { agreement_date: stay.checkIn } });
  const rules = syntheticRules().map(r => ({ ...r, components: taxBasisPoints && r.category === "accommodation" ? [{ code: "example", basisPoints: taxBasisPoints }] : [], treatment: taxBasisPoints && r.category === "accommodation" ? "percentage" as const : "zero_rated" as const }));
  return calculateAgreement({ charges, rules, profile: { jurisdiction: "example", registration: "unregistered", profileKind: "example", supplierId: "example_hotel", invoiceResponsibility: "hotel", reviewedBy: "example", reviewedAt: "2026-01-01T00:00:00.000Z", profileContentRevision: 1 }, global: policy, effective: policy, selected, source: args.source ?? "marketplace", cancellation: { freeUntil: new Date(Date.parse(stay.startAt) - (args.policy?.refundableUntilHours ?? 0) * 3600000).toISOString(), lateCharge: { kind: "percentage", basisPoints: (args.policy?.cancellationFeePercent ?? 100) * 100, basis: "final_total" }, noShow: { kind: "fixed", amountPaise: 0 }, taxTreatmentReference: "example" }, versions: { fixture: JSON.stringify({ policy: args.policy ?? null, basis: rate.priceReview ?? null }) } });
}
