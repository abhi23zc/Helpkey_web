import { withApiHandler, actorFromRequest } from "@/lib/api/handler";
import { readFinance, saveFinance } from "@/lib/finance-settings/service";
type Context = { params: Promise<{ propertyId: string }> };
const options = { route: "/api/admin/properties/[propertyId]/finance-settings", auth: "strict", requireAuth: true, cache: "private" } as const;
export const GET = withApiHandler(async (_request, c: Context) => Response.json(await readFinance(actorFromRequest().uid, (await c.params).propertyId)), options);
export const PATCH = withApiHandler(async (request, c: Context) => Response.json(await saveFinance(actorFromRequest().uid, (await c.params).propertyId, await request.json())), options);
