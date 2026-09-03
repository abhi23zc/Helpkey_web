import { FieldValue, GeoPoint } from "firebase-admin/firestore";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { listingDetail, requireAdmin } from "@/lib/admin/data";
import { adminDb } from "@/lib/firebase/admin";
import { propertyPatchSchema } from "@/lib/partner/service";

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
