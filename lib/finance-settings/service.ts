import "server-only";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/admin/data";
import { propertyAccess } from "@/lib/partner/pms/access";
import { ApiException } from "@/lib/api/errors";
import { applyChanges, canonical, policyErrors, policySchema, resolvePolicy, saveSchema, type Policy, type Workspace } from "./domain";

const collection = () => adminDb.collection("hotelFinanceSettingsV1");
const scopeRef = (propertyId: string | null) => collection().doc(propertyId ? `hotel_${propertyId}` : "global");
const readPolicy = (snap: FirebaseFirestore.DocumentSnapshot): Policy => policySchema.parse(snap.get("settings") ?? {});
const revision = (snap: FirebaseFirestore.DocumentSnapshot): number => snap.get("revision") ?? 0;
const conflict = () => new ApiException("FINANCE_REVISION_CONFLICT", 409, "Finance settings changed. Your draft is retained. Refresh and review the latest settings before saving again.");
const validate = (policy: Policy, scope = "Policy") => {
  const errors = policyErrors(policy);
  if (errors.length) throw new ApiException("INVALID_FINANCE_POLICY", 422, `${scope}: ${errors.join(" ")}`);
};
// Keep all finance authorization in one place for future granular permissions.
export async function authorizeFinanceAdmin(uid: string, tx?: FirebaseFirestore.Transaction) {
  try { await requireAdmin(uid); }
  catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") throw new ApiException("FORBIDDEN", 403, "Active administrator access required.");
    throw error;
  }
  if (tx) {
    const user = (await tx.get(adminDb.collection("users").doc(uid))).data();
    if (!user?.roles?.includes("admin") || user.isActive === false || user.accountStatus !== "active") throw new ApiException("FORBIDDEN", 403, "Active administrator access required.");
  }
}
async function authorizeOwner(uid: string, propertyId: string, tx: FirebaseFirestore.Transaction) {
  const access = await propertyAccess(uid, propertyId, "property.manage", tx);
  if (access.role !== "owner") throw new ApiException("FORBIDDEN", 403, "Only the hotel owner can view commercial terms.");
}
function validId(id: string | null) {
  if (id !== null && (!id || id.includes("/") || id.length > 200)) throw new ApiException("NOT_FOUND", 404);
}
export async function readFinance(uid: string, propertyId: string | null, owner = false): Promise<Workspace> {
  validId(propertyId);
  return adminDb.runTransaction(async tx => {
    if (owner) {
      if (!propertyId) throw new ApiException("FORBIDDEN", 403);
      await authorizeOwner(uid, propertyId, tx);
    } else await authorizeFinanceAdmin(uid, tx);
    if (propertyId && !(await tx.get(adminDb.collection("properties").doc(propertyId))).exists) throw new ApiException("NOT_FOUND", 404);
    const globalSnap = await tx.get(scopeRef(null));
    const hotelSnap = propertyId ? await tx.get(scopeRef(propertyId)) : globalSnap;
    const global = readPolicy(globalSnap), stored = readPolicy(hotelSnap);
    return { ...resolvePolicy(global, propertyId ? stored : {}), stored, global, revision: revision(hotelSnap), globalRevision: revision(globalSnap), propertyId };
  });
}
export async function saveFinance(uid: string, propertyId: string | null, raw: unknown) {
  validId(propertyId);
  await authorizeFinanceAdmin(uid);
  const input = saveSchema.parse(raw);
  const fingerprint = createHash("sha256").update(canonical(input)).digest("hex");
  const ref = scopeRef(propertyId);
  const receiptRef = ref.collection("requests").doc(`${uid}_${input.requestId}`);
  return adminDb.runTransaction(async tx => {
    await authorizeFinanceAdmin(uid, tx);
    if (propertyId && !(await tx.get(adminDb.collection("properties").doc(propertyId))).exists) throw new ApiException("NOT_FOUND", 404);
    const receipt = await tx.get(receiptRef);
    if (receipt.exists) {
      if (receipt.get("fingerprint") !== fingerprint) throw new ApiException("IDEMPOTENCY_CONFLICT", 409, "This save request was already used with different content. Refresh and review.");
      return receipt.get("result") as { revision: number; changed: boolean };
    }
    const previous = await tx.get(ref);
    const globalSnap = propertyId ? await tx.get(scopeRef(null)) : previous;
    if (revision(previous) !== input.expectedRevision || revision(globalSnap) !== input.expectedGlobalRevision) throw conflict();
    const before = readPolicy(previous), globalBefore = readPolicy(globalSnap);
    const after = applyChanges(before, input);
    if (propertyId) validate({ ...globalBefore, ...after });
    if (!propertyId) {
      validate(after);
      // Reading this query in the transaction also serializes global changes
      // against hotel override changes; no hotel values are copied or rewritten.
      const hotels = await tx.get(collection().where("scope", "==", "hotel"));
      for (const hotel of hotels.docs) validate({ ...after, ...readPolicy(hotel) }, `Hotel ${hotel.get("propertyId")}`);
    }
    const changed = canonical(before) !== canonical(after);
    const result = { revision: revision(previous) + (changed ? 1 : 0), changed };
    if (changed) {
      const now = FieldValue.serverTimestamp();
      const actor = (await tx.get(adminDb.collection("users").doc(uid))).data();
      tx.set(ref, { scope: propertyId ? "hotel" : "global", propertyId, settings: after, revision: result.revision, updatedAt: now, updatedBy: uid });
      tx.create(ref.collection("history").doc(String(result.revision)), {
        revision: result.revision, globalRevision: propertyId ? revision(globalSnap) : result.revision,
        actorId: uid, actorName: actor?.fullName || uid, createdAt: now,
        scope: propertyId ? "hotel" : "global", propertyId, before, after,
        effectiveBefore: resolvePolicy(globalBefore, propertyId ? before : {}).effective,
        effectiveAfter: resolvePolicy(propertyId ? globalBefore : after, propertyId ? after : {}).effective,
        reason: input.reason,
      });
    }
    tx.create(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
}
export async function financeHistory(uid: string, propertyId: string | null, cursor?: string | null) {
  validId(propertyId);
  await authorizeFinanceAdmin(uid);
  if (cursor && !/^\d+$/.test(cursor)) throw new ApiException("VALIDATION_ERROR", 422, "Invalid history cursor.");
  let query = scopeRef(propertyId).collection("history").orderBy("revision", "desc").limit(20);
  if (cursor) query = query.startAfter(Number(cursor));
  const snap = await query.get();
  return { events: snap.docs.map(d => ({ ...d.data(), createdAt: d.get("createdAt")?.toDate().toISOString() ?? null })), nextCursor: snap.size === 20 ? String(snap.docs.at(-1)!.get("revision")) : null };
}
