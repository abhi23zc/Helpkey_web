import "server-only";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { ApiException } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { withApiHandler } from "@/lib/api/handler";
import { ZodError } from "zod";
type Context = { params: Promise<{ bookingId: string; amendmentId?: string }> };
export function amendmentRoute(
  path: string,
  write: boolean,
  action: (
    uid: string,
    bookingId: string,
    request: Request,
    amendmentId?: string,
  ) => Promise<unknown>,
) {
  return withApiHandler(
    async (request: Request, context: Context) => {
      const user = await getAuthenticatedUser();
      if (!user) throw new ApiException("UNAUTHENTICATED", 401);
      if (write)
        await enforceRateLimit({
          bucket: "booking-amendment",
          identifier: user.uid,
          limit: 30,
          windowSeconds: 300,
          failClosed: true,
        });
      const { bookingId, amendmentId } = await context.params;
      try {
        return Response.json(
          await action(user.uid, bookingId, request, amendmentId),
        );
      } catch (error) {
        if (
          error instanceof ApiException ||
          error instanceof ZodError ||
          error instanceof SyntaxError
        )
          throw error;
        const code = error instanceof Error ? error.message : "";
        if (/^[A-Z][A-Z_]+$/.test(code))
          throw new ApiException(
            code,
            409,
            code.replaceAll("_", " ").toLowerCase(),
          );
        throw error;
      }
    },
    {
      route: path,
      auth: write ? "strict" : "read",
      requireAuth: true,
      cache: "private",
      bodyLimitBytes: 32768,
    },
  );
}
