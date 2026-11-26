import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import {
  readReadiness,
  readinessCommand,
} from "@/lib/payout-readiness/service";
type Context = { params: Promise<{ propertyId: string }> };
export const GET = withApiHandler(
  async (_request: Request, context: Context) =>
    Response.json(
      await readReadiness(
        actorFromRequest().uid,
        (await context.params).propertyId,
        false,
      ),
    ),
  {
    route: "/api/admin/properties/[propertyId]/payout-readiness",
    auth: "strict",
    requireAuth: true,
    cache: "none",
  },
);
export const POST = withApiHandler(
  async (request: Request, context: Context) =>
    Response.json(
      await readinessCommand(
        actorFromRequest().uid,
        (await context.params).propertyId,
        await request.json(),
        false,
      ),
    ),
  {
    route: "/api/admin/properties/[propertyId]/payout-readiness",
    auth: "strict",
    requireAuth: true,
    cache: "none",
  },
);
