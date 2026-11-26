import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { accountingHotels, readAccount } from "@/lib/accounting/service";
export const GET = withApiHandler(
  async (request: Request) => {
    const params = new URL(request.url).searchParams,
      propertyId = params.get("propertyId"),
      uid = actorFromRequest().uid;
    return Response.json(
      propertyId
        ? await readAccount(
            uid,
            propertyId,
            false,
            params.get("after"),
            params.get("paymentsAfter"),
          )
        : await accountingHotels(uid, params.get("after")),
    );
  },
  {
    route: "/api/admin/accounting",
    auth: "strict",
    requireAuth: true,
    cache: "private",
  },
);
