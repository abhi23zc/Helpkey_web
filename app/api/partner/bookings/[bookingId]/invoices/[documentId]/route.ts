import { reservationHandler } from "@/lib/partner/reservations/handler";
import { readDocument } from "@/lib/partner/invoices/service";
type Context = { params: Promise<{ bookingId: string; documentId: string }> };
export const GET = reservationHandler(
  "/api/partner/bookings/[bookingId]/invoices/[documentId]",
  false,
  async (_, c: Context, uid) => {
    const p = await c.params;
    return Response.json(await readDocument(uid, p.bookingId, p.documentId));
  },
);
