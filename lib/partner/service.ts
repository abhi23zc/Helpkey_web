import "server-only";

import { FieldValue, GeoPoint } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { recordReviewEvent } from "@/lib/partner/review-events";
import { getUserByUid } from "@/lib/auth/users";

const propertyTypes = ["hotel", "apartment", "villa", "resort", "hostel", "guest_house", "homestay", "other"] as const;
const address = z.object({ line1: z.string().min(2), line2: z.string().nullable().default(null), landmark: z.string().nullable().default(null), city: z.string().min(2), district: z.string().nullable().default(null), state: z.string().min(2), postalCode: z.string().min(4), countryCode: z.literal("IN") });
export const onboardingSchema = z.object({ createNew: z.boolean().optional().default(false), businessName: z.string().min(2).max(120), businessEmail: z.string().email(), businessPhone: z.string().regex(/^\+\d{6,15}$/), businessAddress: address, property: z.object({ name: z.string().min(2).max(140), propertyType: z.enum(propertyTypes), roomCount: z.number().int().min(1).max(500), address, latitude: z.number().gte(-90).lte(90), longitude: z.number().gte(-180).lte(180), googlePlaceId: z.string().min(1), timezone: z.string().min(1) }) }).strict();
export const propertyPatchSchema = z.object({ name: z.string().min(2).max(140).optional(), propertyType: z.enum(propertyTypes).optional(), description: z.string().min(20).max(6000).optional(), checkInTime: z.string().regex(/^\d{2}:\d{2}$/).optional(), checkOutTime: z.string().regex(/^\d{2}:\d{2}$/).optional(), publicPhone: z.string().regex(/^\+\d{6,15}$/).optional(), publicEmail: z.string().email().optional(), floors: z.number().int().min(0).max(200).optional(), totalPhysicalRooms: z.number().int().min(1).max(500).optional(), otaUrls: z.array(z.string().url()).max(10).optional(), amenityIds: z.array(z.string()).max(100).optional(), roomAmenityIds: z.array(z.string()).max(100).optional(), mediaIds: z.array(z.string()).max(50).optional(), coverMediaId: z.string().nullable().optional(), cancellationPolicyIds: z.array(z.string()).max(10).optional(), childrenPolicy: z.record(z.string(), z.unknown()).optional(), petPolicy: z.record(z.string(), z.unknown()).optional(), smokingPolicy: z.record(z.string(), z.unknown()).optional(), identityRequirements: z.record(z.string(), z.unknown()).optional(), address: address.optional(), latitude: z.number().gte(-90).lte(90).optional(), longitude: z.number().gte(-180).lte(180).optional(), googlePlaceId: z.string().min(1).optional(), timezone: z.string().min(1).optional() }).strict();
export const roomTypeSchema = z.object({ name: z.string().min(2), description: z.string().min(10).max(3000), totalInventory: z.number().int().min(1).max(500), maxAdults: z.number().int().min(1).max(20), maxChildren: z.number().int().min(0).max(20), maxInfants: z.number().int().min(0).max(10), bedConfigurations: z.array(z.object({ bedType: z.string().min(1), count: z.number().int().min(1) })).min(1), amenityIds: z.array(z.string()).max(50).optional() }).strict();
export const ratePlanSchema = z.object({ roomTypeId: z.string().min(1), name: z.string().min(2), code: z.string().regex(/^[A-Z0-9_-]{2,32}$/), basePricePaise: z.number().int().min(1), cancellationPolicyId: z.string().min(1), paymentMode: z.enum(["full", "deposit", "pay_at_property"]).default("full") }).strict();
export const cancellationPolicySchema = z.object({ name: z.string().min(2).max(100), description: z.string().min(10).max(2000), refundableUntilHours: z.number().int().min(0).max(8760), cancellationFeePercent: z.number().int().min(0).max(100) }).strict();
export const stepSchema = z.object({ step: z.number().int().min(1).max(8), completed: z.boolean().default(true) }).strict();

