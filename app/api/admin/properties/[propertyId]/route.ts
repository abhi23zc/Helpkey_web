import { FieldValue, GeoPoint } from "firebase-admin/firestore";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { listingDetail, requireAdmin } from "@/lib/admin/data";
import { adminDb } from "@/lib/firebase/admin";
import { propertyPatchSchema } from "@/lib/partner/service";
import { deleteR2Object } from "@/lib/r2";

const deleteSchema = z.object({ confirmation: z.literal("DELETE") }).strict();

const PROPERTY_DEPENDENT_COLLECTIONS = [
  "roomTypes",
  "ratePlans",
  "cancellationPolicies",
  "mediaAssets",
  "verificationDocuments",
  "propertyMemberships",
  "pendingUploads",
  "propertyReviewEvents",
  "bookings",
  "payments",
] as const;

async function deleteInBatches(refs: FirebaseFirestore.DocumentReference[]) {
  for (let index = 0; index < refs.length; index += 450) {
    const batch = adminDb.batch();
    refs.slice(index, index + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

export async function GET(_request: Request, { params }: RouteContext<"/api/admin/properties/[propertyId]">) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try { await requireAdmin(user.uid); const { propertyId } = await params; return Response.json(await listingDetail(propertyId)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to load property." }, { status: 422 }); }
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/admin/properties/[propertyId]">) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    await requireAdmin(user.uid); const { propertyId } = await params; const patch = propertyPatchSchema.parse(await request.json()); const ref = adminDb.collection("properties").doc(propertyId); const exists = await ref.get(); if (!exists.exists) throw new Error("PROPERTY_NOT_FOUND");
    const update: Record<string, unknown> = { ...patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid };
    if (patch.latitude !== undefined && patch.longitude !== undefined) { update.geoPoint = new GeoPoint(patch.latitude, patch.longitude); update.geohash = `${patch.latitude.toFixed(4)}:${patch.longitude.toFixed(4)}`; delete update.latitude; delete update.longitude; }
    await ref.update(update); return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to save property." }, { status: 422 }); }
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/admin/properties/[propertyId]">) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    await requireAdmin(user.uid);
    deleteSchema.parse(await request.json());
    const { propertyId } = await params;
    const propertyRef = adminDb.collection("properties").doc(propertyId);
    const property = await propertyRef.get();
    if (!property.exists) throw new Error("PROPERTY_NOT_FOUND");

    const dependentSnapshots = await Promise.all(
      PROPERTY_DEPENDENT_COLLECTIONS.map((collection) =>
        adminDb.collection(collection).where("propertyId", "==", propertyId).get(),
      ),
    );
    const dependentDocs = dependentSnapshots.flatMap((snapshot) => snapshot.docs);
    const objectKeys = [...new Set(
      dependentDocs
        .map((doc) => doc.data().r2ObjectKey)
        .filter((key): key is string => typeof key === "string" && key.length > 0),
    )];

    // Remove storage first. If this fails, no database records are changed and
    // the admin can safely retry the complete deletion.
    await Promise.all(objectKeys.map((key) => deleteR2Object(key)));
    await deleteInBatches([...dependentDocs.map((doc) => doc.ref), propertyRef]);

    const partnerId = property.data()?.partnerId ?? property.data()?.ownerId;
    if (typeof partnerId === "string" && partnerId) {
      const partnerRef = adminDb.collection("partnerProfiles").doc(partnerId);
      const partner = await partnerRef.get();
      if (partner.exists && partner.data()?.primaryDraftPropertyId === propertyId) {
        await partnerRef.update({ primaryDraftPropertyId: null, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete property.";
    const status = message === "PROPERTY_NOT_FOUND" ? 404 : message === "FORBIDDEN" ? 403 : 422;
    return Response.json({ error: message }, { status });
  }
}
