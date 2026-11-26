import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { revealBank } from "@/lib/payout-readiness/service";
type Context = { params: Promise<{ propertyId: string }> };
export const POST = withApiHandler(
  async (request: Request, context: Context) =>
    Response.json(
      await revealBank(
        actorFromRequest().uid,
        (await context.params).propertyId,
        await request.json(),
        false,
      ),
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          Pragma: "no-cache",
        },
      },
    ),
  {
    route: "/api/admin/properties/[propertyId]/payout-readiness",
    auth: "strict",
    requireAuth: true,
    cache: "none",
  },
);
