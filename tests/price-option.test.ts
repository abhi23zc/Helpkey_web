import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/firebase/admin", () => ({ adminDb: {}, adminAuth: {} }));
import { ratePlanSchema } from "@/lib/partner/service";
import { calculateGuestPrice, evaluateStay } from "@/lib/booking/domain";
import { rateOwnerError } from "@/lib/partner/rate-owner-error";

describe("owner price options", () => {
  it("accepts omitted codes, retains valid legacy codes and decimal precision", () => {
    const base = { roomTypeId: "room", name: "Standard", cancellationPolicyId: "policy", basePricePaise: 70050, taxBasisPoints: 1234, customerFeePaise: 1051, depositBasisPoints: 2555 };
    expect(ratePlanSchema.parse(base)).toMatchObject(base);
    expect(ratePlanSchema.parse({ ...base, code: "OLD_CODE" }).code).toBe("OLD_CODE");
    expect(ratePlanSchema.safeParse({ ...base, code: "bad code" }).success).toBe(false);
  });
  for (const paymentMode of ["full", "deposit", "pay_at_property"]) {
    for (const bookingMode of ["overnight", "hourly"] as const) {
      it(`matches checkout for ${bookingMode} / ${paymentMode}`, () => {
        const hourly = bookingMode === "hourly";
        const rate = { bookingMode, pricingModel: hourly ? "duration" as const : "nightly" as const, basePricePaise: 70050, durationPrices: [{ hours: 3, pricePaise: 70050 }], taxBasisPoints: 1234, customerFeePaise: 1051, depositBasisPoints: 2555, paymentMode, stayRules: { minimumNights: 2 } };
        const quote = evaluateStay({ bookingMode, checkIn: "2027-01-02", checkOut: "2027-01-04", arrivalTime: "10:00", durationMinutes: 180, adults: 1, children: 0, infants: 0 }, { bookingModes: [bookingMode] }, { bookingModes: [bookingMode] }, rate, Date.parse("2027-01-01T00:00Z"));
        expect(calculateGuestPrice(hourly ? 70050 : 140100, rate)).toMatchObject({ subtotalPaise: quote.subtotalPaise, taxPaise: quote.taxPaise, totalPaise: quote.totalPaise, payableNowPaise: quote.payableNowPaise, balanceDuePaise: quote.balanceDuePaise });
      });
    }
  }
  it("rounds half paise up and applies additional charges once", () => {
    expect(calculateGuestPrice(101, { taxBasisPoints: 5000, customerFeePaise: 2, paymentMode: "deposit", depositBasisPoints: 5000 })).toMatchObject({ taxPaise: 51, totalPaise: 154, payableNowPaise: 77 });
    expect(calculateGuestPrice(70050, { paymentMode: "full", depositBasisPoints: 2555 }).payableNowPaise).toBe(70050);
    expect(calculateGuestPrice(70050, { paymentMode: "pay_at_property", depositBasisPoints: 2555 }).payableNowPaise).toBe(0);
  });
  it("does not expose internal error identifiers or validation details", () => {
    expect(rateOwnerError(new Error("STAY_TYPE_FIXED"))).toContain("Create another price option");
    expect(rateOwnerError(new Error("FIRESTORE_INTERNAL"))).not.toContain("FIRESTORE");
    const invalid = ratePlanSchema.safeParse({ code: "bad code" });
    if (!invalid.success) expect(rateOwnerError(invalid.error)).not.toMatch(/code|regex/i);
  });
});
