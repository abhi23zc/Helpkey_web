import { describe, expect, it } from "vitest";
import { eligiblePricing, startingPrice, validDurationPrices } from "@/lib/booking/duration-pricing";

describe("duration price lists", () => {
  it("accepts independent totals and finds the minimum", () => {
    const rate = { bookingMode: "hourly", pricingModel: "duration", durationPrices: [{ hours: 1, pricePaise: 20000 }, { hours: 2, pricePaise: 30000 }] };
    expect(validDurationPrices(rate.durationPrices)).toBe(true);
    expect(eligiblePricing(rate)).toBe(true);
    expect(startingPrice(rate)).toBe(20000);
  });
  it.each([[], [{ hours: 0, pricePaise: 1 }], [{ hours: 25, pricePaise: 1 }], [{ hours: 1.5, pricePaise: 1 }], [{ hours: 1, pricePaise: 0 }], [{ hours: 1, pricePaise: 1.5 }], [{ hours: 1, pricePaise: 1 }, { hours: 1, pricePaise: 2 }]])("rejects invalid rows %j", (...rows) => {
    // Each table above is supplied as the parameter list by it.each.
    expect(validDurationPrices(rows)).toBe(false);
  });
  it("excludes old rates even before archival and preserves nightly compatibility", () => {
    expect(eligiblePricing({ bookingMode: "hourly", pricingModel: "package" })).toBe(false);
    expect(startingPrice({ bookingMode: "hourly", pricingModel: "per_hour", basePricePaise: 20000 })).toBeNull();
    expect(startingPrice({ basePricePaise: 50000 })).toBe(50000);
  });
});
