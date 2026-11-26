import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { payoutHotels, readPayouts } from "@/lib/payouts/service";
export const GET = withApiHandler(async (request: Request) => {
  const params = new URL(request.url).searchParams, propertyId = params.get("propertyId"), uid = actorFromRequest().uid;
  return Response.json(propertyId ? await readPayouts(uid, propertyId) : await payoutHotels(uid, params.get("after")));
}, { route: "/api/admin/payouts", auth: "strict", requireAuth: true, cache: "private" });
