import { amendmentRoute } from "@/lib/booking/amendments/route";
import { createAmendment } from "@/lib/booking/amendments/service";
export const POST = amendmentRoute(
  "/api/bookings/[bookingId]/amendments",
  true,
  async (uid, id, request) => ({
    amendment: await createAmendment(
      uid,
      id,
      await request.json(),
      request.headers.get("idempotency-key") ?? "",
    ),
  }),
);
