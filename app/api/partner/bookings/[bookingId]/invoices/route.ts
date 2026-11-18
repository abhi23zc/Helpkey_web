import { reservationHandler } from "@/lib/partner/reservations/handler";
import { reviewInvoice, issueDocument } from "@/lib/partner/invoices/service";
type Context = { params: Promise<{ bookingId: string }> };
const path = "/api/partner/bookings/[bookingId]/invoices";
export const GET = reservationHandler(path, false, async (_, c: Context, uid) =>
  Response.json(await reviewInvoice(uid, (await c.params).bookingId)),
);
export const POST = reservationHandler(path, true, async (r, c: Context, uid) =>
  Response.json(
    await issueDocument(
      uid,
      (await c.params).bookingId,
      await r.json(),
      r.headers.get("idempotency-key") || "",
    ),
  ),
);
