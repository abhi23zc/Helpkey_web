import { describe, expect, it } from "vitest";
import {
  csvCell,
  matchesView,
  netBalance,
  receiptRemaining,
  reservationFilters,
} from "@/lib/partner/reservations/domain";
import { financialSeries } from "@/lib/partner/dashboard/domain";
const booking = {
  bookingStatus: "confirmed",
  checkIn: "2026-10-31",
  checkOut: "2026-11-01",
  startAt: "2026-10-31T08:30:00Z",
  totalPaise: 10000,
  paidPaise: 3000,
  refundedPaise: 1000,
};
describe("reservation operations rules", () => {
  it("separates overdue arrivals from a recorded no-show", () => {
    expect(
      matchesView(
        booking,
        "overdue",
        "2026-10-31",
        "Asia/Kolkata",
        Date.parse("2026-10-31T09:00Z"),
      ),
    ).toBe(true);
    expect(
      matchesView(
        booking,
        "no_show",
        "2026-10-31",
        "Asia/Kolkata",
        Date.parse("2026-10-31T09:00Z"),
      ),
    ).toBe(false);
    expect(
      matchesView(
        { ...booking, bookingStatus: "no_show" },
        "overdue",
        "2026-10-31",
        "Asia/Kolkata",
        Date.now(),
      ),
    ).toBe(false);
  });
  it("does not treat guest notes as unresolved service requests", () => {
    expect(
      matchesView(
        { ...booking, specialRequest: "Late arrival" },
        "requests",
        "2026-10-31",
        "Asia/Kolkata",
        Date.now(),
      ),
    ).toBe(false);
    expect(
      matchesView(
        { ...booking, customizations: [{ status: "requested" }] },
        "requests",
        "2026-10-31",
        "Asia/Kolkata",
        Date.now(),
      ),
    ).toBe(true);
  });
  it("uses actual net payments without treating pending refunds as money already returned", () => {
    expect(netBalance({ ...booking, refundDuePaise: 500 })).toBe(8000);
    expect(receiptRemaining(3000, 500, 1000)).toBe(1500);
  });
  it("validates real dates and ordered ranges", () => {
    expect(
      reservationFilters.safeParse({ propertyId: "p", date: "2026-02-30" })
        .success,
    ).toBe(false);
    expect(
      reservationFilters.safeParse({
        propertyId: "p",
        scope: "range",
        from: "2026-11-01",
        to: "2026-10-31",
      }).success,
    ).toBe(false);
  });
  it("protects CSV cells from formulas while preserving quotes and line breaks", () => {
    expect(csvCell(" =HYPERLINK(1)")).toBe('"\' =HYPERLINK(1)"');
    expect(csvCell('A"B\nC')).toBe('"A""B\nC"');
    expect(csvCell("+919876543210")).toBe('"\'+919876543210"');
  });
  it("reports property receipts, reversals and refunds without double-counting legacy payments", () => {
    const buckets = [
      {
        key: "2026-10-31",
        label: "31 Oct",
        start: "2026-10-31",
        end: "2026-10-31",
      },
    ];
    const point = financialSeries(
      buckets,
      [
        {
          ...booking,
          id: "b",
          paidPaise: 5000,
          propertyLedgerPaise: 3000,
          paidAt: "2026-10-31T09:00Z",
          originalPropertyPaidAt: "2026-10-31T08:00Z",
        },
      ],
      [],
      [],
      "Asia/Kolkata",
      [
        {
          type: "collection",
          amountPaise: 4000,
          createdAt: "2026-10-31T09:00Z",
        },
        { type: "reversal", amountPaise: 1000, createdAt: "2026-10-31T09:01Z" },
        { type: "refund", amountPaise: 500, createdAt: "2026-10-31T09:02Z" },
      ],
    )[0];
    expect(point).toMatchObject({
      paidPaise: 5000,
      refundedPaise: 500,
      netPaise: 4500,
      propertyCollectedPaise: 3000,
    });
  });
});
