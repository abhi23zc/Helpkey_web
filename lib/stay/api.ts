import { ApiException } from "@/lib/api/errors";
import { ZodError } from "zod";
export function stayError(error: unknown) {
  if (error instanceof ApiException) throw error;
  const code =
    error instanceof Error
      ? error.message
      : "Unable to save. Please try again.";
  const status =
    code === "CONFLICT"
      ? 409
      : code === "NOT_FOUND"
        ? 404
        : code === "FORBIDDEN"
          ? 403
          : 422;
  return Response.json(
    {
      error:
        error instanceof ZodError
          ? (error.issues[0]?.message ?? "Check your entries.")
          : code === "CONFLICT"
            ? "This information changed. Refresh and review before saving again."
            : code,
      code,
    },
    { status },
  );
}
