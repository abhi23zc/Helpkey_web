import { reservationHandler } from "@/lib/partner/reservations/handler";
import { readPayouts } from "@/lib/payouts/service";
export const GET = reservationHandler("/api/partner/properties/[propertyId]/payouts", false,
  async (_request: Request, context: { params: Promise<{ propertyId: string }> }, uid) => Response.json(await readPayouts(uid, (await context.params).propertyId, true)));
