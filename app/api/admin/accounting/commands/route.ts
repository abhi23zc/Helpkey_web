import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { accountingCommand } from "@/lib/accounting/service";
export const POST = withApiHandler(async (request: Request) => Response.json(await accountingCommand(actorFromRequest().uid, new URL(request.url).searchParams.get("propertyId") ?? "", await request.json())),
  { route: "/api/admin/accounting/commands", auth: "strict", requireAuth: true, cache: "private" });
