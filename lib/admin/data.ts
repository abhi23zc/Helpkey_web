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
  const [properties, users, media, documents] = await Promise.all([
    adminDb.collection("properties").limit(500).get(), adminDb.collection("users").limit(500).get(), adminDb.collection("mediaAssets").limit(1000).get(), adminDb.collection("verificationDocuments").limit(1000).get(),
  ]);
  const count = (items: FirebaseFirestore.QueryDocumentSnapshot[], predicate: (data: FirebaseFirestore.DocumentData) => boolean) => items.filter((item) => predicate(item.data())).length;
  return {
    metrics: {
      pendingListings: count(properties.docs, (p) => p.approvalStatus === "pending"), activeListings: count(properties.docs, (p) => p.status === "active"), pausedListings: count(properties.docs, (p) => p.status === "paused"), partners: count(users.docs, (u) => Array.isArray(u.roles) && u.roles.includes("partner")), customers: count(users.docs, (u) => !Array.isArray(u.roles) || !u.roles.includes("partner")), suspendedAccounts: count(users.docs, (u) => u.accountStatus === "suspended"), pendingPhotos: count(media.docs, (m) => (m.moderationStatus ?? m.status) === "pending"), pendingDocuments: count(documents.docs, (d) => d.status === "pending"),
    },
    urgentProperties: properties.docs.filter((doc) => doc.data().approvalStatus === "pending").slice(0, 6).map((doc) => propertySummary(doc.id, doc.data())),
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
