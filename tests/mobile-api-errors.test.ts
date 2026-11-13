import { describe, expect, it } from "vitest";
import { z } from "zod";
import { bookingFailure } from "@/lib/booking/api-error";
import { legacyApiError } from "@/lib/api/legacy-error";

describe("mobile and legacy booking error contracts", () => {
  it.each(["QUOTE_CHANGED", "IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_IN_PROGRESS", "PAYMENT_NOT_EXPECTED", "PROPERTY_NOT_AVAILABLE", "ROOM_NOT_AVAILABLE", "RATE_NOT_AVAILABLE", "BOOKING_NOT_CANCELLABLE"])("preserves %s and the legacy sentence", (code) => {
    const response = bookingFailure(new Error(code), "Existing customer sentence.");
    expect(response).toEqual({ error: "Existing customer sentence.", code });
    expect(legacyApiError(response, 422)).toMatchObject({ code, message: response.error });
  });
  it("does not expose an infrastructure error as a code", () => {
    const result = bookingFailure(new Error("private database details"), "Unable to process this booking. Please try again.");
    expect(result.code).toBe("BOOKING_FAILED");
    expect(JSON.stringify(result)).not.toContain("private database");
  });
  it("adds indexed field errors while preserving legacy validation copy", () => {
    const result = z.object({ leadEmail: z.email(), adultGuestNames: z.array(z.string().min(2)) }).safeParse({ leadEmail: "bad", adultGuestNames: [""] });
    if (result.success) throw new Error("Expected invalid fixture");
    const payload = bookingFailure(result.error, "Please check leadEmail and try again.");
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.fieldErrors).toHaveProperty("leadEmail");
    expect(payload.fieldErrors).toHaveProperty("adultGuestNames.0");
    expect(legacyApiError(payload, 422).fieldErrors).toEqual(payload.fieldErrors);
  });
  it("keeps old string-only responses compatible", () => {
    expect(legacyApiError({ error: "UNAUTHENTICATED" }, 401)).toEqual({ code: "UNAUTHENTICATED", message: "UNAUTHENTICATED" });
    expect(legacyApiError({ error: "Existing sentence." }, 422)).toEqual({ code: "Existing sentence.", message: "Existing sentence." });
  });
});
