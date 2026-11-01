import { createManualReservation } from "@/lib/bookings";
import { reservationHandler } from "@/lib/partner/reservations/handler";
import { listReservations } from "@/lib/partner/reservations/list";
export const GET = reservationHandler(
  "/api/partner/bookings",
  false,
  async (request, _context, uid) => {
    return Response.json(
      await listReservations(
        uid,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  },
);
export const POST = reservationHandler(
  "/api/partner/bookings",
  true,
  async (request, _context, uid) => {
    const raw = await request.json();
    const result = await createManualReservation(
      uid,
      raw,
      request.headers.get("idempotency-key") ?? JSON.stringify(raw),
    );
    return Response.json(
      { bookingId: result.id, confirmationCode: result.confirmationCode },
      { status: 201 },
    );
  },
);
