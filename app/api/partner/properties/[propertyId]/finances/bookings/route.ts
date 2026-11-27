import { reservationHandler } from "@/lib/partner/reservations/handler";
import { listOwnerFinanceBookings } from "@/lib/finances/service";

export const GET = reservationHandler(
  "/api/partner/properties/[propertyId]/finances/bookings",
  false,
  async (
    request: Request,
    context: { params: Promise<{ propertyId: string }> },
    uid,
  ) => {
    const { propertyId } = await context.params;
    const query = Object.fromEntries(new URL(request.url).searchParams.entries());
    return Response.json(await listOwnerFinanceBookings(uid, propertyId, query));
  },
);
