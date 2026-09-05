import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { serializeUser } from "@/lib/auth/users";
import { requireRole } from "@/lib/partner/service";

export const propertyStates = ["draft", "pending_review", "active", "paused", "archived"] as const;
export const approvalStates = ["not_submitted", "pending", "approved", "changes_requested", "rejected"] as const;

const iso = (value: unknown) => typeof (value as { toDate?: unknown })?.toDate === "function" ? (value as { toDate: () => Date }).toDate().toISOString() : null;
const clean = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    if (typeof (value as { toDate?: unknown }).toDate === "function") return iso(value);
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clean(child)]));
  }
  return value;
};

export async function requireAdmin(uid: string) { return requireRole(uid, "admin"); }

/* ---------- Property review audit trail (propertyReviewEvents) ---------- */

export { recordReviewEvent } from "@/lib/partner/review-events";
export type { ReviewAction, ReviewEventInput } from "@/lib/partner/review-events";

/** Ordered (newest-first) audit timeline for a property. */
export async function listReviewEvents(propertyId: string, max = 50) {
  // Fetch by propertyId only (single-field index) and sort in memory to avoid a
  // composite (propertyId + createdAt) index requirement. Per-property event
  // counts are small.
  const snap = await adminDb
    .collection("propertyReviewEvents")
    .where("propertyId", "==", propertyId)
    .limit(200)
    .get();
  return snap.docs
    .map((doc) => ({
      doc,
      createdAtMs: (doc.data().createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0,
    }))
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, max)
    .map(({ doc }) => clean({ id: doc.id, ...doc.data() }));
}

export function propertySummary(id: string, raw: FirebaseFirestore.DocumentData) {
  return { id, name: raw.name ?? "Untitled property", propertyType: raw.propertyType ?? "hotel", status: raw.status ?? "draft", approvalStatus: raw.approvalStatus ?? "not_submitted", address: clean(raw.address ?? {}), partnerId: raw.partnerId ?? raw.ownerId ?? null, submittedAt: iso(raw.submittedAt), updatedAt: iso(raw.updatedAt), rejectionReason: raw.rejectionReason ?? null, onboarding: clean(raw.onboarding ?? {}) };
}

export async function listingDetail(propertyId: string) {
  const property = await adminDb.collection("properties").doc(propertyId).get();
  if (!property.exists) throw new Error("PROPERTY_NOT_FOUND");
  const [rooms, rates, policies, media, documents, partner] = await Promise.all([
    adminDb.collection("roomTypes").where("propertyId", "==", propertyId).get(),
    adminDb.collection("ratePlans").where("propertyId", "==", propertyId).get(),
    adminDb.collection("cancellationPolicies").where("propertyId", "==", propertyId).get(),
    adminDb.collection("mediaAssets").where("propertyId", "==", propertyId).get(),
    adminDb.collection("verificationDocuments").where("propertyId", "==", propertyId).get(),
    adminDb.collection("partnerProfiles").doc(property.data()?.partnerId ?? property.data()?.ownerId ?? "").get(),
  ]);
  return {
    property: clean({ id: property.id, ...property.data() }),
    partner: partner.exists ? clean({ id: partner.id, ...partner.data() }) : null,
    roomTypes: rooms.docs.map((doc) => clean({ id: doc.id, ...doc.data() })),
    ratePlans: rates.docs.map((doc) => clean({ id: doc.id, ...doc.data() })),
    policies: policies.docs.map((doc) => clean({ id: doc.id, ...doc.data() })),
    media: media.docs.map((doc) => clean({ id: doc.id, ...doc.data() })),
    documents: documents.docs.map((doc) => clean({ id: doc.id, ...doc.data() })),
  };
}

export async function overview() {
  const properties = adminDb.collection("properties");
  const media = adminDb.collection("mediaAssets");
  const documents = adminDb.collection("verificationDocuments");
  const users = adminDb.collection("users");

  // Use count() aggregations and targeted queries instead of loading whole
  // collections into memory.
  const [
    pendingCount,
    activeCount,
    pausedCount,
    partnerCount,
    suspendedCount,
    pendingPhotos,
    pendingDocuments,
    usersSnap,
    urgentSnap,
  ] = await Promise.all([
    properties.where("approvalStatus", "==", "pending").count().get(),
    properties.where("status", "==", "active").count().get(),
    properties.where("status", "==", "paused").count().get(),
    users.where("roles", "array-contains", "partner").count().get(),
    users.where("accountStatus", "==", "suspended").count().get(),
    media.where("moderationStatus", "==", "pending").count().get(),
    documents.where("status", "==", "pending").count().get(),
    users.count().get(),
    properties.where("approvalStatus", "==", "pending").limit(50).get(),
  ]);

  const totalUsers = usersSnap.data().count;
  const partners = partnerCount.data().count;

  return {
    metrics: {
      pendingListings: pendingCount.data().count,
      activeListings: activeCount.data().count,
      pausedListings: pausedCount.data().count,
      partners,
      customers: Math.max(0, totalUsers - partners),
      suspendedAccounts: suspendedCount.data().count,
      pendingPhotos: pendingPhotos.data().count,
      pendingDocuments: pendingDocuments.data().count,
    },
    urgentProperties: urgentSnap.docs
      .map((doc) => ({ doc, ms: (doc.data().submittedAt as { toMillis?: () => number })?.toMillis?.() ?? 0 }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 6)
      .map(({ doc }) => propertySummary(doc.id, doc.data())),
  };
}

export const userUpdateSchema = z.object({ accountStatus: z.enum(["active", "suspended"]).optional(), roles: z.array(z.enum(["customer", "partner", "admin"])).min(1).max(3).optional() }).strict();
export async function updateUser(adminId: string, userId: string, input: z.infer<typeof userUpdateSchema>) {
  const ref = adminDb.collection("users").doc(userId); const target = await ref.get();
  if (!target.exists) throw new Error("USER_NOT_FOUND");
  const currentRoles = Array.isArray(target.data()?.roles) ? target.data()?.roles : ["customer"];
  const nextRoles = input.roles ? [...new Set(input.roles)] : currentRoles;
  const nextStatus = input.accountStatus ?? target.data()?.accountStatus ?? "active";
  const removesOwnAdmin = userId === adminId && (!nextRoles.includes("admin") || nextStatus !== "active");
  if (removesOwnAdmin) throw new Error("You cannot remove or suspend your own admin access.");
  const activeAdmins = (await adminDb.collection("users").limit(500).get()).docs.filter((doc) => Array.isArray(doc.data().roles) && doc.data().roles.includes("admin") && doc.data().accountStatus !== "suspended" && doc.data().isActive !== false);
  const targetIsActiveAdmin = currentRoles.includes("admin") && target.data()?.accountStatus !== "suspended" && target.data()?.isActive !== false;
  if (targetIsActiveAdmin && (!nextRoles.includes("admin") || nextStatus !== "active") && activeAdmins.length <= 1) throw new Error("The final active admin cannot be removed or suspended.");
  await ref.update({ ...(input.roles ? { roles: nextRoles } : {}), ...(input.accountStatus ? { accountStatus: input.accountStatus, isActive: input.accountStatus === "active" } : {}), updatedAt: FieldValue.serverTimestamp(), updatedBy: adminId });
}

export function serializeDirectoryUser(doc: FirebaseFirestore.QueryDocumentSnapshot) { return serializeUser(doc.id, doc.data()); }
