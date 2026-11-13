import { reservationHandler } from "@/lib/partner/reservations/handler";
import { setupStatus, updatePms } from "@/lib/partner/pms/setup";
type Context = { params: Promise<{ propertyId: string }> };
const route = "/api/partner/properties/[propertyId]/pms";
export const GET = reservationHandler<Context>(
  route,
  false,
  async (_r, c, uid) =>
    Response.json(await setupStatus(uid, (await c.params).propertyId)),
);
export const POST = reservationHandler<Context>(
  route,
  true,
  async (r, c, uid) =>
    Response.json(
      await updatePms(uid, (await c.params).propertyId, await r.json()),
    ),
);
