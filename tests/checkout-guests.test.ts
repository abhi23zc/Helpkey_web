import { describe, expect, it } from "vitest";
import {
  clampGuests,
  guestLimits,
  guestSummary,
  quoteTermsKey,
  sameGuests,
  searchWithGuests,
  type TermsQuote,
} from "@/lib/booking/checkout-state";

const room = { maxAdults: 3, maxChildren: 2, maxInfants: 2, maxOccupancy: 4 };

describe("checkout guest limits", () => {
  it("shares occupancy between adults and children but not infants", () => {
    const limits = guestLimits({ adults: 2, children: 2, infants: 0 }, room, true);
    expect(limits.adults).toMatchObject({ min: 1, max: 2, limitedByRoom: true });
    expect(limits.children).toMatchObject({ min: 0, max: 2 });
    expect(limits.infants).toMatchObject({ min: 0, max: 2 });
  });

  it("frees capacity as other counts go down", () => {
    expect(guestLimits({ adults: 1, children: 0, infants: 0 }, room, true).adults.max).toBe(3);
    expect(guestLimits({ adults: 1, children: 0, infants: 0 }, room, true).children.max).toBe(2);
  });

  it("locks children and infants when the property does not allow them", () => {
    const limits = guestLimits({ adults: 2, children: 0, infants: 0 }, room, false);
    expect(limits.children.max).toBe(0);
    expect(limits.infants.max).toBe(0);
  });

  it("falls back to the contract ceilings without capacity data", () => {
    const limits = guestLimits({ adults: 2, children: 0, infants: 0 }, null, true);
    expect([limits.adults.max, limits.children.max, limits.infants.max]).toEqual([12, 10, 10]);
  });

  it("always keeps at least one adult available", () => {
    const tiny = { maxAdults: 0, maxChildren: 0, maxInfants: 0, maxOccupancy: 0 };
    expect(guestLimits({ adults: 1, children: 0, infants: 0 }, tiny, true).adults.max).toBe(1);
  });

  it("clamps an over-capacity selection back into the room limits", () => {
    expect(clampGuests({ adults: 5, children: 5, infants: 5 }, room, true)).toEqual({
      adults: 3,
      children: 1,
      infants: 2,
    });
    expect(clampGuests({ adults: 0, children: 1, infants: 1 }, room, false)).toEqual({
      adults: 1,
      children: 0,
      infants: 0,
    });
  });
});

describe("checkout guest helpers", () => {
  it("formats the summary with correct singular and plural forms", () => {
    expect(guestSummary({ adults: 1, children: 1, infants: 1 })).toBe("1 Adult, 1 Child, 1 Infant");
    expect(guestSummary({ adults: 2, children: 0, infants: 0 })).toBe("2 Adults, 0 Children, 0 Infants");
  });

  it("compares guest counts", () => {
    expect(sameGuests({ adults: 2, children: 0, infants: 0 }, { adults: 2, children: 0, infants: 0 })).toBe(true);
    expect(sameGuests({ adults: 2, children: 0, infants: 0 }, { adults: 3, children: 0, infants: 0 })).toBe(false);
  });

  it("updates only the guest parameters in the address", () => {
    const next = new URLSearchParams(
      searchWithGuests("bookingMode=hourly&arrivalTime=10%3A00&adults=2&children=0&infants=0&property=x", {
        adults: 3,
        children: 1,
        infants: 0,
      }),
    );
    expect(next.get("adults")).toBe("3");
    expect(next.get("children")).toBe("1");
    expect(next.get("infants")).toBe("0");
    expect(next.get("bookingMode")).toBe("hourly");
    expect(next.get("arrivalTime")).toBe("10:00");
    expect(next.get("property")).toBe("x");
  });
});

describe("quote consent key", () => {
  const base: TermsQuote & Record<string, unknown> = {
    bookingMode: "hourly",
    roomType: { name: "Normal" },
    ratePlan: { name: "Standard rate", paymentMode: "full" },
    startAt: "2026-10-25T04:30:00.000Z",
    checkIn: "2026-10-25",
    checkOut: "2026-10-25",
    durationMinutes: 180,
    nights: 0,
    currency: "INR",
    subtotalPaise: 40000,
    taxPaise: 0,
    customerFeePaise: 0,
    totalPaise: 40000,
    payableNowPaise: 40000,
    balanceDuePaise: 0,
    cancellationPolicy: { name: "Flexible", refundableUntilHours: 24, cancellationFeePercent: 0 },
    adults: 2,
    fingerprint: "a",
    quotedAt: "t1",
    expiresAt: "t2",
  };

  it("ignores guest counts, fingerprint and timestamps", () => {
    const changed = { ...base, adults: 3, children: 1, fingerprint: "b", quotedAt: "t3", expiresAt: "t4" };
    expect(quoteTermsKey(changed)).toBe(quoteTermsKey(base));
  });

  it("changes when the price, payment split, timing or cancellation rules change", () => {
    const key = quoteTermsKey(base);
    expect(quoteTermsKey({ ...base, totalPaise: 45000 })).not.toBe(key);
    expect(quoteTermsKey({ ...base, payableNowPaise: 10000, balanceDuePaise: 30000 })).not.toBe(key);
    expect(quoteTermsKey({ ...base, durationMinutes: 240 })).not.toBe(key);
    expect(quoteTermsKey({ ...base, cancellationPolicy: null })).not.toBe(key);
    expect(
      quoteTermsKey({ ...base, cancellationPolicy: { name: "Flexible", refundableUntilHours: 48, cancellationFeePercent: 0 } }),
    ).not.toBe(key);
  });
});
