import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { ApiException } from "@/lib/api/errors";
import { requireRole } from "@/lib/partner/service";
import { ZodError } from "zod";
export function reservationHandler<C>(
  route: string,
  write: boolean,
  handler: (request: Request, context: C, uid: string) => Promise<Response>,
) {
  return withApiHandler(
    async (request: Request, context: C) => {
      const uid = actorFromRequest().uid;
      try {
        await requireRole(uid, "partner");
        return await handler(request, context, uid);
      } catch (error) {
        if (
          error instanceof ApiException ||
          error instanceof ZodError ||
          error instanceof SyntaxError
        )
          throw error;
        const message = error instanceof Error ? error.message : "";
        if (message === "FORBIDDEN")
          throw new ApiException("FORBIDDEN", 403, "Property access required.");
        if (
          /requires an index|index.*(building|not ready|unavailable)/i.test(
            message,
          )
        ) {
          console.error(
            JSON.stringify({
              event: "partner.reservations.index_error",
              route,
              message,
            }),
          );
          throw new ApiException(
            "INDEX_UNAVAILABLE",
            503,
            "Reservations are temporarily unavailable. Please retry shortly.",
          );
        }
        const guidance: Record<string, string> = {
          QUOTE_CHANGED: "The hotel price or agreed times changed. Review the refreshed dates, departure and price before saving again.",
          AMBIGUOUS_LOCAL_TIME: "This hotel-local time occurs twice during a clock change. Choose an unambiguous time or contact support.",
          NONEXISTENT_LOCAL_TIME: "This hotel-local time does not exist during a clock change. Correct the arrival time.",
          WALK_IN_CURRENT_DATE_REQUIRED: "Walk-ins must arrive today in the hotel's timezone, at a time no later than now. Review the hotel date and recorded arrival.",
          EARLY_WALK_IN_DISABLED: "This hotel does not allow overnight walk-ins before standard check-in. Ask the owner to enable early walk-ins in Settings, wait until check-in, or choose an eligible hourly stay.",
          GUEST_COUNT_MISMATCH: "The staying guest names exceed the selected adult, child or infant count.",
          CHECK_IN_IN_PAST: "This future reservation starts before the allowed booking time. For a guest already arriving today, choose Guest arriving now.",
        };
        if (guidance[message]) throw new ApiException(message, 422, guidance[message]);
        if (/^[A-Z][A-Z_]+$/.test(message))
          throw new ApiException(
            message,
            422,
            message.toLowerCase().replaceAll("_", " "),
          );
        throw error;
      }
    },
    {
      route,
      auth: write ? "strict" : "read",
      requireAuth: true,
      cache: "private",
    },
  );
}
