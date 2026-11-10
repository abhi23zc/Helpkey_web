import { ZodError } from "zod";

// Only documented customer-facing domain identifiers may become response metadata.
const codes = new Set([
  "SUBMISSION_CLOSED", "PAYMENT_ATTEMPT_ACTIVE", "IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_IN_PROGRESS", "QUOTE_CHANGED",
  "PAYMENT_ORDER_RECONCILIATION_REQUIRED", "PAYMENT_NOT_CAPTURED", "PAYMENT_REFUND_PENDING", "PAYMENT_MISMATCH",
  "DURATION_NOT_PRICED", "WHOLE_HOUR_DURATION_REQUIRED", "INVENTORY_CUTOVER_REQUIRED", "INVALID_LOCAL_TIME",
  "CHECK_IN_IN_PAST", "CHECK_OUT_MUST_FOLLOW_CHECK_IN", "PROPERTY_NOT_AVAILABLE", "ROOM_NOT_AVAILABLE", "RATE_NOT_AVAILABLE",
  "CHILDREN_NOT_ALLOWED", "ROOM_CAPACITY_EXCEEDED", "STAY_LENGTH_NOT_ALLOWED", "SOLD_OUT_FOR_DATES",
  "ADULT_GUEST_NAMES_REQUIRED", "ADULT_AADHAAR_REQUIRED", "TERMS_ACCEPTANCE_REQUIRED",
  "PAYMENT_METHOD_NOT_AVAILABLE", "ONLINE_PAYMENT_NOT_CONFIGURED", "PAYMENT_ORDER_CREATION_FAILED",
  "MINIMUM_ONLINE_PAYMENT_1_RUPEE", "BOOKING_REFERENCE_UNAVAILABLE", "BOOKING_NOT_FOUND", "BOOKING_NOT_CANCELLABLE",
  "PAYMENT_NOT_EXPECTED", "PAYMENT_SIGNATURE_INVALID", "FORBIDDEN", "BOOKING_NOT_ACTIVE",
]);

/** Add metadata without removing the legacy sentence consumed by deployed clients. */
export function bookingFailure(error: unknown, legacyMessage: string) {
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const path = issue.path.join(".");
      if (path) (fieldErrors[path] ??= []).push(issue.message);
    }
    return { error: legacyMessage, code: "VALIDATION_ERROR", fieldErrors };
  }
  const candidate = error instanceof Error ? error.message : "";
  return { error: legacyMessage, code: codes.has(candidate) ? candidate : "BOOKING_FAILED" };
}
