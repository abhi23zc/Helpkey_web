import { amendmentRoute } from "@/lib/booking/amendments/route";
import { editOptions } from "@/lib/booking/amendments/service";
export const GET = amendmentRoute(
  "/api/bookings/[bookingId]/edit-options",
  false,
  (uid, id) => editOptions(uid, id),
);
