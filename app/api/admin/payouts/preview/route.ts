import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { previewPayout } from "@/lib/payouts/service";

export const POST = withApiHandler(
  async (request: Request) =>
    Response.json(
      await previewPayout(
        actorFromRequest().uid,
        new URL(request.url).searchParams.get("propertyId") ?? "",
        await request.json(),
      ),
    ),
  {
    route: "/api/admin/payouts/preview",
    auth: "strict",
    requireAuth: true,
    cache: "private",
  },
);
