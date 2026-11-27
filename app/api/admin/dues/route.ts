import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { duesHotels, readDues } from "@/lib/dues/service";
export const GET = withApiHandler(
  async (request: Request) => {
    const params = new URL(request.url).searchParams,
      propertyId = params.get("propertyId"),
      uid = actorFromRequest().uid;
    return Response.json(
      propertyId
        ? await readDues(uid, propertyId, false, null, params.get("reportsAfter"))
        : await duesHotels(uid, params.get("after")),
    );
  },
  {
    route: "/api/admin/dues",
    auth: "strict",
    requireAuth: true,
    cache: "private",
  },
);
