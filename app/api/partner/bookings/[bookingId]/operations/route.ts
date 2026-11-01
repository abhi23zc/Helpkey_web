import { reservationHandler } from "@/lib/partner/reservations/handler";
import {
  bookingOperations,
  performOperation,
} from "@/lib/partner/reservations/operations";
type Context = { params: Promise<{ bookingId: string }> };
export const GET = reservationHandler(
  "/api/partner/bookings/[bookingId]/operations",
  false,
  async (request, context: Context, uid) => {
    return Response.json(
      await bookingOperations(
        uid,
        (await context.params).bookingId,
        new URL(request.url).searchParams.get("before") || undefined,
      ),
    );
  },
);
export const POST = reservationHandler(
  "/api/partner/bookings/[bookingId]/operations",
  true,
  async (request, context: Context, uid) => {
    return Response.json(
      await performOperation(
        uid,
        (await context.params).bookingId,
        await request.json(),
        request.headers.get("idempotency-key") || "",
      ),
    );
  },
);
