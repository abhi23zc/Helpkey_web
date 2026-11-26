import { reservationHandler } from "@/lib/partner/reservations/handler";
import { readBookingFinance } from "@/lib/booking-finance/service";

export const GET = reservationHandler("/api/partner/bookings/[bookingId]/finance", false,
  async (_request: Request, context: { params: Promise<{ bookingId: string }> }, uid) =>
    Response.json(await readBookingFinance(uid, (await context.params).bookingId, "owner")));
