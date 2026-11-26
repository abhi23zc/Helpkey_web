import { amendmentRoute } from "@/lib/booking/amendments/route";
import { patchGuests } from "@/lib/booking/amendments/service";
export const PATCH = amendmentRoute(
  "/api/bookings/[bookingId]/guest-details",
  true,
  async (uid, id, request) => patchGuests(uid, id, await request.json()),
);
