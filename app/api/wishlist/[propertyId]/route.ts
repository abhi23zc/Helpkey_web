import { FieldValue } from "firebase-admin/firestore";
import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";

type Context = { params: Promise<{ propertyId: string }> };
function validId(id: string) { if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new ApiException("INVALID_PROPERTY_ID", 422, "Invalid hotel."); }
export const PUT = withApiHandler(async (_request: Request, context: Context) => {
  const { propertyId } = await context.params;
  validId(propertyId);
  const user = actorFromRequest();
  const ref = adminDb.collection("users").doc(user.uid).collection("savedProperties").doc(propertyId);
  await adminDb.runTransaction(async tx => {
    const property = await tx.get(adminDb.collection("properties").doc(propertyId));
    if (!property.exists || property.get("status") !== "active" || property.get("approvalStatus") !== "approved" || property.get("isBookable") !== true) throw new ApiException("PROPERTY_UNAVAILABLE", 404, "This hotel is no longer available.");
    const saved = await tx.get(ref);
    if (!saved.exists) tx.set(ref, { propertyId, savedAt: FieldValue.serverTimestamp() });
  });
  return Response.json({ saved: true, propertyId });
}, { route: "/api/wishlist/[propertyId]", auth: "strict", requireAuth: true, cache: "private" });

export const DELETE = withApiHandler(async (_request: Request, context: Context) => {
  const { propertyId } = await context.params;
  validId(propertyId);
  await adminDb.collection("users").doc(actorFromRequest().uid).collection("savedProperties").doc(propertyId).delete();
  return Response.json({ saved: false, propertyId });
}, { route: "/api/wishlist/[propertyId]", auth: "strict", requireAuth: true, cache: "private" });
