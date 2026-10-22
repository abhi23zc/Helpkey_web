import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/firebase/admin", () => ({ adminDb: {}, adminAuth: {} }));
import { ratePlanSchema, ratePlanPatchSchema } from "@/lib/partner/service";

const base = { roomTypeId: "room", name: "Hourly rate", code: "HOUR", cancellationPolicyId: "policy", bookingMode: "hourly", pricingModel: "duration", durationPrices: [{ hours: 1, pricePaise: 20000 }, { hours: 2, pricePaise: 30000 }] };
describe("partner rate contracts", () => {
  it("accepts an hourly price list without a redundant base price", () => {
    expect(ratePlanSchema.parse(base).durationPrices).toEqual(base.durationPrices);
    expect(ratePlanPatchSchema.parse({ durationPrices: [{ hours: 2, pricePaise: 40000 }] }).durationPrices).toEqual([{ hours: 2, pricePaise: 40000 }]);
  });
  it("rejects old pricing writes and conflicting modes", () => {
    expect(ratePlanSchema.safeParse({ ...base, pricingModel: "package", durationMinutes: 60 }).success).toBe(false);
    expect(ratePlanPatchSchema.safeParse({ pricingModel: "per_hour", hourlyPricePaise: 20000 }).success).toBe(false);
    expect(ratePlanSchema.safeParse({ ...base, bookingMode: "overnight" }).success).toBe(false);
    expect(ratePlanSchema.safeParse({ ...base, pricingModel: "nightly" }).success).toBe(false);
  });
  it("requires explicit prices and unique whole-hour durations", () => {
    expect(ratePlanSchema.safeParse({ ...base, durationPrices: undefined }).success).toBe(false);
    expect(ratePlanSchema.safeParse({ ...base, durationPrices: [{ hours: 1.5, pricePaise: 10000 }] }).success).toBe(false);
    expect(ratePlanPatchSchema.safeParse({ durationPrices: [{ hours: 2, pricePaise: 30000 }, { hours: 2, pricePaise: 20000 }] }).success).toBe(false);
  });
  it("requires explicit breakfast inclusion and accepts it in partner updates", () => {
    expect(ratePlanSchema.parse(base).breakfastIncluded).toBe(false);
    expect(ratePlanSchema.parse({ ...base, breakfastIncluded: true }).breakfastIncluded).toBe(true);
    expect(ratePlanPatchSchema.parse({ breakfastIncluded: true }).breakfastIncluded).toBe(true);
    expect(ratePlanPatchSchema.safeParse({ breakfastIncluded: "true" }).success).toBe(false);
  });
  it("retains old overnight request compatibility and requires a nightly price", () => {
    const nightly = { roomTypeId: "room", name: "Nightly", code: "NIGHT", cancellationPolicyId: "policy", basePricePaise: 50000 };
    expect(ratePlanSchema.safeParse(nightly).success).toBe(true);
    expect(ratePlanSchema.safeParse({ ...nightly, basePricePaise: undefined }).success).toBe(false);
  });
});
