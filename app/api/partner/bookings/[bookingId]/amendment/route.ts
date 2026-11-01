import { reservationHandler } from "@/lib/partner/reservations/handler";
import {
  confirmAmendment,
  previewAmendment,
} from "@/lib/partner/reservations/amendments";
type Context = { params: Promise<{ bookingId: string }> };
export const POST = reservationHandler(
  "/api/partner/bookings/[bookingId]/amendment",
  true,
  async (request, context: Context, uid) => {
    return Response.json(
      await previewAmendment(
        uid,
        (await context.params).bookingId,
        await request.json(),
      ),
    );
  },
);
export const PATCH = reservationHandler(
  "/api/partner/bookings/[bookingId]/amendment",
  true,
  async (request, context: Context, uid) => {
    return Response.json(
      await confirmAmendment(
        uid,
        (await context.params).bookingId,
        await request.json(),
        request.headers.get("idempotency-key") || "",
      ),
    );
  },
);
