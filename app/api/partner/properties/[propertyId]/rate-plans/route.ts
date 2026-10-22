import { eligiblePricing, startingPrice } from "@/lib/booking/duration-pricing";
import { withApiHandler } from "@/lib/api/handler";
import { FieldValue } from "firebase-admin/firestore";
import { ZodError } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { propertyOwner, ratePlanSchema } from "@/lib/partner/service";
import { enqueueProjection } from "@/lib/projections";
import { invalidatePublic } from "@/lib/api/cache";

function customerError(error: unknown) {
  if (error instanceof ZodError) {
    const field = String(error.issues[0]?.path[0] ?? "");
    if (field === "name") return "Enter a rate name with at least 2 characters.";
    if (field === "basePricePaise") return "Enter a rate price greater than ₹0.";
    if (field === "durationPrices") return "Add unique durations from 1–24 hours, each with a total price greater than ₹0.";
    if (field === "durationMinutes" || field === "minimumDurationMinutes" || field === "maximumDurationMinutes") return "Use a stay duration from 15 to 1,440 minutes in 15-minute steps.";
    if (field === "arrivalWindow" || field === "operatingWindow") return "Choose valid arrival and operating times.";
    if (field === "cancellationPolicyId") return "Choose a cancellation policy for this rate.";
    if (field === "roomTypeId") return "Choose the room type this rate applies to.";
    return "Check the rate name, room type, cancellation policy, price, and stay settings.";
  }
  if (error instanceof Error && error.message === "INVALID_ROOM_TYPE") return "Choose a valid room type and try again.";
  return error instanceof Error ? error.message : "Unable to create rate plan.";
}

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
    const { minimumNights, maximumNights, minimumDurationMinutes, maximumDurationMinutes, minimumAdvanceMinutes, maximumAdvanceDays, ...rate } = input;
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
    return Response.json({ error: customerError(error) }, { status: 422 });
  }
}

export const POST = withApiHandler(rawPOST, { route: "/api/partner/properties/[propertyId]/rate-plans", auth: "strict", requireAuth: true, cache: "private" });
