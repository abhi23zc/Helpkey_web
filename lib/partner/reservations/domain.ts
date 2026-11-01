import { z } from "zod";
import { validDate, resolveLocal } from "@/lib/booking/domain";
import {
  actionableRequest,
  bookingStart,
  bookingEnd,
  type RecordData,
} from "@/lib/partner/dashboard/domain";

const day = z.string().refine(validDate, "Invalid date");
export const views = [
  "all",
  "arrivals",
  "departures",
  "in_house",
  "requests",
  "overdue",
  "overdue_departures",
  "upcoming",
  "pending_payment",
  "cancelled",
  "no_show",
  "balances",
] as const;
export const reservationFilters = z
  .object({
    propertyId: z.string().min(1).max(180),
    date: day.optional(),
    scope: z.enum(["day", "all", "range"]).default("day"),
    dateBasis: z.enum(["stay", "arrival", "departure"]).default("stay"),
    from: day.optional(),
    to: day.optional(),
    view: z.enum(views).default("all"),
    status: z
      .enum([
        "all",
        "pending_payment",
        "confirmed",
        "checked_in",
        "checked_out",
        "cancelled",
        "no_show",
        "expired",
        "payment_failed",
      ])
      .default("all"),
    roomTypeId: z.string().max(180).default(""),
    paymentStatus: z
      .enum([
        "all",
        "pending",
        "partially_paid",
        "paid",
        "pay_at_property",
        "paid_at_property",
        "failed",
        "refund_pending",
        "partially_refunded",
        "refunded",
      ])
      .default("all"),
    bookingMode: z.enum(["all", "hourly", "overnight"]).default("all"),
    q: z.string().trim().max(180).default(""),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().max(2048).optional(),
  })
  .refine(
    (f) => f.scope !== "range" || !!(f.from && f.to && f.from <= f.to),
    "Choose a valid date range",
  );
export type Filters = z.infer<typeof reservationFilters>;
export const operationInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("note"),
    text: z.string().trim().min(1).max(2000),
  }),
  z.object({
    action: z.literal("assign"),
    unitId: z.string().max(180).nullable(),
    revision: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal("collect"),
    amountPaise: z.number().int().positive().max(100_000_000),
    method: z.enum(["cash", "upi", "card_terminal"]),
    reference: z.string().trim().max(180).default(""),
    reason: z.string().trim().max(500).default(""),
  }),
  z.object({
    action: z.literal("reverse"),
    receiptId: z.string().min(1).max(180),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({
    action: z.literal("refund"),
    receiptId: z.string().min(1).max(180),
    amountPaise: z.number().int().positive().max(100_000_000),
    reason: z.string().trim().min(3).max(500),
    reference: z.string().trim().max(180).default(""),
  }),
]);
export function matchesView(
  b: RecordData,
  view: string,
  date: string,
  timezone: string,
  now: number,
) {
  const live = ["confirmed", "checked_in"].includes(b.bookingStatus);
  switch (view) {
    case "arrivals":
      return (
        b.checkIn === date &&
        ["confirmed", "checked_in", "checked_out", "completed"].includes(
          b.bookingStatus,
        )
      );
    case "departures":
      return (
        b.checkOut === date &&
        ["confirmed", "checked_in", "checked_out", "completed"].includes(
          b.bookingStatus,
        )
      );
    case "in_house":
      return (
        b.bookingStatus === "checked_in" &&
        b.checkIn <= date &&
        b.checkOut >= date
      );
    case "requests":
      return actionableRequest(b);
    case "overdue":
      return b.bookingStatus === "confirmed" && bookingStart(b, timezone) < now;
    case "overdue_departures":
      return b.bookingStatus === "checked_in" && bookingEnd(b, timezone) < now;
    case "upcoming":
      return (
        live &&
        bookingStart(b, timezone) >
          Math.max(now, resolveLocal(date, "00:00", timezone))
      );
    case "balances":
      return (
        live &&
        Math.max(
          0,
          (b.totalPaise ?? 0) -
            (b.customizationCreditPaise ?? 0) -
            ((b.paidPaise ?? 0) -
              (b.refundedPaise ?? 0) -
              (b.refundDuePaise ?? 0)),
        ) > 0
      );
    case "all":
      return true;
    default:
      return b.bookingStatus === view;
  }
}
export const csvCell = (value: unknown) => {
  const text = String(value ?? "");
  return `"${(/^[\s]*[=+\-@\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
};
export function netBalance(b: RecordData) {
  return Math.max(
    0,
    (b.totalPaise ?? 0) -
      (b.customizationCreditPaise ?? 0) -
      ((b.paidPaise ?? 0) - (b.refundedPaise ?? 0)),
  );
}
export function receiptRemaining(
  amount: number,
  refunds: number,
  reversals: number,
) {
  return Math.max(0, amount - refunds - reversals);
}
