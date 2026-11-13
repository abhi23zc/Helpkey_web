import { quoteManualReservation } from "@/lib/bookings";
import { reservationHandler } from "@/lib/partner/reservations/handler";
export const POST = reservationHandler(
  "/api/partner/bookings/quote",
  true,
  async (request, _context, uid) =>
    Response.json(await quoteManualReservation(uid, await request.json())),
);
