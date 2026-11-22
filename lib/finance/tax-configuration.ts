import { syntheticProject } from "./configuration-guard";
export { syntheticProject } from "./configuration-guard";
import "server-only";
import { z } from "zod";
import { validDate } from "@/lib/booking/domain";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";
import { taxRuleSchema, validateRegistry, taxProfileSchema, calculateLine } from "./calculation";
import { profileReadiness, supportingDocumentsValid, type FinanceProfile } from "./domain";
import { propertyAccess } from "@/lib/partner/pms/access";

export const registryRef = () => adminDb.collection("financeConfiguration").doc("taxRegistry");
export const ruleRef = (id: string, version: number) => adminDb.collection("financeTaxRules").doc(`${id}_${version}`);
export const taxProfileRef = (id: string) => adminDb.collection("propertyFinance").doc(id).collection("taxProfiles").doc("current");
export async function readRegistry(tx?: FirebaseFirestore.Transaction) {
  const get = (ref: FirebaseFirestore.DocumentReference) => tx ? tx.get(ref) : ref.get();
  const registry = await get(registryRef());
  if (!registry.exists) throw new Error("MISSING_TAX_COVERAGE");
  const refs = z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]+$/), version: z.number().int().positive() }).strict()).parse(registry.get("active"));
  const docs = await Promise.all(refs.map(r => get(ruleRef(r.id, r.version))));
  if (docs.some(d => !d.exists)) throw new Error("MISSING_TAX_COVERAGE");
  return { revision: z.number().int().nonnegative().parse(registry.get("revision")), rules: validateRegistry(docs.map(d => taxRuleSchema.parse(d.data())), !syntheticProject()) };
}
async function admin(tx: FirebaseFirestore.Transaction, uid: string) {
  const u = await tx.get(adminDb.collection("users").doc(uid));
  if (!u.get("roles")?.includes("admin") || u.get("isActive") !== true || u.get("accountStatus") !== "active") throw new ApiException("FORBIDDEN", 403);
}
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), rule: taxRuleSchema, profile: taxProfileSchema, enteredUnitPaise: z.number().int().nonnegative().safe(), quantity: z.number().int().positive().safe(), basis: z.enum(["tax_exclusive", "tax_inclusive"]), bookingMode: z.enum(["overnight", "hourly", "service"]), serviceDate: z.string() }).strict(),
  z.object({ action: z.literal("create_version"), rule: taxRuleSchema, reason: z.string().trim().min(3) }).strict(),
  z.object({ action: z.literal("activate"), expectedRevision: z.number().int().nonnegative(), active: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]+$/), version: z.number().int().positive() }).strict()).min(1).max(300), coverage: z.array(z.object({ category: z.string().min(1), jurisdiction: z.string().min(1), registration: taxProfileSchema.shape.registration, profileKind: z.string().min(1), bookingMode: z.enum(["overnight", "hourly", "service"]), from: z.string().refine(validDate), through: z.string().refine(validDate) }).strict()).min(1), reason: z.string().trim().min(3) }).strict(),
]);
/** All publication reads participate in one transaction; every publication changes the registry revision. */
export async function mutateTaxConfiguration(uid: string, raw: unknown) {
  const c = command.parse(raw);
  return adminDb.runTransaction(async tx => {
    await admin(tx, uid);
    if (c.action === "preview") return { preview: calculateLine({ id: "preview", kind: c.rule.category === "accommodation" ? "room" : "service", category: c.rule.category, quantity: c.quantity, enteredUnitPaise: c.enteredUnitPaise, basis: c.basis, reviewedBasis: c.basis, bookingMode: c.bookingMode, serviceDates: { [c.rule.serviceDateBasis]: c.serviceDate }, supplierId: c.profile.supplierId, invoiceResponsibility: c.profile.invoiceResponsibility }, c.profile, [c.rule]) };
    const registry = await tx.get(registryRef());
    const revision = registry.get("revision") ?? 0;
    if (c.action === "create_version") {
      if (c.rule.reviewedBy !== uid) throw new ApiException("INVALID_REVIEWER", 422);
      if (c.rule.synthetic && !syntheticProject()) throw new ApiException("SYNTHETIC_PRODUCTION_RULE", 422);
      const ref = ruleRef(c.rule.id, c.rule.version);
      if ((await tx.get(ref)).exists) throw new ApiException("IMMUTABLE_RULE_VERSION", 409);
      tx.create(ref, c.rule);
    } else {
      if (revision !== c.expectedRevision) throw new ApiException("FINANCE_CONFLICT", 409);
      const docs = await Promise.all(c.active.map(r => tx.get(ruleRef(r.id, r.version))));
      const rules = validateRegistry(docs.map(d => taxRuleSchema.parse(d.data())), !syntheticProject());
      // Declared coverage must span all dates and taxable values without gaps.
      for (const scope of c.coverage) {
        const matching = rules.filter(r => r.category === scope.category && r.scope.jurisdictions.includes(scope.jurisdiction) && r.scope.registrations.includes(scope.registration) && r.scope.profileKinds.includes(scope.profileKind) && r.scope.bookingModes.includes(scope.bookingMode));
        const start = Date.parse(scope.from), end = Date.parse(scope.through);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end - start > 3660 * 86400000) throw new ApiException("INVALID_COVERAGE", 422);
        const boundaries = [...new Set([scope.from, ...matching.flatMap(r => [r.scope.effectiveFrom, new Date(Date.parse(r.scope.effectiveThrough) + 86400000).toISOString().slice(0, 10)])])].filter(d => d >= scope.from && d <= scope.through);
        for (const day of boundaries) {
          const tiers = matching.filter(r => r.scope.effectiveFrom <= day && r.scope.effectiveThrough >= day).sort((a, b) => a.scope.minimumTaxablePaise - b.scope.minimumTaxablePaise);
          let next = BigInt(0);
          for (const tier of tiers) { if (BigInt(tier.scope.minimumTaxablePaise) !== next) throw new ApiException("INCOMPLETE_TAX_COVERAGE", 422); next = BigInt(tier.scope.maximumTaxablePaise ?? Number.MAX_SAFE_INTEGER) + BigInt(1); }
          if (next !== BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1)) throw new ApiException("INCOMPLETE_TAX_COVERAGE", 422);
        }
      }
      tx.set(registryRef(), { revision: revision + 1, active: c.active, coverage: c.coverage, publishedBy: uid, publishedAt: FieldValue.serverTimestamp() });
    }
    tx.create(adminDb.collection("financeAudit").doc(), { action: c.action, actorId: uid, reason: c.reason, beforeRevision: revision, command: c, createdAt: FieldValue.serverTimestamp() });
    return { revision: c.action === "activate" ? revision + 1 : revision };
  });
}
export async function readTaxConfiguration(uid: string) {
  return adminDb.runTransaction(async tx => {
    await admin(tx, uid);
    const [registry, versions] = await Promise.all([tx.get(registryRef()), tx.get(adminDb.collection("financeTaxRules").limit(500))]);
    return { registry: registry.data() ?? { revision: 0, active: [] }, versions: versions.docs.map(d => d.data()) };
  });
}
export async function saveTaxProfile(uid: string, propertyId: string, raw: unknown) {
  const c = z.object({ expectedRevision: z.number().int().nonnegative(), profile: taxProfileSchema, reason: z.string().trim().min(3) }).strict().parse(raw);
  return adminDb.runTransaction(async tx => {
    await admin(tx, uid);
    const ref = taxProfileRef(propertyId);
    const [old, finance] = await Promise.all([tx.get(ref), tx.get(adminDb.collection("propertyFinance").doc(propertyId).collection("profiles").doc("current"))]);
    if ((old.get("revision") ?? 0) !== c.expectedRevision) throw new ApiException("FINANCE_CONFLICT", 409);
    if (c.profile.reviewedBy !== uid || finance.get("state") !== "manually_reviewed" || finance.get("contentRevision") !== c.profile.profileContentRevision || finance.get("profile.gstStatus") !== c.profile.registration) throw new ApiException("PROFILE_REVIEW_REQUIRED", 422);
    const revision = c.expectedRevision + 1;
    tx.set(ref, { profile: c.profile, revision });
    tx.create(ref.collection("versions").doc(String(revision)), { profile: c.profile, revision });
    tx.create(adminDb.collection("financeAudit").doc(), { action: "tax_profile", propertyId, actorId: uid, reason: c.reason, revision, createdAt: FieldValue.serverTimestamp() });
    return { revision };
  });
}
export async function reviewedTaxProfile(propertyId: string, tx?: FirebaseFirestore.Transaction) {
  const get = (ref: FirebaseFirestore.DocumentReference) => tx ? tx.get(ref) : ref.get();
  const [tax, finance] = await Promise.all([get(taxProfileRef(propertyId)), get(adminDb.collection("propertyFinance").doc(propertyId).collection("profiles").doc("current"))]);
  const parsed = taxProfileSchema.safeParse(tax.get("profile"));
  if (!parsed.success || !finance.get("profile")) throw new Error("PROFILE_REVIEW_REQUIRED");
  const profile = parsed.data;
  const p = finance.get("profile") as FinanceProfile;
  if (finance.get("state") !== "manually_reviewed" || finance.get("contentRevision") !== profile.profileContentRevision || p.gstStatus !== profile.registration || !profileReadiness(p, false).canSubmit) throw new Error("PROFILE_REVIEW_REQUIRED");
  const docs = await Promise.all(p.documentIds.map(id => get(adminDb.collection("verificationDocuments").doc(id))));
  if (!supportingDocumentsValid(p, propertyId, docs.filter(d => d.exists).map(d => ({ id: d.id, propertyId: d.get("propertyId"), status: d.get("status"), deletedAt: d.get("deletedAt") })))) throw new Error("INVALID_DOCUMENT");
  return { profile, revision: tax.get("revision") as number, financeRevision: finance.get("revision") as number };
}
// Owner authorization is reused by price editors; it does not grant tax publication rights.
export async function priceReview(uid: string, propertyId: string, basis: unknown, tx: FirebaseFirestore.Transaction, restrictions?: import("./calculation").PaymentOption[]) {
  const access = await propertyAccess(uid, propertyId, "rates.manage", tx);
  if (access.block) throw new ApiException("PMS_RESTRICTED", 403, access.block);
  const { DEFAULT_POLICY, resolvePolicy } = await import("./domain");
  const [g, h] = await Promise.all([tx.get(adminDb.collection("financeConfiguration").doc("global")), tx.get(adminDb.collection("propertyFinance").doc(propertyId))]);
  const effective = resolvePolicy(g.get("policy") ?? DEFAULT_POLICY, h.get("overrides") ?? {}).effective;
  if (restrictions?.some(option => !effective.paymentOptions.includes(option))) throw new ApiException("ADMIN_DISALLOWED_PAYMENT_OPTION", 422);
  if (basis !== effective.priceEntry) throw new ApiException("PRICE_REVIEW_REQUIRED", 409, "Review and re-enter prices in the current hotel price basis.");
  return { basis: effective.priceEntry, reviewedBy: uid, reviewedAt: new Date().toISOString() };
}
export { calculateLine };

