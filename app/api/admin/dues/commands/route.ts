import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { duesCommand } from "@/lib/dues/service";
export const POST = withApiHandler(
  async (request: Request) =>
    Response.json(
      await duesCommand(
        actorFromRequest().uid,
        new URL(request.url).searchParams.get("propertyId") ?? "",
        await request.json(),
      ),
    ),
  {
    route: "/api/admin/dues/commands",
    auth: "strict",
    requireAuth: true,
    cache: "private",
  },
);
