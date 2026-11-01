import type { Range, RecordData } from "./domain";
import { operationMatches } from "./domain";
export type Grouping = Range | "auto";
export function reportingGrouping(
  from: string,
  to: string,
  choice: Grouping,
): Range {
  return choice === "auto"
    ? Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1 > 14
      ? "weekly"
      : "daily"
    : choice;
}
export function liveAttention(
  bookings: RecordData[],
  today: string,
  timezone: string,
  now: number,
) {
  const overdue = bookings.filter((b) =>
    operationMatches(b, "overdue", today, timezone, now),
  );
  const overdueDepartures = bookings.filter((b) =>
    operationMatches(b, "overdue_departures", today, timezone, now),
  );
  const requests = bookings.filter(
    (b) =>
      operationMatches(b, "requests", today, timezone, now) &&
      (b.customizations ?? []).some(
        (r: RecordData) =>
          ["requested", "confirmed", "preparing", "ready"].includes(r.status) &&
          !["awaiting_customer", "awaiting_payment"].includes(
            r.settlement ?? "",
          ),
      ),
  );
  return {
    overdue,
    overdueDepartures,
    requests,
    uniqueReservationCount: new Set(
      [...overdue, ...overdueDepartures, ...requests].map((b) => b.id),
    ).size,
  };
}
export const hasFinancialActivity = (
  series: { bookedPaise: number; paidPaise: number; refundedPaise: number }[],
) =>
  series.some(
    (p) => p.bookedPaise !== 0 || p.paidPaise !== 0 || p.refundedPaise !== 0,
  );
export function chartLabelIndices(count: number, width: number) {
  if (count < 1) return new Set<number>();
  const limit = Math.max(2, Math.min(8, Math.floor(width / 75)));
  return new Set(
    Array.from({ length: Math.min(count, limit) }, (_, i) =>
      Math.round((i * (count - 1)) / Math.max(1, Math.min(count, limit) - 1)),
    ),
  );
}
