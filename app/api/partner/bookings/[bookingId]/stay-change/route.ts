import { reservationHandler } from "@/lib/partner/reservations/handler";
import {
  previewStayChange,
  confirmStayChange,
  stayChangeChoices,
} from "@/lib/partner/reservations/stay-changes";
type Context = { params: Promise<{ bookingId: string }> };
export const POST = reservationHandler(
  "/api/partner/bookings/[bookingId]/stay-change",
  true,
  async (request, context: Context, uid) =>
    Response.json(
      await previewStayChange(
        uid,
        (await context.params).bookingId,
        await request.json(),
      ),
    ),
);
export const PATCH = reservationHandler(
  "/api/partner/bookings/[bookingId]/stay-change",
  true,
  async (request, context: Context, uid) =>
    Response.json(
      await confirmStayChange(
        uid,
        (await context.params).bookingId,
        await request.json(),
        request.headers.get("idempotency-key") || "",
      ),
    ),
);

export const GET = reservationHandler(
  "/api/partner/bookings/[bookingId]/stay-change",
  false,
  async (_request, context: Context, uid) =>
    Response.json(
      await stayChangeChoices(uid, (await context.params).bookingId),
    ),
);
