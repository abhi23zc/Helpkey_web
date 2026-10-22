import { eligiblePricing } from "@/lib/booking/duration-pricing";
import { adminDb } from "@/lib/firebase/admin";
import { photoRequirements } from "@/lib/partner/photo-requirements";
import { withApiHandler } from "@/lib/api/handler";
import { FieldValue } from "firebase-admin/firestore";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { propertyOwner, stepSchema } from "@/lib/partner/service";

const rawPOST = async function POST(request: Request, { params }: RouteContext<"/api/partner/properties/[propertyId]/steps">) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try { const { propertyId } = await params; const ref = await propertyOwner(user.uid, propertyId); const input = stepSchema.parse(await request.json()); if (input.step === 4 && input.completed) {
    const [rooms, rates] = await Promise.all([adminDb.collection("roomTypes").where("propertyId", "==", propertyId).where("status", "==", "active").get(), adminDb.collection("ratePlans").where("propertyId", "==", propertyId).where("status", "==", "active").get()]);
    if (rooms.empty || rooms.docs.some(room => !rates.docs.some(rate => rate.get("roomTypeId") === room.id && rate.get("cancellationPolicyId") && eligiblePricing(rate.data())))) throw new Error("Add a sellable rate for each active room. Hourly stays require duration prices.");
  } if (input.step === 6 && input.completed) {
    const [property, media, rooms] = await Promise.all([ref.get(), adminDb.collection("mediaAssets").where("propertyId", "==", propertyId).get(), adminDb.collection("roomTypes").where("propertyId", "==", propertyId).get()]);
    const check = photoRequirements(media.docs.map(d => ({ id: d.id, ...d.data() })), rooms.docs.map(d => ({ id: d.id, name: d.get("name") ?? "Room", ...d.data() })), property.get("coverMediaId"));
    if (!check.complete) throw new Error(`Missing photos: ${check.missing.join(", ")}`);
  } await ref.update({ [`onboarding.currentStep`]: input.completed ? Math.min(input.step + 1, 8) : input.step, [`onboarding.completedSteps`]: input.completed ? FieldValue.arrayUnion(input.step) : FieldValue.arrayRemove(input.step), [`onboarding.lastSavedAt`]: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid }); return Response.json({ ok: true }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to save progress." }, { status: 422 }); }
}

export const POST = withApiHandler(rawPOST, { route: "/api/partner/properties/[propertyId]/steps", auth: "strict", requireAuth: true, cache: "private" });
