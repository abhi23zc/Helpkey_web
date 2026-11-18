import type { RecordData } from "@/lib/partner/dashboard/domain";
import { netBalance } from "./domain";

export type ActionRestriction = {
  code: string;
  status: number;
  message: string;
};

/** Shared availability gates; amount/reference and chosen-rate validation remain request-specific. */
export function collectionRestriction(b: RecordData): ActionRestriction | null {
  if (
    !["confirmed", "checked_in", "checked_out", "completed"].includes(
      b.bookingStatus,
    )
  )
    return {
      code: "COLLECTION_NOT_ALLOWED",
      status: 409,
      message:
        "This reservation cannot accept collection in its current state.",
    };
  if ((b.refundDuePaise ?? 0) > 0)
    return {
      code: "COLLECTION_NOT_ALLOWED",
      status: 409,
      message: "Resolve pending refunds before collecting more money.",
    };
  if (netBalance(b) <= 0)
    return {
      code: "OVERPAYMENT",
      status: 422,
      message: "There is no outstanding reservation balance to collect.",
    };
  return null;
}

export function assignmentRestriction(b: RecordData): ActionRestriction | null {
  if (b.bookingStatus === "checked_in") return { code: "USE_STAY_CHANGE", status: 409, message: "Use Move room or Change room category to preserve the in-house room history." };
  return b.bookingStatus !== "confirmed" || !b.startAt
    ? {
        code: "ASSIGNMENT_NOT_ALLOWED",
        status: 409,
        message:
          "Only active reservations with agreed stay times can be assigned.",
      }
    : null;
}

export function amendmentRestriction(
  b: RecordData,
  now: number,
): ActionRestriction | null {
  if (
    b.bookingStatus !== "confirmed" ||
    b.inventoryReleased ||
    b.inventoryEngine !== "interval_v1" ||
    !b.startAt ||
    !(Date.parse(b.startAt) > now)
  )
    return {
      code: "AMENDMENT_NOT_ALLOWED",
      status: 409,
      message:
        "Only future confirmed bookings on interval inventory can be changed.",
    };
  if (
    (b.customizations ?? []).length ||
    b.extrasTotalPaise ||
    b.customizationCreditPaise ||
    b.billingOpenCount ||
    b.couponId ||
    b.couponDiscountPaise ||
    b.refundDuePaise
  )
    return {
      code: "RESOLVE_AGREEMENTS_FIRST",
      status: 409,
      message:
        "Bookings with extras, discounts or pending refunds need those agreements resolved before dates or room type can change.",
    };
  return null;
}
