import { reservationHandler } from "@/lib/partner/reservations/handler";
import { readPayouts } from "@/lib/payouts/service";
export const GET = reservationHandler("/api/partner/properties/[propertyId]/payouts/[payoutId]", false,
  async (_request: Request, context: { params: Promise<{ propertyId: string; payoutId: string }> }, uid) => {
    const { propertyId, payoutId } = await context.params;
    return Response.json(await readPayouts(uid, propertyId, true, payoutId));
  });
