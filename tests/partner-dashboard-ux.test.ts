import { describe, it, expect } from "vitest";
import {
  reportingGrouping,
  liveAttention,
  hasFinancialActivity,
  chartLabelIndices,
} from "@/lib/partner/dashboard/ux";
import { shiftDay } from "@/lib/partner/date-range";
describe("dashboard UX data rules", () => {
  it("uses daily up to 14 days and weekly for longer ranges without overriding explicit choices", () => {
    for (const days of [1, 7, 14, 29, 31]) {
      const to = shiftDay("2026-11-01", days - 1);
      expect(reportingGrouping("2026-11-01", to, "auto")).toBe(
        days <= 14 ? "daily" : "weekly",
      );
      for (const value of ["daily", "weekly", "monthly"] as const)
        expect(reportingGrouping("2026-11-01", to, value)).toBe(value);
    }
  });
  it("keeps full financial activity including refund-only periods distinct from empty data", () => {
    expect(hasFinancialActivity([])).toBe(false);
    expect(
      hasFinancialActivity([
        { bookedPaise: 0, paidPaise: 0, refundedPaise: 0 },
      ]),
    ).toBe(false);
    expect(
      hasFinancialActivity([
        { bookedPaise: 0, paidPaise: 0, refundedPaise: 100 },
      ]),
    ).toBe(true);
  });
  it("limits labels by plot width and retains both endpoints without ellipses", () => {
    for (const count of [1, 7, 14, 29, 31])
      for (const width of [220, 560, 1100]) {
        const indices = chartLabelIndices(count, width);
        expect(indices.has(0)).toBe(true);
        expect(indices.has(count - 1)).toBe(true);
        expect(indices.size).toBeLessThanOrEqual(Math.min(count, 8));
      }
    expect(chartLabelIndices(31, 220).size).toBe(2);
  });
  it("deduplicates current reservations across alert categories and excludes guest/payment waiting", () => {
    const base = {
      bookingStatus: "confirmed",
      checkIn: "2026-10-31",
      checkOut: "2026-11-01",
      startAt: "2026-10-31T03:00Z",
    };
    const live = liveAttention(
      [
        { ...base, id: "both", customizations: [{ status: "requested" }] },
        {
          ...base,
          id: "waiting",
          startAt: "2026-10-31T20:00Z",
          customizations: [
            { status: "requested", settlement: "awaiting_payment" },
          ],
        },
        {
          ...base,
          id: "guest",
          startAt: "2026-10-31T20:00Z",
          customizations: [
            { status: "requested", settlement: "awaiting_customer" },
          ],
        },
        {
          ...base,
          id: "checkout",
          bookingStatus: "checked_in",
          endAt: "2026-10-31T03:00Z",
        },
      ],
      "2026-10-31",
      "Asia/Kolkata",
      Date.parse("2026-10-31T05:00Z"),
    );
    expect(live.uniqueReservationCount).toBe(2);
    expect(live.overdue).toHaveLength(1);
    expect(live.requests).toHaveLength(1);
    expect(live.overdueDepartures).toHaveLength(1);
  });
});
