import { ZodError } from "zod";

export class ApiException extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message = code,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiException";
  }
}

export function toApiException(error: unknown): ApiException {
  if (error instanceof ApiException) return error;
  if (error instanceof ZodError) {
    return new ApiException("VALIDATION_ERROR", 422, "The request is invalid.", error.flatten().fieldErrors as Record<string, string[]>);
  }
  if (error instanceof SyntaxError) return new ApiException("INVALID_JSON", 400, "The request body is not valid JSON.");
  return new ApiException("INTERNAL_ERROR", 500, "The service could not complete the request.");
}
