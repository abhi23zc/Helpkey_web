import { financeFingerprint } from "./booking-calculation";
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { DEFAULT_POLICY, policySchema, resolvePolicy } from "./domain";
import { basisSchema, assertCancellationTreatment, calculateAgreement, cancellationSchema, type CancellationTerms, type PriceBasis } from "./calculation";
import { readRegistry, reviewedTaxProfile } from "./tax-configuration";
import { localParts } from "@/lib/booking/domain";
export type ServiceCharge = { enteredPaise: number; basis: PriceBasis; category: string; serviceAt: string; cancellation: CancellationTerms; collection: "online" | "hotel" };
export async function serviceCalculation(propertyId: string, requestId: string, charge: ServiceCharge, timezone: string, tx: FirebaseFirestore.Transaction, source: "marketplace" | "hotel_direct" = "marketplace") {
  basisSchema.parse(charge.basis); cancellationSchema.parse(charge.cancellation);
  if (!Number.isFinite(Date.parse(charge.serviceAt))) throw new Error("MISSING_SERVICE_DATE");
  const [g, h, registry, tax] = await Promise.all([tx.get(adminDb.collection("financeConfiguration").doc("global")), tx.get(adminDb.collection("propertyFinance").doc(propertyId)), readRegistry(tx), reviewedTaxProfile(propertyId, tx)]);
  if (!g.exists) throw new Error("FINANCE_POLICY_REQUIRED");
  const global = policySchema.parse(g.get("policy") ?? DEFAULT_POLICY), effective = resolvePolicy(global, h.get("overrides") ?? {}).effective;
  if (charge.basis !== effective.priceEntry) throw new Error("PRICE_REVIEW_REQUIRED");
  assertCancellationTreatment(charge.cancellation, registry.rules, tax.profile, localParts(Date.now(), timezone).date);
  const selected = charge.collection === "hotel" ? "pay_at_property" as const : "full_online" as const;
  const policy = { ...effective, paymentOptions: [selected] };
  return calculateAgreement({ global: { ...global, paymentOptions: [selected] }, effective: policy, source, selected, profile: tax.profile, rules: registry.rules, charges: [{ id: requestId, kind: "service", category: charge.category, quantity: 1, enteredUnitPaise: charge.enteredPaise, basis: charge.basis, reviewedBasis: charge.basis, bookingMode: "service", serviceDates: { fulfilment_date: localParts(Date.parse(charge.serviceAt), timezone).date }, supplierId: tax.profile.supplierId, invoiceResponsibility: tax.profile.invoiceResponsibility }], cancellation: charge.cancellation, versions: { financialInputs: financeFingerprint({ global, effective, profile: tax.profile, rules: registry.rules, charge }), globalPolicy: g.get("revision") ?? 0, hotelPolicy: h.get("revision") ?? 0, taxRegistry: registry.revision, taxProfile: tax.revision, financeProfile: tax.financeRevision }, deductionInputs: { propertyId, supplierId: tax.profile.supplierId, accumulatedValue: null, provenance: "not_assessed", accumulatedValueAsOf: null } });
}
