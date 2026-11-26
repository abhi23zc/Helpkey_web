import { amendmentRoute } from "@/lib/booking/amendments/route";
import { paymentSession } from "@/lib/booking/amendments/payments";
export const POST = amendmentRoute(
  "/api/bookings/[bookingId]/amendments/[amendmentId]/payment-session",
  true,
  (uid, id, _request, aid) => paymentSession(uid, id, aid!),
);
