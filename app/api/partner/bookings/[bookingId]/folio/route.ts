import { reservationHandler } from "@/lib/partner/reservations/handler";
import { readFolio, commandFolio } from "@/lib/partner/billing/service";
type Context = { params: Promise<{ bookingId: string }> };
export const GET = reservationHandler(
  "/api/partner/bookings/[bookingId]/folio",
  false,
  async (request, context: Context, uid) =>
    Response.json(
      await readFolio(
        uid,
        (await context.params).bookingId,
        new URL(request.url).searchParams.get("before") || undefined,
      ),
    ),
);
export const POST = reservationHandler(
  "/api/partner/bookings/[bookingId]/folio",
  true,
  async (request, context: Context, uid) =>
    Response.json(
      await commandFolio(
        uid,
        (await context.params).bookingId,
        await request.json(),
        request.headers.get("idempotency-key") || "",
      ),
    ),
);
