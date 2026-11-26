import { withApiHandler, actorFromRequest } from "@/lib/api/handler";
import { financeHistory } from "@/lib/finance-settings/service";
type Context = { params: Promise<{ propertyId: string }> };
export const GET = withApiHandler(async (request, c: Context) => Response.json(await financeHistory(actorFromRequest().uid, (await c.params).propertyId, new URL(request.url).searchParams.get("cursor"))), { route: "/api/admin/properties/[propertyId]/finance-settings/history", auth: "strict", requireAuth: true, cache: "private" });
