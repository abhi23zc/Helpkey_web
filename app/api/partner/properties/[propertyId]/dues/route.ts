import { reservationHandler } from "@/lib/partner/reservations/handler";
import { readDues } from "@/lib/dues/service";
export const GET = reservationHandler(
  "/api/partner/properties/[propertyId]/dues",
  false,
  async (
    _request: Request,
    context: { params: Promise<{ propertyId: string }> },
    uid,
  ) =>
    Response.json(await readDues(uid, (await context.params).propertyId, true)),
);
