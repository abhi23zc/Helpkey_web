import { ZodError } from "zod";

export function rateOwnerError(error: unknown) {
  if (error instanceof ZodError) {
    const field = String(error.issues[0]?.path[0] ?? "");
    const messages: Record<string, string> = {
      name: "Enter a price option name with 2–140 characters.",
      basePricePaise: "Enter a room price greater than ₹0, with up to two decimal places.",
      durationPrices: "Add unique durations from 1–24 hours, each with a total price greater than ₹0.",
      cancellationPolicyId: "Choose a cancellation policy.",
      taxBasisPoints: "Enter a tax percentage from 0 to 100.",
      customerFeePaise: "Enter an additional charge of ₹0 or more.",
      depositBasisPoints: "Enter a payment percentage from 0 to 100.",
    };
    return messages[field] ?? "Check the price option details and stay rules, then try again.";
  }
  const messages: Record<string, string> = {
    STAY_TYPE_FIXED: "The type of stay cannot be changed. Create another price option for a different stay type.",
    INVALID_POLICY: "Choose a cancellation policy belonging to this property.",
    INVALID_ROOM_TYPE: "Choose a room belonging to this property.",
    INVALID_ARRIVAL_WINDOW: "The latest check-in time must be after the earliest check-in time.",
    MAXIMUM_NIGHTS_TOO_LOW: "Maximum nights must be at least the minimum nights.",
    MAXIMUM_DURATION_TOO_LOW: "Maximum stay duration must be at least the minimum duration.",
    RATE_PLAN_NOT_FOUND: "This price option is no longer available. Refresh and try again.",
    RATE_PLAN_ARCHIVED: "This price option has been archived. Create another price option.",
    FORBIDDEN: "You do not have permission to change prices for this property.",
  };
  return messages[error instanceof Error ? error.message : ""] ?? "Could not save the price option. Your changes are still here; please try again.";
}
