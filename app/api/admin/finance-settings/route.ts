import { withApiHandler, actorFromRequest } from "@/lib/api/handler";
import { readFinance, saveFinance } from "@/lib/finance-settings/service";
const options = { route: "/api/admin/finance-settings", auth: "strict", requireAuth: true, cache: "private" } as const;
export const GET = withApiHandler(async () => Response.json(await readFinance(actorFromRequest().uid, null)), options);
export const PATCH = withApiHandler(async (request) => Response.json(await saveFinance(actorFromRequest().uid, null, await request.json())), options);
