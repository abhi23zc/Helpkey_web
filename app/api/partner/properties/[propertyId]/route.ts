import { getAuthenticatedUser } from "@/lib/auth/session";
import { propertyOwner, propertyPatchSchema } from "@/lib/partner/service";
import { FieldValue, GeoPoint } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { createR2ReadUrl } from "@/lib/r2";

function serializeDate(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

/** Resolves a short-lived signed read URL for a media asset; null on failure. */
function safeReadUrl(objectKey: unknown): string | null {
  if (typeof objectKey !== "string" || !objectKey) return null;
  try {
    return createR2ReadUrl(objectKey).url;
  } catch {
    return null;
  }
}

export async function GET(_: Request, { params }: RouteContext<"/api/partner/properties/[propertyId]">) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try { const { propertyId } = await params; const ref = await propertyOwner(user.uid, propertyId); const [property, rooms, rates, policies, media, documents] = await Promise.all([ref.get(), adminDb.collection("roomTypes").where("propertyId", "==", propertyId).limit(50).get(), adminDb.collection("ratePlans").where("propertyId", "==", propertyId).limit(100).get(), adminDb.collection("cancellationPolicies").where("propertyId", "==", propertyId).get(), adminDb.collection("mediaAssets").where("propertyId", "==", propertyId).get(), adminDb.collection("verificationDocuments").where("propertyId", "==", propertyId).get()]); const p = property.data() ?? {}; return Response.json({ property: { id: property.id, name: p.name, propertyType: p.propertyType, description: p.description, address: p.address, latitude: p.geoPoint?.latitude, longitude: p.geoPoint?.longitude, googlePlaceId: p.googlePlaceId, timezone: p.timezone, checkInTime: p.checkInTime, checkOutTime: p.checkOutTime, publicPhone: p.publicPhone, publicEmail: p.publicEmail, floors: p.floors ?? 0, totalPhysicalRooms: p.totalPhysicalRooms, otaUrls: p.otaUrls ?? [], amenityIds: p.amenityIds ?? [], roomAmenityIds: p.roomAmenityIds ?? [], childrenPolicy: p.childrenPolicy ?? {}, petPolicy: p.petPolicy ?? {}, smokingPolicy: p.smokingPolicy ?? {}, identityRequirements: p.identityRequirements ?? {}, coverMediaId: p.coverMediaId ?? null, cancellationPolicyIds: p.cancellationPolicyIds ?? [], onboarding: p.onboarding ?? { currentStep: 1, completedSteps: [] }, status: p.status, approvalStatus: p.approvalStatus, rejectionReason: p.rejectionReason ?? null, ratingAverage: typeof p.ratingAverage === "number" ? p.ratingAverage : 0, ratingCount: typeof p.ratingCount === "number" ? p.ratingCount : 0, currency: typeof p.currency === "string" ? p.currency : "INR", submittedAt: serializeDate(p.submittedAt), updatedAt: serializeDate(p.updatedAt) }, roomTypes: rooms.docs.map((doc) => { const room = doc.data(); return { id: doc.id, name: room.name, description: room.description, inventory: room.totalInventory, maxAdults: room.maxAdults, maxChildren: room.maxChildren ?? 0, maxInfants: room.maxInfants ?? 0, bedConfigurations: room.bedConfigurations ?? [], roomSizeSqFt: typeof room.roomSizeSqFt === "number" ? room.roomSizeSqFt : null, bathroomType: room.bathroomType === "shared" ? "shared" : "private", amenityIds: room.amenityIds ?? [], mediaIds: room.mediaIds ?? [], coverMediaId: room.coverMediaId ?? null, status: room.status === "paused" ? "paused" : "active" }; }), ratePlans: rates.docs.map((doc) => ({ id: doc.id, name: doc.data().name, code: doc.data().code, basePricePaise: doc.data().basePricePaise, roomTypeId: doc.data().roomTypeId, cancellationPolicyId: doc.data().cancellationPolicyId, paymentMode: doc.data().paymentMode ?? null, status: doc.data().status === "paused" ? "paused" : "active" })), policies: policies.docs.map(d => ({ id: d.id, ...d.data() })), media: media.docs.map((d) => { const data = d.data(); return { id: d.id, kind: data.kind, category: data.category ?? null, fileName: data.fileName ?? null, altText: typeof data.altText === "string" ? data.altText : "", moderationStatus: data.moderationStatus ?? data.status ?? "pending", isCover: d.id === (p.coverMediaId ?? null), imageUrl: safeReadUrl(data.r2ObjectKey) }; }), documents: documents.docs.map(d => ({ id: d.id, ...d.data() })) }); }
  catch { return Response.json({ error: "Property access required." }, { status: 403 }); }
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/partner/properties/[propertyId]">) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try { const { propertyId } = await params; const ref = await propertyOwner(user.uid, propertyId); const patch = propertyPatchSchema.parse(await request.json()); const location = patch.latitude !== undefined || patch.longitude !== undefined || patch.address || patch.googlePlaceId || patch.timezone; if (location && (patch.latitude === undefined || patch.longitude === undefined || !patch.address || !patch.googlePlaceId || !patch.timezone)) throw new Error("COMPLETE_PLACE_REQUIRED"); if (patch.timezone) { try { Intl.DateTimeFormat(undefined, { timeZone: patch.timezone }); } catch { throw new Error("INVALID_TIMEZONE"); } } const update: Record<string, unknown> = { ...patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid }; if (patch.latitude !== undefined && patch.longitude !== undefined) { update.geoPoint = new GeoPoint(patch.latitude, patch.longitude); update.geohash = `${patch.latitude.toFixed(4)}:${patch.longitude.toFixed(4)}`; delete update.latitude; delete update.longitude; } await ref.update(update); const updatedAt = new Date().toISOString(); return Response.json({ ok: true, property: { ...patch, updatedAt } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to save property." }, { status: 422 }); }
}
