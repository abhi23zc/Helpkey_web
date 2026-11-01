import { describe, expect, it } from "vitest";
import { actionableRequest, financialSeries, liveProperty, operationMatches, readiness, reportBuckets } from "@/lib/partner/dashboard/domain";
import { intervalReport } from "@/lib/booking/reporting";
const zone = "Asia/Kolkata";
const timestamp = (date: string) => `${date}T05:00:00Z`;
describe("partner dashboard reporting", () => {
  it("rejects impossible dates and clips partial week/month buckets", () => {
    expect(() => reportBuckets("2026-02-30", "daily")).toThrow();
    expect(reportBuckets("2026-10-31", "daily")).toHaveLength(7);
    expect(reportBuckets("2026-10-31", "weekly").at(-1)).toMatchObject({ start: "2026-10-26", end: "2026-10-31" });
    expect(reportBuckets("2026-10-15", "monthly").at(-1)).toMatchObject({ start: "2026-10-01", end: "2026-10-15" });
  });
  it("uses verified receipts once, including late capture and separate services, without adding booking paid totals twice", () => {
    const series = financialSeries(reportBuckets("2026-10-31", "daily"), [{ id: "a", bookingStatus: "confirmed", totalPaise: 10000, customizationCreditPaise: 1000, createdAt: timestamp("2026-10-31"), paidAt: timestamp("2026-10-31"), paidPaise: 4000 }], [
      { paymentId: "p", bookingId: "a", amountPaise: 4000, status: "captured", createdAt: timestamp("2026-10-31") },
      { paymentId: "p", bookingId: "a", amountPaise: 4000, status: "captured", createdAt: timestamp("2026-10-31") },
      { paymentId: "q", bookingId: "a", stayQuote: true, amountPaise: 2000, status: "captured", createdAt: timestamp("2026-10-31") },
      { paymentId: "late", bookingId: "b", amountPaise: 1000, status: "refund_pending", createdAt: timestamp("2026-10-31") },
    ], [{ status: "processed", amountPaise: 1000, processedAt: timestamp("2026-10-31") }, { status: "pending", amountPaise: 9000 }], zone);
    expect(series.at(-1)).toMatchObject({ bookedPaise: 9000, paidPaise: 7000, refundedPaise: 1000, netPaise: 6000, serviceCollectedPaise: 2000 });
  });
  it("attributes capture at property-local midnight and excludes undated legacy cash", () => {
    const series = financialSeries(reportBuckets("2026-11-01", "daily"), [{ id: "manual", paidPaise: 5000 }], [{ paymentId: "p", amountPaise: 100, status: "captured", createdAt: "2026-10-31T19:00:00Z" }], [], zone);
    expect(series.at(-1)?.paidPaise).toBe(100);
    expect(series.at(-2)?.paidPaise).toBe(0);
  });
  it("distinguishes recorded property collections and permits negative net collections", () => {
    const series = financialSeries(reportBuckets("2026-10-31", "daily"), [{ id: "m", paidPaise: 1000, paidAt: timestamp("2026-10-31"), paymentStatus: "paid_at_property" }], [], [{ status: "processed", processedAt: timestamp("2026-10-31"), amountPaise: 2000 }], zone);
    expect(series.at(-1)).toMatchObject({ paidPaise: 1000, propertyCollectedPaise: 1000, netPaise: -1000 });
  });
  it("requires approval, active state and bookability for public visibility", () => {
    expect(liveProperty({ status: "active", approvalStatus: "pending", isBookable: true })).toBe(false);
    expect(liveProperty({ status: "active", approvalStatus: "approved", isBookable: false })).toBe(false);
    expect(liveProperty({ status: "active", approvalStatus: "approved", isBookable: true })).toBe(true);
  });
  it("does not invent fixed completeness or count approval workflow state as a checklist requirement", () => {
    const result = readiness({ status: "active", approvalStatus: "approved" }, [], [], [], []);
    expect(result.percentage).toBe(0);
    expect(result.checks.some(c => c.key === "pending")).toBe(false);
  });
  it("counts actionable requests, not general notes or closed services", () => {
    expect(actionableRequest({ bookingStatus: "confirmed", specialRequest: "Late arrival" })).toBe(false);
    expect(actionableRequest({ bookingStatus: "confirmed", customizations: [{ status: "ready" }] })).toBe(true);
    expect(actionableRequest({ bookingStatus: "cancelled", customizations: [{ status: "requested" }] })).toBe(false);
    expect(actionableRequest({ bookingStatus: "checked_in", customizations: [{ status: "fulfilled" }] })).toBe(false);
  });
  it("includes same-day hourly departures and distinguishes overdue from automatic no-show", () => {
    const b = { bookingStatus: "confirmed", checkIn: "2026-10-31", checkOut: "2026-10-31", startAt: "2026-10-31T04:00:00Z" };
    expect(operationMatches(b, "departures", "2026-10-31", zone, Date.parse(timestamp("2026-10-31")))).toBe(true);
    expect(operationMatches(b, "overdue", "2026-10-01", zone, Date.parse(timestamp("2026-10-31")))).toBe(true);
    expect(b.bookingStatus).toBe("confirmed");
  });
  it("calculates shared hourly/overnight utilization", () => {
    const report = intervalReport([{ bookingStatus: "confirmed", bookingMode: "hourly", checkIn: "2026-10-31", checkOut: "2026-10-31", startAt: "2026-10-31T04:00:00Z", endAt: "2026-10-31T10:00:00Z" }], "2026-10-31", "2026-11-01", zone, 2);
    expect(report).toMatchObject({ roomHours: 6, roomNights: 0, occupancy: 13 });
  });
});