export async function saveSupplierTaxProfile(uid: string, supplierId: string, raw: unknown) {
  const c = z.object({ expectedRevision: z.number().int().nonnegative(), profile: taxProfileSchema, legalReference: z.string().trim().min(3), reason: z.string().trim().min(3) }).strict().parse(raw);
  if (!/^[a-zA-Z0-9_-]+$/.test(supplierId) || c.profile.supplierId !== supplierId) throw new ApiException("INVALID_SUPPLIER", 422);
  return adminDb.runTransaction(async tx => {
    await admin(tx, uid);
    const ref = adminDb.collection("financeSupplierProfiles").doc(supplierId), old = await tx.get(ref);
    if ((old.get("revision") ?? 0) !== c.expectedRevision) throw new ApiException("FINANCE_CONFLICT", 409);
    const revision = c.expectedRevision + 1;
    const saved = { revision, profile: { ...c.profile, reviewedBy: uid, reviewedAt: new Date().toISOString() }, legalReference: c.legalReference };
    tx.set(ref, saved); tx.create(ref.collection("versions").doc(String(revision)), saved);
    tx.create(adminDb.collection("financeAudit").doc(), { action: "supplier_tax_profile", supplierId, actorId: uid, revision, reason: c.reason, createdAt: FieldValue.serverTimestamp() });
    return { revision };
  });
}
