import { describe, expect, it } from "vitest";
import { allocateIntervals, assertTransition, cancellationRefund, evaluateStay, localParts, resolveLocal, validDate } from "@/lib/booking/domain";

const now = Date.parse("2026-01-01T00:00Z");
const property = { timezone: "Asia/Kolkata", bookingModes: ["overnight", "hourly"] };
const room = { maxAdults: 2, maxChildren: 1, totalInventory: 1 };
const request = { checkIn: "2026-02-01", arrivalTime: "10:00", bookingMode: "hourly" as const, durationMinutes: 180, adults: 2, children: 0, infants: 0 };
const rate = { bookingMode: "hourly", pricingModel: "duration" as const, durationPrices: [{ hours: 1, pricePaise: 20000 }, { hours: 2, pricePaise: 30000 }, { hours: 3, pricePaise: 120000 }] };
const evaluate = (changes = {}, settings = {}, roomChanges = {}) => evaluateStay({ ...request, ...changes }, property, { ...room, ...roomChanges }, { ...rate, ...settings }, now);

describe("property-local stay rules", () => {
  it("uses the exact duration total without multiplication", () => {
    expect(evaluate({ durationMinutes: 60 }).subtotalPaise).toBe(20000);
    expect(evaluate({ durationMinutes: 120 }).subtotalPaise).toBe(30000);
    const stay = evaluate();
    expect(stay.subtotalPaise).toBe(120000);
    expect(stay.departureTime).toBe("13:00");
    expect(stay.inventoryEndAt).toBe("2026-02-01T08:00:00.000Z");
  });
  it("rejects fractional hours, unpriced durations, and invalid price tables", () => {
    expect(() => evaluate({ durationMinutes: 135 })).toThrow("WHOLE_HOUR_DURATION_REQUIRED");
    expect(() => evaluate({ durationMinutes: 240 })).toThrow("DURATION_NOT_PRICED");
    expect(() => evaluate({}, { durationPrices: [] })).toThrow("INVALID_DURATION_PRICES");
    expect(() => evaluate({}, { durationPrices: [{ hours: 3, pricePaise: 1 }, { hours: 3, pricePaise: 2 }] })).toThrow("INVALID_DURATION_PRICES");
  });
  it("rejects both legacy models for new bookings", () => {
    expect(() => evaluate({}, { pricingModel: "package" })).toThrow("RATE_NOT_AVAILABLE");
    expect(() => evaluate({}, { pricingModel: "per_hour" })).toThrow("RATE_NOT_AVAILABLE");
  });
  it("calculates tax, fee, deposit and balance in paise", () => {
    const stay = evaluate({}, { taxBasisPoints: 1800, customerFeePaise: 999, paymentMode: "deposit", depositBasisPoints: 2500 });
    expect(stay.totalPaise).toBe(142599);
    expect(stay.payableNowPaise).toBe(35650);
    expect(stay.balanceDuePaise).toBe(106949);
  });
  it("rejects impossible dates, gaps, and ambiguous local arrivals", () => {
    expect(validDate("2026-02-29")).toBe(false);
    expect(validDate("2028-02-29")).toBe(true);
    expect(() => resolveLocal("2026-03-08", "02:30", "America/New_York")).toThrow("NONEXISTENT_LOCAL_TIME");
    expect(() => resolveLocal("2026-11-01", "01:30", "America/New_York")).toThrow("AMBIGUOUS_LOCAL_TIME");
    expect(localParts(resolveLocal("2026-02-01", "10:00", "Asia/Kolkata"), "Asia/Kolkata").time).toBe("10:00");
  });
  it("constrains mode, occupancy, notice, weekdays and quarter-hour arrivals", () => {
    expect(() => evaluate({}, { bookingMode: "overnight" })).toThrow("RATE_NOT_AVAILABLE");
    expect(() => evaluate({ adults: 3 })).toThrow("ROOM_CAPACITY_EXCEEDED");
    expect(() => evaluate({ arrivalTime: "10:10" })).toThrow("ARRIVAL_MUST_BE_QUARTER_HOUR");
    expect(() => evaluate({}, { eligibleWeekdays: [1] })).toThrow("ARRIVAL_WEEKDAY_NOT_ALLOWED");
    expect(() => evaluateStay(request, property, room, rate, resolveLocal(request.checkIn, "09:46", property.timezone))).toThrow("CHECK_IN_IN_PAST");
  });
  it("allows cleaning after the operating window but confines occupancy", () => {
    expect(evaluate({ durationMinutes: 120 }, { operatingWindow: { start: "09:00", end: "12:00" } }).departureTime).toBe("12:00");
    expect(() => evaluate({}, { operatingWindow: { start: "09:00", end: "12:00" } })).toThrow("OUTSIDE_OPERATING_WINDOW");
    expect(() => evaluate({ arrivalTime: "23:00" })).toThrow("MIDNIGHT_CROSSING_NOT_ALLOWED");
    expect(evaluate({ arrivalTime: "23:00" }, { allowMidnightCrossing: true }).checkOut).toBe("2026-02-02");
  });
  it("prices overnight by local calendar nights over DST", () => {
    const stay = evaluateStay({ ...request, bookingMode: "overnight", checkIn: "2026-03-07", checkOut: "2026-03-09" }, { ...property, timezone: "America/New_York" }, room, { basePricePaise: 10000 }, now);
    expect(stay.nights).toBe(2);
    expect(stay.subtotalPaise).toBe(20000);
    expect(stay.durationMinutes).toBe(44 * 60);
  });
  it("accepts arrivals on both sides of midnight within an overnight operating window", () => {
    const settings = { operatingWindow: { start: "22:00", end: "06:00" }, allowMidnightCrossing: true };
    expect(evaluate({ arrivalTime: "23:00", durationMinutes: 120 }, settings).departureTime).toBe("01:00");
    expect(evaluate({ arrivalTime: "01:00", durationMinutes: 120 }, settings).departureTime).toBe("03:00");
    expect(evaluate({ arrivalTime: "04:00", durationMinutes: 120 }, settings).departureTime).toBe("06:00");
    expect(() => evaluate({ arrivalTime: "05:00", durationMinutes: 120 }, settings)).toThrow("OUTSIDE_OPERATING_WINDOW");
    expect(() => evaluate({ arrivalTime: "06:00", durationMinutes: 60 }, settings)).toThrow("OUTSIDE_OPERATING_WINDOW");
    expect(() => evaluate({ arrivalTime: "12:00", durationMinutes: 120 }, settings)).toThrow("OUTSIDE_OPERATING_WINDOW");
  });
});

