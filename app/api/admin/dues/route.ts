import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { accountingHotels } from "@/lib/accounting/service";
import { readDues } from "@/lib/dues/service";
export const GET = withApiHandler(
  async (request: Request) => {
    const params = new URL(request.url).searchParams,
      propertyId = params.get("propertyId"),
      uid = actorFromRequest().uid;
    return Response.json(
      propertyId
        ? await readDues(uid, propertyId)
        : await accountingHotels(uid, params.get("after")),
    );
  },
  {
    route: "/api/admin/dues",
    auth: "strict",
    requireAuth: true,
    cache: "private",
  },
);
