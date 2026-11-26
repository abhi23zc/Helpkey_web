import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { readPayouts } from "@/lib/payouts/service";
export const GET = withApiHandler(async (request: Request, context: { params: Promise<{ payoutId: string }> }) => Response.json(await readPayouts(actorFromRequest().uid, new URL(request.url).searchParams.get("propertyId") ?? "", false, (await context.params).payoutId)),
  { route: "/api/admin/payouts/[payoutId]", auth: "strict", requireAuth: true, cache: "private" });
