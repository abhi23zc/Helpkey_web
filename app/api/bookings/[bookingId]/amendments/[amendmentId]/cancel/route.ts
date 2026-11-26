import { amendmentRoute } from "@/lib/booking/amendments/route";
import { cancelAttempt } from "@/lib/booking/amendments/service";
export const POST = amendmentRoute(
  "/api/bookings/[bookingId]/amendments/[amendmentId]/cancel",
  true,
  (uid, id, _request, aid) => cancelAttempt(uid, id, aid!),
);
