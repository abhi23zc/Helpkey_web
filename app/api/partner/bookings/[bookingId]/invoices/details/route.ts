import { reservationHandler } from "@/lib/partner/reservations/handler";
import { saveDocumentDetails } from "@/lib/partner/invoices/service";
type Context = { params: Promise<{ bookingId: string }> };
export const POST = reservationHandler(
  "/api/partner/bookings/[bookingId]/invoices/details",
  true,
  async (r, c: Context, uid) =>
    Response.json(
      await saveDocumentDetails(
        uid,
        (await c.params).bookingId,
        await r.json(),
      ),
    ),
);
