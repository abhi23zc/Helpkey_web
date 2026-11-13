import { reservationHandler } from "@/lib/partner/reservations/handler";
import { guestRegistration } from "@/lib/partner/guests/service";
type C = { params: Promise<{ bookingId: string }> };
const route = "/api/partner/bookings/[bookingId]/guest-registration";
export const GET = reservationHandler<C>(route, false, async (_r, c, uid) =>
  Response.json(await guestRegistration(uid, (await c.params).bookingId)),
);
export const POST = reservationHandler<C>(route, true, async (r, c, uid) =>
  Response.json(
    await guestRegistration(uid, (await c.params).bookingId, await r.json()),
  ),
);
