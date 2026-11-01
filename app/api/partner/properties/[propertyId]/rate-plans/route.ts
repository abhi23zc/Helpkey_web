import { eligiblePricing, startingPrice } from "@/lib/booking/duration-pricing";
import { withApiHandler } from "@/lib/api/handler";
import { FieldValue } from "firebase-admin/firestore";
import { rateOwnerError } from "@/lib/partner/rate-owner-error";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { propertyOwner, ratePlanSchema } from "@/lib/partner/service";
import { enqueueProjection } from "@/lib/projections";
import { invalidatePublic } from "@/lib/api/cache";

const rawPOST = async function POST(request: Request, { params }: RouteContext<"/api/partner/properties/[propertyId]/rate-plans">) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    const { propertyId } = await params;
    await propertyOwner(user.uid, propertyId);
    const input = ratePlanSchema.parse(await request.json());
    const room = await adminDb.collection("roomTypes").doc(input.roomTypeId).get();
    if (!room.exists || room.data()?.propertyId !== propertyId) throw new Error("INVALID_ROOM_TYPE");
    const policy = await adminDb.collection("cancellationPolicies").doc(input.cancellationPolicyId).get();
    if (policy.data()?.propertyId !== propertyId || policy.data()?.status !== "active") throw new Error("INVALID_POLICY");
    if ((input.minimumDurationMinutes ?? 15) > (input.maximumDurationMinutes ?? 1440)) throw new Error("MAXIMUM_DURATION_TOO_LOW");
    if (input.arrivalWindow && input.arrivalWindow.start > input.arrivalWindow.end) throw new Error("INVALID_ARRIVAL_WINDOW");
    if (!eligiblePricing(input)) throw new Error("Enter hourly duration prices before saving this rate.");
    const ref = adminDb.collection("ratePlans").doc();
    const { minimumNights, maximumNights, minimumDurationMinutes, maximumDurationMinutes, minimumAdvanceMinutes, maximumAdvanceDays, ...fields } = input;
    const rate = { ...fields, code: fields.code ?? `RATE_${ref.id.toUpperCase()}` };
    const batch = adminDb.batch();
    batch.set(ref, {
      propertyId,
      ...rate,
      basePricePaise: startingPrice(rate),
      bookingMode: rate.bookingMode ?? "overnight",
      pricingModel: rate.pricingModel ?? "nightly",
      currency: "INR",
      mealPlan: "none",
      depositRule: null,
      taxRule: null,
      customerFeeRule: null,
      commissionRule: { type: "percentage", basisPoints: 0 },
      requiresPartnerConfirmation: false,
      advanceBooking: { minimumMinutesBeforeStart: 0, maximumDaysBeforeStart: 365 },
      stayRules: { minimumDurationMinutes: minimumDurationMinutes ?? 15, maximumDurationMinutes: maximumDurationMinutes ?? 1440, minimumAdvanceMinutes: minimumAdvanceMinutes ?? ((rate.bookingMode ?? "overnight") === "hourly" ? 15 : 0), maximumAdvanceDays: maximumAdvanceDays ?? 365, minimumNights, maximumNights },
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      createdBy: user.uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
      deletedAt: null,
    });
    enqueueProjection(batch, "property_search", propertyId, 1, { components: ["pricing"] });
    await batch.commit();
    await invalidatePublic("home", "search:*", "property:*", "bookable:*");
    return Response.json({ ratePlanId: ref.id, ratePlan: { id: ref.id, propertyId, ...rate, basePricePaise: startingPrice(rate), roomTypeId: input.roomTypeId, cancellationPolicyId: input.cancellationPolicyId, minimumNights, maximumNights, status: "active" } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: rateOwnerError(error) }, { status: 422 });
  }
}

export const POST = withApiHandler(rawPOST, { route: "/api/partner/properties/[propertyId]/rate-plans", auth: "strict", requireAuth: true, cache: "private" });
