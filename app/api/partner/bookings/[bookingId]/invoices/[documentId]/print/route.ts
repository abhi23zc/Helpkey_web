import { reservationHandler } from "@/lib/partner/reservations/handler";
import { readDocument } from "@/lib/partner/invoices/service";
import { printDocument } from "@/lib/partner/invoices/print";
type Context = { params: Promise<{ bookingId: string; documentId: string }> };
export const GET = reservationHandler(
  "/api/partner/bookings/[bookingId]/invoices/[documentId]/print",
  false,
  async (_, c: Context, uid) => {
    const p = await c.params;
    return new Response(
      printDocument(await readDocument(uid, p.bookingId, p.documentId)),
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  },
);
