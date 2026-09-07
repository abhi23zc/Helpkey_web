import { FieldValue } from "firebase-admin/firestore";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { propertyOwner, ratePlanSchema } from "@/lib/partner/service";

export async function POST(request: Request, { params }: RouteContext<"/api/partner/properties/[propertyId]/rate-plans">) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    const { propertyId } = await params;
    await propertyOwner(user.uid, propertyId);
    const input = ratePlanSchema.parse(await request.json());
    const room = await adminDb.collection("roomTypes").doc(input.roomTypeId).get();
    if (!room.exists || room.data()?.propertyId !== propertyId) throw new Error("INVALID_ROOM_TYPE");
    const ref = adminDb.collection("ratePlans").doc();
    const { minimumNights, maximumNights, ...rate } = input;
    await ref.set({
      propertyId,
      ...rate,
      bookingMode: "overnight",
      durationMinutes: null,
      currency: "INR",
      mealPlan: "none",
      depositRule: null,
      taxRule: null,
      customerFeeRule: null,
      commissionRule: { type: "percentage", basisPoints: 0 },
      requiresPartnerConfirmation: false,
      advanceBooking: { minimumMinutesBeforeStart: 0, maximumDaysBeforeStart: 365 },
      stayRules: { minimumDurationMinutes: null, maximumDurationMinutes: null, minimumNights, maximumNights },
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      createdBy: user.uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
      deletedAt: null,
    });
    return Response.json({ ratePlanId: ref.id, ratePlan: { id: ref.id, propertyId, ...rate, roomTypeId: input.roomTypeId, cancellationPolicyId: input.cancellationPolicyId, minimumNights, maximumNights, status: "active" } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create rate plan." }, { status: 422 });
  }
}
