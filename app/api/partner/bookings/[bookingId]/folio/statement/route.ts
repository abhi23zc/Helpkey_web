import { reservationHandler } from "@/lib/partner/reservations/handler";
import { ApiException } from "@/lib/api/errors";
import { readFolio } from "@/lib/partner/billing/service";
type Context = { params: Promise<{ bookingId: string }> };
export const GET = reservationHandler(
  "/api/partner/bookings/[bookingId]/folio/statement",
  false,
  async (request, context: Context, uid) => {
    const raw = new URL(request.url).searchParams.get("revision");
    if (
      raw === null ||
      !/^\d+$/.test(raw) ||
      !Number.isSafeInteger(Number(raw))
    )
      throw new ApiException("REVISION_REQUIRED", 422);
    return Response.json(
      await readFolio(
        uid,
        (await context.params).bookingId,
        undefined,
        Number(raw),
        new URL(request.url).searchParams.get("version") || undefined,
      ),
    );
  },
);
