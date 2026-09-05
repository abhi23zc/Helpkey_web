import { getAuthenticatedUser } from "@/lib/auth/session";
import { propertyOwner, ratePlanSchema } from "@/lib/partner/service";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request: Request, { params }: RouteContext<"/api/partner/properties/[propertyId]/rate-plans">) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try { const { propertyId } = await params; await propertyOwner(user.uid, propertyId); const input = ratePlanSchema.parse(await request.json()); const room = await adminDb.collection("roomTypes").doc(input.roomTypeId).get(); if (!room.exists || room.data()?.propertyId !== propertyId) throw new Error("INVALID_ROOM_TYPE"); const ref = adminDb.collection("ratePlans").doc(); await ref.set({ propertyId, ...input, bookingMode: "overnight", durationMinutes: null, currency: "INR", mealPlan: "none", depositRule: null, taxRule: null, customerFeeRule: null, commissionRule: { type: "percentage", basisPoints: 0 }, requiresPartnerConfirmation: false, advanceBooking: { minimumMinutesBeforeStart: 0, maximumDaysBeforeStart: 365 }, stayRules: { minimumDurationMinutes: null, maximumDurationMinutes: null, minimumNights: 1, maximumNights: null }, status: "active", createdAt: FieldValue.serverTimestamp(), createdBy: user.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid, deletedAt: null }); return Response.json({ ratePlanId: ref.id, ratePlan: { id: ref.id, name: input.name, code: input.code, basePricePaise: input.basePricePaise, roomTypeId: input.roomTypeId, cancellationPolicyId: input.cancellationPolicyId, paymentMode: input.paymentMode } }, { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to create rate plan." }, { status: 422 }); }
}
