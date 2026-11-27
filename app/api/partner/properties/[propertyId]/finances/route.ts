import { reservationHandler } from "@/lib/partner/reservations/handler";
import { readOwnerFinancesOverview } from "@/lib/finances/service";

export const GET = reservationHandler(
  "/api/partner/properties/[propertyId]/finances",
  false,
  async (
    _request: Request,
    context: { params: Promise<{ propertyId: string }> },
    uid,
  ) => {
    const { propertyId } = await context.params;
    return Response.json(await readOwnerFinancesOverview(uid, propertyId));
  },
);