export async function requireRole(uid: string, role: "partner" | "admin") { const user = await getUserByUid(uid); if (!user || !user.isActive || !user.roles.includes(role)) throw new Error("FORBIDDEN"); return user; }
export async function propertyOwner(uid: string, propertyId: string) { await requireRole(uid, "partner"); const membership = await adminDb.collection("propertyMemberships").doc(`${propertyId}_${uid}`).get(); if (!membership.exists || membership.data()?.status !== "active" || membership.data()?.role !== "owner") throw new Error("FORBIDDEN"); return adminDb.collection("properties").doc(propertyId); }
const slug = (name: string, id: string) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 70)}-${id.slice(0, 6)}`;

export async function beginOnboarding(uid: string, raw: unknown) {
  const input = onboardingSchema.parse(raw); const userRef = adminDb.collection("users").doc(uid); const partnerRef = adminDb.collection("partnerProfiles").doc(uid);
  return adminDb.runTransaction(async (tx) => { const user = await tx.get(userRef); const oldPartner = await tx.get(partnerRef); if (!user.exists || user.data()?.accountStatus !== "active") throw new Error("FORBIDDEN"); const propertyId = input.createNew ? adminDb.collection("properties").doc().id : oldPartner.data()?.primaryDraftPropertyId || adminDb.collection("properties").doc().id; const propertyRef = adminDb.collection("properties").doc(propertyId); const allRoles = new Set(Array.isArray(user.data()?.roles) ? user.data()?.roles : ["customer"]); allRoles.add("partner");
    tx.set(userRef, { roles: [...allRoles], updatedAt: FieldValue.serverTimestamp(), updatedBy: uid }, { merge: true });
    tx.set(partnerRef, { userId: uid, businessName: input.businessName, businessEmail: input.businessEmail.toLowerCase(), businessPhone: input.businessPhone, businessAddress: input.businessAddress, gstin: null, pan: null, onboardingStatus: "property_setup", kycStatus: "not_started", payoutEligibility: "blocked", defaultCommissionBps: null, primaryDraftPropertyId: propertyId, createdAt: oldPartner.exists ? oldPartner.data()?.createdAt : FieldValue.serverTimestamp(), createdBy: oldPartner.exists ? oldPartner.data()?.createdBy : uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid, deletedAt: null }, { merge: true });
    tx.set(propertyRef, { ownerId: uid, partnerId: uid, name: input.property.name, slug: slug(input.property.name, propertyId), propertyType: input.property.propertyType, description: "", address: input.property.address, geoPoint: new GeoPoint(input.property.latitude, input.property.longitude), geohash: `${input.property.latitude.toFixed(4)}:${input.property.longitude.toFixed(4)}`, googlePlaceId: input.property.googlePlaceId, timezone: input.property.timezone, checkInTime: "14:00", checkOutTime: "11:00", bookingModes: ["overnight"], publicPhone: input.businessPhone, publicEmail: input.businessEmail.toLowerCase(), supportContact: null, floors: 0, otaUrls: [], onboarding: { currentStep: 1, completedSteps: [], lastSavedAt: FieldValue.serverTimestamp() }, roomTypeCount: 0, totalPhysicalRooms: input.property.roomCount, currency: "INR", customerFeeRule: null, partnerCommissionRule: { type: "percentage", basisPoints: 0 }, payAtPropertyEnabled: false, depositsEnabled: false, defaultLanguage: "en", supportedLanguages: ["en"], amenityIds: [], roomAmenityIds: [], mediaIds: [], coverMediaId: null, cancellationPolicyIds: [], childrenPolicy: {}, petPolicy: {}, smokingPolicy: {}, identityRequirements: {}, status: "draft", approvalStatus: "not_submitted", rejectionReason: null, submittedAt: null, approvedAt: null, pausedAt: null, suspendedUntil: null, ratingAverage: 0, ratingCount: 0, minimumDisplayPricePaise: null, isBookable: false, createdAt: FieldValue.serverTimestamp(), createdBy: uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid, deletedAt: null }, { merge: true });
    tx.set(adminDb.collection("propertyMemberships").doc(`${propertyId}_${uid}`), { propertyId, userId: uid, role: "owner", permissions: ["*"], status: "active", createdAt: FieldValue.serverTimestamp(), createdBy: uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid, deletedAt: null }, { merge: true }); return { propertyId }; });
}
export async function startPropertyDraft(uid: string, name: string) {
  if (name.trim().length < 2 || name.trim().length > 140) throw new Error("PROPERTY_NAME_REQUIRED");
  await requireRole(uid, "partner").catch(async () => { const userRef = adminDb.collection("users").doc(uid); await userRef.set({ roles: FieldValue.arrayUnion("partner"), updatedAt: FieldValue.serverTimestamp(), updatedBy: uid }, { merge: true }); });
  const propertyRef = adminDb.collection("properties").doc();
  await propertyRef.set({ ownerId: uid, partnerId: uid, name: name.trim(), slug: slug(name, propertyRef.id), propertyType: "hotel", description: "", address: {}, geoPoint: null, geohash: null, googlePlaceId: null, timezone: "Asia/Kolkata", checkInTime: "14:00", checkOutTime: "11:00", publicPhone: null, publicEmail: null, floors: 0, totalPhysicalRooms: 1, otaUrls: [], amenityIds: [], roomAmenityIds: [], mediaIds: [], coverMediaId: null, cancellationPolicyIds: [], childrenPolicy: {}, petPolicy: {}, smokingPolicy: {}, identityRequirements: {}, onboarding: { currentStep: 1, completedSteps: [], lastSavedAt: FieldValue.serverTimestamp() }, status: "draft", approvalStatus: "not_submitted", rejectionReason: null, isBookable: false, createdAt: FieldValue.serverTimestamp(), createdBy: uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid, deletedAt: null });
  await adminDb.collection("propertyMemberships").doc(`${propertyRef.id}_${uid}`).set({ propertyId: propertyRef.id, userId: uid, role: "owner", permissions: ["*"], status: "active", createdAt: FieldValue.serverTimestamp(), createdBy: uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid, deletedAt: null });
  await adminDb.collection("partnerProfiles").doc(uid).set({ userId: uid, onboardingStatus: "property_setup", primaryDraftPropertyId: propertyRef.id, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid, createdAt: FieldValue.serverTimestamp(), createdBy: uid }, { merge: true });
  return { propertyId: propertyRef.id };
}
export async function submit(uid: string, propertyId: string) { const ref = await propertyOwner(uid, propertyId); const [p, rooms, rates, media, documents] = await Promise.all([ref.get(), adminDb.collection("roomTypes").where("propertyId", "==", propertyId).where("status", "==", "active").get(), adminDb.collection("ratePlans").where("propertyId", "==", propertyId).where("status", "==", "active").get(), adminDb.collection("mediaAssets").where("propertyId", "==", propertyId).get(), adminDb.collection("verificationDocuments").where("propertyId", "==", propertyId).get()]); const data = p.data(); const sellableRooms = new Set(rooms.docs.map(r => r.id)); const rateRooms = new Set(rates.docs.filter(r => sellableRooms.has(r.data().roomTypeId) && r.data().cancellationPolicyId).map(r => r.data().roomTypeId)); const validImages = media.docs.filter(d => ["pending", "approved"].includes(d.data().moderationStatus ?? d.data().status) && d.data().kind === "property_image"); const documentKinds = new Set(documents.docs.filter(d => ["pending", "approved"].includes(d.data().status)).map(d => d.data().documentType)); const required = ["pan", "government_id_front", "government_id_back"];
  const missing = [
    !data?.name || !data?.description || !data?.checkInTime || !data?.checkOutTime || !data?.publicPhone ? "property details" : null,
    !data?.address?.city || !data?.googlePlaceId ? "confirmed property location" : null,
    !data?.amenityIds?.length ? "facilities and guest policies" : null,
    !sellableRooms.size || rateRooms.size !== sellableRooms.size || !data?.cancellationPolicyIds?.length ? "a sellable rate and cancellation policy for every room type" : null,
    validImages.length < 6 ? `${6 - validImages.length} more property photo${6 - validImages.length === 1 ? "" : "s"}` : null,
    required.some(kind => !documentKinds.has(kind)) ? "required identity documents" : null,
  ].filter(Boolean);
  if (data?.status === "active") throw new Error("This property is already listed.");
  if (missing.length) throw new Error(`Before submitting, complete: ${missing.join(", ")}.`);
  if (data?.approvalStatus === "pending") return;

  // Atomic transition: re-read the property inside the transaction to guard
  // against races, then update the property + partner profile and write the
  // audit event in a single commit.
  const partnerRef = adminDb.collection("partnerProfiles").doc(uid);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.data();
    if (!current) throw new Error("PROPERTY_NOT_FOUND");
    if (current.status === "active") throw new Error("This property is already listed.");
    if (current.approvalStatus === "pending") return;

    const fromApprovalStatus = String(current.approvalStatus ?? "not_submitted");
    const fromStatus = String(current.status ?? "draft");
    const submissionCount = (typeof current.submissionCount === "number" ? current.submissionCount : 0) + 1;
    const now = FieldValue.serverTimestamp();

    tx.update(ref, {
      status: "pending_review",
      approvalStatus: "pending",
      rejectionReason: null,
      // First submission stamps `submittedAt`; every submission bumps the rest.
      ...(current.submittedAt ? {} : { submittedAt: now }),
      lastSubmittedAt: now,
      submissionCount,
      updatedAt: now,
      updatedBy: uid,
    });

    tx.set(
      partnerRef,
      { onboardingStatus: "submitted", updatedAt: now, updatedBy: uid },
      { merge: true },
    );

    recordReviewEvent(tx, {
      propertyId,
      actorId: uid,
      actorRole: "partner",
      action: "submitted",
      fromApprovalStatus,
      toApprovalStatus: "pending",
      fromStatus,
      toStatus: "pending_review",
      submissionAttempt: submissionCount,
    });
  });

  return { propertyId, propertyName: typeof data?.name === "string" ? data.name : "Your property" };
}
