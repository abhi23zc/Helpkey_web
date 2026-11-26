import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { payoutCommand } from "@/lib/payouts/service";
export const POST = withApiHandler(async (request: Request) => Response.json(await payoutCommand(actorFromRequest().uid, new URL(request.url).searchParams.get("propertyId") ?? "", await request.json())),
  { route: "/api/admin/payouts/commands", auth: "strict", requireAuth: true, cache: "private" });
