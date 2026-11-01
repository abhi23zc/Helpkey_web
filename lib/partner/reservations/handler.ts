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
