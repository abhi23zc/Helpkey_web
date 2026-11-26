import { withApiHandler, actorFromRequest } from "@/lib/api/handler";
import { financeHistory } from "@/lib/finance-settings/service";
export const GET = withApiHandler(async (request) => Response.json(await financeHistory(actorFromRequest().uid, null, new URL(request.url).searchParams.get("cursor"))), { route: "/api/admin/finance-settings/history", auth: "strict", requireAuth: true, cache: "private" });
