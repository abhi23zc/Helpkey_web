import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { readPayouts } from "@/lib/payouts/service";
import {
  settlementResponse,
  settlementStatement,
} from "@/lib/payouts/statement";

export const GET = withApiHandler(
  async (
    request: Request,
    context: { params: Promise<{ payoutId: string }> },
  ) => {
    const view = await readPayouts(
      actorFromRequest().uid,
      new URL(request.url).searchParams.get("propertyId") ?? "",
      false,
      (await context.params).payoutId,
    );
    return settlementResponse(settlementStatement(view.payouts[0]));
  },
  {
    route: "/api/admin/payouts/[payoutId]/statement",
    auth: "strict",
    requireAuth: true,
    cache: "private",
  },
);
