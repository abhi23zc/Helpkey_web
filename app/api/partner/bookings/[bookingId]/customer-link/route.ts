import { reservationHandler } from "@/lib/partner/reservations/handler";
import { issueCustomerLink } from "@/lib/partner/guests/service";
type C = { params: Promise<{ bookingId: string }> };
export const POST = reservationHandler<C>(
  "/api/partner/bookings/[bookingId]/customer-link",
  true,
  async (r, c, uid) =>
    Response.json(
      await issueCustomerLink(uid, (await c.params).bookingId, await r.json()),
    ),
);
