import { withApiHandler, actorFromRequest } from "@/lib/api/handler";
import { readFinance } from "@/lib/finance-settings/service";
type Context = { params: Promise<{ propertyId: string }> };
export const GET = withApiHandler(async (_request, c: Context) => Response.json(await readFinance(actorFromRequest().uid, (await c.params).propertyId, true)), { route: "/api/partner/properties/[propertyId]/finance-settings", auth: "strict", requireAuth: true, cache: "private" });
