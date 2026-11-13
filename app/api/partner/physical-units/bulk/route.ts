import { reservationHandler } from "@/lib/partner/reservations/handler";
import { bulkUnits } from "@/lib/partner/reservations/bulk-units";

export const POST = reservationHandler(
  "/api/partner/physical-units/bulk",
  true,
  async (request, _context, uid) =>
    Response.json(await bulkUnits(uid, await request.json())),
);
