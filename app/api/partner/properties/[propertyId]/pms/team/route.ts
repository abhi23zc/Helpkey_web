import { reservationHandler } from "@/lib/partner/reservations/handler";
import { listTeam, manageTeam } from "@/lib/partner/pms/team";
type Context = { params: Promise<{ propertyId: string }> };
const route = "/api/partner/properties/[propertyId]/pms/team";
export const GET = reservationHandler<Context>(
  route,
  false,
  async (r, c, uid) =>
    Response.json(
      await listTeam(
        uid,
        (await c.params).propertyId,
        new URL(r.url).searchParams.get("before") || undefined,
      ),
    ),
);
export const POST = reservationHandler<Context>(
  route,
  true,
  async (r, c, uid) =>
    Response.json(
      await manageTeam(uid, (await c.params).propertyId, await r.json()),
    ),
);
