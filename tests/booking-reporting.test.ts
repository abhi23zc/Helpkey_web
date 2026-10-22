import { describe, expect, it } from "vitest";
import { intervalReport, reservationSummary } from "@/lib/booking/reporting";
const rows = [
  { bookingMode: "hourly", bookingStatus: "confirmed", checkIn: "2026-02-01", checkOut: "2026-02-01", startAt: "2026-02-01T04:30Z", endAt: "2026-02-01T06:45Z" },
  { bookingMode: "overnight", bookingStatus: "checked_out", checkIn: "2026-02-01", checkOut: "2026-02-02", startAt: "2026-02-01T08:30Z", endAt: "2026-02-02T05:30Z" },
];
describe("time-aware reporting", () => {
  it("separates guest room-hours from overnight room-nights", () => {
    const report = intervalReport(rows, "2026-02-01", "2026-02-03", "Asia/Kolkata", 1);
    expect(report.roomHours).toBe(23.25);
    expect(report.roomNights).toBe(1);
    expect(report.availableRoomHours).toBe(48);
  });
  it("uses real local day length for occupancy denominators", () => {
    expect(intervalReport([], "2026-03-08", "2026-03-09", "America/New_York", 2).availableRoomHours).toBe(46);
    expect(intervalReport([], "2026-11-01", "2026-11-02", "America/New_York", 2).availableRoomHours).toBe(50);
  });
  it("classifies same-day hourly arrivals and explicit no-show actions by time", () => {
    const summary = reservationSummary(rows, "Asia/Kolkata", Date.parse("2026-02-01T05:00Z"));
    expect(summary.metrics.arrivals).toBe(1);
    expect(summary.metrics.noShowRisk).toBe(1);
    expect(summary.tabCounts.no_show).toBe(1);
    expect(rows[0].bookingStatus).toBe("confirmed");
  });
});
