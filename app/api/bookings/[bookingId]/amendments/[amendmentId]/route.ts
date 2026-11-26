import { amendmentRoute } from "@/lib/booking/amendments/route";
import { readAttempt } from "@/lib/booking/amendments/service";
export const GET = amendmentRoute(
  "/api/bookings/[bookingId]/amendments/[amendmentId]",
  false,
  (uid, id, _request, aid) => readAttempt(uid, id, aid!),
);
