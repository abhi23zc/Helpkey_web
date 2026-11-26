import { reservationHandler } from "@/lib/partner/reservations/handler";
import { readAccount } from "@/lib/accounting/service";
export const GET = reservationHandler(
  "/api/partner/properties/[propertyId]/accounting",
  false,
  async (
    request: Request,
    context: { params: Promise<{ propertyId: string }> },
    uid,
  ) =>
    Response.json(
      await readAccount(
        uid,
        (await context.params).propertyId,
        true,
        new URL(request.url).searchParams.get("after"),
        new URL(request.url).searchParams.get("paymentsAfter"),
      ),
    ),
);
