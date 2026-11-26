import { amendmentRoute } from "@/lib/booking/amendments/route";
import { quoteAmendment } from "@/lib/booking/amendments/service";
export const POST = amendmentRoute(
  "/api/bookings/[bookingId]/amendments/quote",
  true,
  async (uid, id, request) => quoteAmendment(uid, id, await request.json()),
);
