import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { serviceCommand } from "@/lib/booking-finance/service-commands";
export const POST = withApiHandler(
  async (request: Request) =>
    Response.json(
      await serviceCommand(
        actorFromRequest().uid,
        new URL(request.url).searchParams.get("propertyId") ?? "",
        await request.json(),
      ),
    ),
  {
    route: "/api/admin/accounting/services",
    auth: "strict",
    requireAuth: true,
    cache: "private",
  },
);
