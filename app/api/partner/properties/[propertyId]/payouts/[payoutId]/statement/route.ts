import { reservationHandler } from "@/lib/partner/reservations/handler";
import { readPayouts } from "@/lib/payouts/service";
import {
  settlementResponse,
  settlementStatement,
} from "@/lib/payouts/statement";

export const GET = reservationHandler(
  "/api/partner/properties/[propertyId]/payouts/[payoutId]/statement",
  false,
  async (
    _request: Request,
    context: { params: Promise<{ propertyId: string; payoutId: string }> },
    uid,
  ) => {
    const p = await context.params;
    const view = await readPayouts(uid, p.propertyId, true, p.payoutId);
    return settlementResponse(settlementStatement(view.payouts[0]));
  },
);
