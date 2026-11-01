import { describe, expect, it } from "vitest";
import { evaluateStay } from "@/lib/booking/domain";
const property = {
  timezone: "Asia/Kolkata",
  bookingModes: ["overnight", "hourly"],
};
const room = { maxAdults: 2, maxChildren: 0 };
const now = Date.parse("2026-01-01T00:00Z");
const input = {
  checkIn: "2026-01-03",
  checkOut: "2026-01-06",
  adults: 1,
  children: 0,
  infants: 0,
};
describe("effective room date prices", () => {
  it("sums nightly overrides with base fallback and rounds tax/deposit once", () => {
    const result = evaluateStay(
      input,
      property,
      room,
      {
        basePricePaise: 10001,
        datePrices: { "2026-01-04": { basePricePaise: 20003 } },
        taxBasisPoints: 1800,
        paymentMode: "deposit",
        depositBasisPoints: 2500,
      },
      now,
    );
    expect(result.subtotalPaise).toBe(40005);
    expect(result.taxPaise).toBe(7201);
    expect(result.totalPaise).toBe(47206);
    expect(result.payableNowPaise).toBe(11802);
  });
  it("uses the hourly arrival date for a midnight-crossing stay", () => {
    const result = evaluateStay(
      {
        ...input,
        bookingMode: "hourly",
        arrivalTime: "23:00",
        durationMinutes: 180,
      },
      property,
      room,
      {
        bookingMode: "hourly",
        pricingModel: "duration",
        durationPrices: [{ hours: 3, pricePaise: 10000 }],
        datePrices: {
          "2026-01-03": { durationPrices: [{ hours: 3, pricePaise: 18000 }] },
          "2026-01-04": { durationPrices: [{ hours: 3, pricePaise: 99000 }] },
        },
        allowMidnightCrossing: true,
      },
      now,
    );
    expect(result.subtotalPaise).toBe(18000);
    expect(result.checkOut).toBe("2026-01-04");
  });
  it("treats an hourly override as a complete duration table", () => {
    expect(() =>
      evaluateStay(
        {
          ...input,
          bookingMode: "hourly",
          arrivalTime: "10:00",
          durationMinutes: 180,
        },
        property,
        room,
        {
          bookingMode: "hourly",
          pricingModel: "duration",
          durationPrices: [{ hours: 3, pricePaise: 10000 }],
          datePrices: {
            "2026-01-03": { durationPrices: [{ hours: 2, pricePaise: 12000 }] },
          },
        },
        now,
      ),
    ).toThrow("DURATION_NOT_PRICED");
  });
  it("rejects invalid monetary values in nightly overrides", () => {
    expect(() =>
      evaluateStay(
        input,
        property,
        room,
        {
          basePricePaise: 10000,
          datePrices: { "2026-01-04": { basePricePaise: -1 } },
        },
        now,
      ),
    ).toThrow("INVALID_MONEY");
  });
});
