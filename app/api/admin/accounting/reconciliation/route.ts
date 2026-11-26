import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { reconcileAccount } from "@/lib/accounting/service";
export const GET = withApiHandler(async (request: Request) => Response.json(await reconcileAccount(actorFromRequest().uid, new URL(request.url).searchParams.get("propertyId") ?? "")),
  { route: "/api/admin/accounting/reconciliation", auth: "strict", requireAuth: true, cache: "private" });
