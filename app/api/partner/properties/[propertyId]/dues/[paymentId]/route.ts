import { reservationHandler } from "@/lib/partner/reservations/handler";
import { readDues } from "@/lib/dues/service";
export const GET = reservationHandler(
  "/api/partner/properties/[propertyId]/dues/[paymentId]",
  false,
  async (
    _request: Request,
    context: { params: Promise<{ propertyId: string; paymentId: string }> },
    uid,
  ) => {
    const { propertyId, paymentId } = await context.params;
    return Response.json(await readDues(uid, propertyId, true, paymentId));
  },
);
