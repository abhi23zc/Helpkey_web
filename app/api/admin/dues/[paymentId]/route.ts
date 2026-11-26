import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { readDues } from "@/lib/dues/service";
export const GET = withApiHandler(
  async (
    request: Request,
    context: { params: Promise<{ paymentId: string }> },
  ) =>
    Response.json(
      await readDues(
        actorFromRequest().uid,
        new URL(request.url).searchParams.get("propertyId") ?? "",
        false,
        (await context.params).paymentId,
      ),
    ),
  {
    route: "/api/admin/dues/[paymentId]",
    auth: "strict",
    requireAuth: true,
    cache: "private",
  },
);
