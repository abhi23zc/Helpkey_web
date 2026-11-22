import "server-only";
import { createHash } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { DEFAULT_POLICY, policySchema, resolvePolicy } from "./domain";
import { allocate, assertCancellationTreatment, calculateAgreement, cancellationSchema, priceReviewSchema, taxProfileSchema, type TaxProfile, type ChargeInput, type PaymentOption } from "./calculation";
import { readRegistry, reviewedTaxProfile } from "./tax-configuration";
import { localParts } from "@/lib/booking/domain";
import type { Offering, StayRequest } from "@/lib/stay/contracts";

type Data = FirebaseFirestore.DocumentData;
export function financeFingerprint(value: unknown): string {
  function stable(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => [k, stable(x)]));
    return v;
  }
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}
export async function bookingCalculation(args: { propertyId: string; rate: Data; stay: Data; requests: StayRequest[]; offerings: Offering[]; policy: Data | null | undefined; selected?: PaymentOption; source?: "marketplace" | "hotel_direct"; negotiatedPaise?: number; collection?: "hotel"; tx?: FirebaseFirestore.Transaction }) {
  const get = (ref: FirebaseFirestore.DocumentReference) => args.tx ? args.tx.get(ref) : ref.get();
  const [g, h, registry, tax] = await Promise.all([
    get(adminDb.collection("financeConfiguration").doc("global")),
    get(adminDb.collection("propertyFinance").doc(args.propertyId)), readRegistry(args.tx), reviewedTaxProfile(args.propertyId, args.tx),
  ]);
  if (!g.exists) throw new Error("FINANCE_POLICY_REQUIRED");
  const global = policySchema.parse(g.get("policy") ?? DEFAULT_POLICY);
  const effective = resolvePolicy(global, h.get("overrides") ?? {}).effective;
  const source = args.source ?? "marketplace";
  const reviewed = (value: unknown) => { const review = priceReviewSchema.safeParse(value); if (!review.success || review.data.basis !== effective.priceEntry) throw new Error("PRICE_REVIEW_REQUIRED"); return review.data.basis; };
  const { rate, stay } = args;
  const baseReview = reviewed(rate.priceReview);
  const dates: string[] = stay.bookingMode === "hourly" ? [stay.checkIn] : Array.from({ length: stay.nights }, (_, i) => new Date(Date.parse(stay.checkIn) + i * 86400000).toISOString().slice(0, 10));
  const negotiated = args.negotiatedPaise === undefined ? null : allocate(args.negotiatedPaise, dates.map(() => 1));
  const identity = { supplierId: tax.profile.supplierId, invoiceResponsibility: tax.profile.invoiceResponsibility };
  const charges: ChargeInput[] = dates.map((date, i) => {
    const override = rate.datePrices?.[date];
    const reviewedBasis = override ? reviewed(override.priceReview) : baseReview;
    const enteredUnitPaise = negotiated ? negotiated[i] : stay.bookingMode === "hourly" ? (override?.durationPrices ?? rate.durationPrices)?.find((p: { hours: number }) => p.hours * 60 === stay.durationMinutes)?.pricePaise : override?.basePricePaise ?? rate.basePricePaise;
    return { ...identity, id: `room:${date}`, kind: "room", category: rate.taxCategory ?? "accommodation", quantity: 1, enteredUnitPaise, basis: effective.priceEntry, reviewedBasis, bookingMode: stay.bookingMode, serviceDates: stay.bookingMode === "hourly" ? { hourly_start: date } : { night_date: date } };
  });
  for (const request of args.requests) {
    if (request.settlement !== "included" || request.totalPaise <= 0) continue;
    const offering = args.offerings.find(o => o.id === request.offeringId);
    if (!offering?.taxCategory) throw new Error("MISSING_SERVICE_CATEGORY");
    charges.push({ ...identity, id: `extra:${request.id}`, kind: "extra", category: offering.taxCategory, quantity: request.billableQuantity ?? request.quantity, enteredUnitPaise: request.unitPricePaise, basis: effective.priceEntry, reviewedBasis: reviewed(offering.priceReview), bookingMode: "service", serviceDates: request.inputs?.serviceAt ? { fulfilment_date: localParts(Date.parse(request.inputs.serviceAt), stay.timezone).date } : {} });
  }
  const supplierProfiles: Record<string, TaxProfile> = {};
  const supplierVersions: Record<string, number> = {};
  if (rate.customerFeePaise > 0) {
    const supplier = await get(adminDb.collection("financeSupplierProfiles").doc("helpkey"));
    supplierProfiles.helpkey = taxProfileSchema.parse(supplier.get("profile"));
    if (supplierProfiles.helpkey.supplierId !== "helpkey" || supplierProfiles.helpkey.invoiceResponsibility !== "helpkey") throw new Error("SUPPLIER_TAX_PROFILE_REQUIRED");
    supplierVersions.customerFeeSupplier = supplier.get("revision");
  }
  if (rate.customerFeePaise > 0) charges.push({ ...identity, supplierId: "helpkey", invoiceResponsibility: "helpkey", id: "customer_fee", kind: "customer_fee", category: rate.customerFeeCategory ?? "customer_fee", quantity: 1, enteredUnitPaise: rate.customerFeePaise, basis: effective.priceEntry, reviewedBasis: baseReview, bookingMode: "service", serviceDates: { agreement_date: localParts(Date.now(), stay.timezone).date } });
  // Full explicit terms are required. Existing historical snapshots remain readable.
  const policy = args.policy;
  if (!policy || !Number.isSafeInteger(policy.refundableUntilHours) || policy.refundableUntilHours < 0 || !policy.lateCharge || !policy.noShow || !policy.taxTreatmentReference) throw new Error("CANCELLATION_TERMS_REQUIRED");
  const cancellation = cancellationSchema.parse({ freeUntil: new Date(Date.parse(stay.startAt) - policy.refundableUntilHours * 3600000).toISOString(), lateCharge: policy.lateCharge, noShow: policy.noShow, taxTreatmentReference: policy.taxTreatmentReference });
  assertCancellationTreatment(cancellation, registry.rules, tax.profile, localParts(Date.now(), stay.timezone).date);
  // Hotel-created reservations explicitly collect at the hotel; customer choices remain policy controlled.
  const hotelCollection = source === "hotel_direct" || args.collection === "hotel";
  const collectionPolicy = hotelCollection ? { ...effective, paymentOptions: ["pay_at_property" as const] } : effective;
  const collectionGlobal = hotelCollection ? { ...global, paymentOptions: ["pay_at_property" as const] } : global;
  return calculateAgreement({ charges, profile: tax.profile, supplierProfiles, rules: registry.rules, global: collectionGlobal, effective: collectionPolicy, source, restrictions: hotelCollection ? undefined : rate.paymentOptions, selected: hotelCollection ? "pay_at_property" : args.selected, cancellation, versions: { financialInputs: financeFingerprint({ global, effective, profile: tax.profile, supplierProfiles, rules: registry.rules, charges }), ...supplierVersions, globalPolicy: g.get("revision") ?? 0, hotelPolicy: h.get("revision") ?? 0, taxRegistry: registry.revision, taxProfile: tax.revision, financeProfile: tax.financeRevision, priceReview: financeFingerprint(rate.priceReview), cancellation: financeFingerprint(policy) }, deductionInputs: { supplierId: tax.profile.supplierId, propertyId: args.propertyId, jurisdiction: tax.profile.jurisdiction, financeProfileRevision: tax.financeRevision, accumulatedValue: null, accumulatedValueAsOf: null, provenance: "not_assessed" } });
}
export function calculationTotals(calculation: ReturnType<typeof calculateAgreement>["publicCalculation"]) {
  const room = calculation.lines.filter(l => l.kind === "room" || l.kind === "customer_fee");
  return { calculation, paymentOption: calculation.selected, paymentMode: calculation.selected === "advance_online" ? "deposit" : calculation.selected === "pay_at_property" ? "pay_at_property" : "full", subtotalPaise: calculation.taxablePaise, taxBasisPoints: 0, taxPaise: calculation.taxPaise, customerFeePaise: calculation.lines.filter(l => l.kind === "customer_fee").reduce((n, l) => n + l.totalPaise, 0), totalPaise: calculation.totalPaise, payableNowPaise: calculation.payableNowPaise, balanceDuePaise: calculation.hotelBalancePaise, roomTotalPaise: room.reduce((n, l) => n + l.totalPaise, 0), extrasTotalPaise: calculation.lines.filter(l => l.kind === "extra").reduce((n, l) => n + l.totalPaise, 0) };
}
