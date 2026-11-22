import { z } from "zod";
import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { operationalAccess } from "@/lib/partner/pms/access";
import { adminDb } from "@/lib/firebase/admin";
import { evaluateStayRules as evaluateStay } from "@/lib/booking/domain";
import { ratePlanSchema } from "@/lib/partner/service";
import { bookingCalculation } from "@/lib/finance/booking-calculation";
import { validDate } from "@/lib/booking/domain";
export const POST = withApiHandler(async (request, context: { params: Promise<{ propertyId: string }> }) => {
  const { propertyId } = await context.params;
  const input = z.object({ rate: ratePlanSchema, checkIn: z.string().refine(validDate), checkOut: z.string().refine(validDate).optional(), arrivalTime: z.string().optional(), durationMinutes: z.number().int().optional() }).strict().parse(await request.json());
  const result = await adminDb.runTransaction(async tx => {
    const { property } = await operationalAccess(actorFromRequest().uid, propertyId, "rates.manage", tx);
    const [room, policy] = await Promise.all([tx.get(adminDb.collection("roomTypes").doc(input.rate.roomTypeId)), tx.get(adminDb.collection("cancellationPolicies").doc(input.rate.cancellationPolicyId))]);
    if (room.get("propertyId") !== propertyId || policy.get("propertyId") !== propertyId || policy.get("status") !== "active") throw new Error("RATE_NOT_AVAILABLE");
    const stay = evaluateStay({ ...input, adults: 1, children: 0, infants: 0, bookingMode: input.rate.bookingMode }, property, room.data()!, { ...input.rate, taxBasisPoints: 0 });
    const agreement = await bookingCalculation({ propertyId, stay, rate: { ...input.rate, priceReview: { basis: input.rate.priceEntryBasis, reviewedBy: actorFromRequest().uid, reviewedAt: new Date().toISOString() } }, requests: [], offerings: [], policy: policy.data(), tx });
    return agreement.publicCalculation;
  });
  return Response.json({ calculation: result });
}, { route: "/api/partner/properties/[propertyId]/price-preview", auth: "strict", requireAuth: true, cache: "private", legacyShape: false });