describe("quarter-hour allocations", () => {
  const keys = (start: string, end: string) => allocateIntervals(start, end, "Asia/Kolkata").flatMap((a) => a.intervals);
  it("blocks hourly and overnight stays in the same UTC intervals", () => {
    const night = new Set(keys("2026-02-01T08:30Z", "2026-02-02T06:00Z"));
    expect(keys("2026-02-01T10:00Z", "2026-02-01T13:00Z").every((key) => night.has(key))).toBe(true);
  });
  it("uses half-open cleaning boundaries", () => {
    const first = new Set(keys("2026-02-01T10:00Z", "2026-02-01T13:30Z"));
    expect(keys("2026-02-01T13:15Z", "2026-02-01T14:00Z").some((key) => first.has(key))).toBe(true);
    expect(keys("2026-02-01T13:30Z", "2026-02-01T14:00Z").some((key) => first.has(key))).toBe(false);
  });
  it("does not assume 96 intervals in a local day", () => {
    const spring = allocateIntervals("2026-03-08T05:00Z", "2026-03-09T04:00Z", "America/New_York");
    const autumn = allocateIntervals("2026-11-01T04:00Z", "2026-11-02T05:00Z", "America/New_York");
    expect(spring).toHaveLength(1);
    expect(spring[0].intervals).toHaveLength(92);
    expect(autumn[0].intervals).toHaveLength(100);
    expect(new Set(autumn[0].intervals).size).toBe(100);
  });
});

describe("lifecycle and cancellation", () => {
  it("accepts canonical transitions and rejects stale or skipped actions", () => {
    expect(() => assertTransition("confirmed", "checked_in")).not.toThrow();
    expect(() => assertTransition("checked_in", "completed")).not.toThrow();
    expect(() => assertTransition("confirmed", "checked_out")).toThrow();
    expect(() => assertTransition("expired", "confirmed")).toThrow();
  });
  it("bounds refunds by captured funds and previous refunds", () => {
    const start = "2026-02-01T10:00Z";
    const policy = { refundableUntilHours: 24, cancellationFeePercent: 25 };
    expect(cancellationRefund(10000, 2000, start, policy, now)).toBe(5500);
    expect(cancellationRefund(2500, 0, start, { ...policy, cancellationFeePercent: 50 }, now, false, 10000)).toBe(0);
    expect(cancellationRefund(10000, 2000, start, policy, Date.parse(start))).toBe(0);
    expect(cancellationRefund(10000, 2000, start, policy, Date.parse(start), true)).toBe(8000);
  });
});
