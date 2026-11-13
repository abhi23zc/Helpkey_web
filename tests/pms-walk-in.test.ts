import { describe, it, expect } from "vitest";
import {
  evaluateStay,
  resolveLocal,
  allocateIntervals,
  localParts,
} from "@/lib/booking/domain";
import { customerOwnsBooking } from "@/lib/booking/customer-access";
const p = {
  timezone: "Asia/Kolkata",
  checkInTime: "14:00",
  checkOutTime: "11:00",
  bookingModes: ["overnight", "hourly"],
};
const room = { maxAdults: 2, maxChildren: 1, totalInventory: 1 };
const overnight = {
  checkIn: "2026-11-14",
  checkOut: "2026-11-15",
  adults: 2,
  children: 0,
  infants: 0,
};
describe("internal walk-in timing", () => {
  it("permits 8 PM arrival while retaining public restrictions and full nightly price", () => {
    const now = resolveLocal(overnight.checkIn, "20:00", p.timezone);
    expect(() =>
      evaluateStay(overnight, p, room, { basePricePaise: 100000 }, now),
    ).toThrow("CHECK_IN_IN_PAST");
    const q = evaluateStay(
      overnight,
      p,
      room,
      { basePricePaise: 100000 },
      now,
      { arrivalTime: "20:00" },
    );
    expect(q.arrivalTime).toBe("20:00");
    expect(q.departureTime).toBe("11:00");
    expect(q.nights).toBe(1);
    expect(q.subtotalPaise).toBe(100000);
  });
  it("uses current calendar date after midnight, with an explicit hotel early-arrival policy", () => {
    const now = resolveLocal(overnight.checkIn, "01:00", p.timezone);
    expect(() =>
      evaluateStay(overnight, p, room, { basePricePaise: 100000 }, now, {
        arrivalTime: "01:00",
      }),
    ).toThrow("EARLY_WALK_IN_DISABLED");
    const q = evaluateStay(
      overnight,
      { ...p, pms: { allowEarlyWalkIns: true } },
      room,
      { basePricePaise: 100000 },
      now,
      { arrivalTime: "01:00" },
    );
    expect(q.checkIn).toBe("2026-11-14");
    expect(q.checkOut).toBe("2026-11-15");
    expect(q.subtotalPaise).toBe(100000);
    expect(() =>
      evaluateStay(
        { ...overnight, checkIn: "2026-11-13" },
        p,
        room,
        { basePricePaise: 100000 },
        now,
        { arrivalTime: "20:00" },
      ),
    ).toThrow("WALK_IN_CURRENT_DATE_REQUIRED");
    expect(() =>
      evaluateStay(overnight, p, room, { basePricePaise: 100000 }, now, {
        arrivalTime: "02:00",
      }),
    ).toThrow("WALK_IN_CURRENT_DATE_REQUIRED");
  });
  it("preserves exact hourly arrival and all overlapping intervals across midnight", () => {
    const now = resolveLocal(overnight.checkIn, "23:07", p.timezone);
    const input = {
      ...overnight,
      bookingMode: "hourly" as const,
      arrivalTime: "23:07",
      durationMinutes: 120,
    };
    const rate = {
      bookingMode: "hourly",
      pricingModel: "duration" as const,
      allowMidnightCrossing: true,
      durationPrices: [{ hours: 2, pricePaise: 30000 }],
    };
    const q = evaluateStay(input, p, room, rate, now, { arrivalTime: "23:07" });
    expect(q.arrivalTime).toBe("23:07");
    expect(q.departureTime).toBe("01:07");
    expect(q.checkOut).toBe("2026-11-15");
    expect(
      allocateIntervals(q.startAt, q.inventoryEndAt, q.timezone).length,
    ).toBe(2);
    expect(() =>
      evaluateStay(
        input,
        p,
        room,
        { ...rate, allowMidnightCrossing: false },
        now,
        { arrivalTime: "23:07" },
      ),
    ).toThrow("MIDNIGHT_CROSSING_NOT_ALLOWED");
    expect(localParts(now, "America/Los_Angeles").date).not.toBeUndefined();
    expect(q.checkIn).toBe(localParts(now, p.timezone).date);
  });
  it("does not grant customer ownership to historical operators or matching contacts", () => {
    expect(
      customerOwnsBooking(
        { source: "manual_partner", guestId: "staff" },
        "staff",
      ),
    ).toBe(false);
    expect(
      customerOwnsBooking(
        {
          source: "manual_partner",
          identityVersion: 2,
          linkedCustomerId: "guest",
          guestId: "guest",
        },
        "guest",
      ),
    ).toBe(true);
    expect(
      customerOwnsBooking(
        { source: "manual_partner", identityVersion: 2, guestId: null },
        "guest",
      ),
    ).toBe(false);
    expect(customerOwnsBooking({ guestId: "guest" }, "guest")).toBe(true);
  });
});
