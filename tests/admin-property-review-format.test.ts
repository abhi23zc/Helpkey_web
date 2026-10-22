import { describe, expect, it } from "vitest";
import {
  addressLine,
  cancellationSummary,
  formatTime,
  groupReadiness,
  hoursLabel,
  isAwaitingReview,
  policySummary,
  ratePrice,
} from "@/components/admin/dashboard/property-review-format";

describe("groupReadiness", () => {
  const checks = [
    { key: "pending", label: "Listing is pending review", complete: true },
    { key: "total", label: "Approved photos: At least 7 photos", complete: false },
    { key: "exterior", label: "Approved photos: Exterior / entrance photo", complete: false },
    { key: "suite_room", label: "Approved photos: Suite · Bedroom photo", complete: true },
    { key: "pan", label: "Approved document: pan", complete: false },
    { key: "government_id_front", label: "Approved document: government id front", complete: true },
    { key: "government_id_back", label: "Approved document: government id back", complete: false },
  ];

  it("lists only incomplete items, grouped by what the admin can act on", () => {
    const grouped = groupReadiness(checks);
    expect(grouped.photos).toEqual(["At least 7 photos", "Exterior / entrance photo"]);
    expect(grouped.documents).toEqual(["PAN card", "Government ID (back)"]);
    expect(grouped.other).toEqual([]);
    expect(grouped.total).toBe(4);
  });

  it("surfaces unexpected failing checks under other", () => {
    const grouped = groupReadiness([{ key: "pending", label: "Listing is pending review", complete: false }]);
    expect(grouped.other).toEqual(["Listing is pending review"]);
    expect(grouped.total).toBe(1);
  });

  it("reports nothing missing when every check passes", () => {
    expect(groupReadiness(checks.map(check => ({ ...check, complete: true })))).toMatchObject({ photos: [], documents: [], other: [], total: 0 });
  });
});

describe("display formatting", () => {
  it("shows independent hourly duration totals", () => {
    expect(ratePrice({ pricingModel: "duration", durationPrices: [{ hours: 1, pricePaise: 20000 }, { hours: 2, pricePaise: 30000 }] })).toBe("₹200.00 for 1 hour · ₹300.00 for 2 hours");
  });
  it("formats 24h times for humans and leaves odd values alone", () => {
    expect(formatTime("14:00")).toBe("2:00 PM");
    expect(formatTime("00:30")).toBe("12:30 AM");
    expect(formatTime("12:00")).toBe("12:00 PM");
    expect(formatTime("soon")).toBe("soon");
    expect(formatTime(undefined)).toBeNull();
  });

  it("turns free-form guest policies into one readable line", () => {
    expect(policySummary({ allowed: false })).toBe("Not allowed");
    expect(policySummary({ allowed: true, minimumAge: 5 })).toBe("Allowed · Minimum Age: 5");
    expect(policySummary({})).toBeNull();
    expect(policySummary(null)).toBeNull();
    expect(policySummary({ accepted: ["aadhaar", "passport"] })).toBe("Accepted: Aadhaar, Passport");
  });

  it("describes cancellation terms without exposing raw fields", () => {
    expect(cancellationSummary({ refundableUntilHours: 48, cancellationFeePercent: 10 })).toBe("Refundable until 2 days before check-in · 10% cancellation fee");
    expect(cancellationSummary({ refundableUntilHours: 0, cancellationFeePercent: 0 })).toBe("Refundable until 0 hours before check-in");
    expect(cancellationSummary({ description: "Flexible cancellation" })).toBe("Flexible cancellation");
    expect(hoursLabel(1)).toBe("1 hour");
    expect(hoursLabel(24)).toBe("24 hours");
  });

  it("shows prices with the unit the guest pays for", () => {
    expect(ratePrice({ basePricePaise: 250000 })).toBe("₹2,500.00 / night");
    expect(ratePrice({ pricingModel: "per_hour", hourlyPricePaise: 50000 })).toBe("₹500.00 / hour");
    expect(ratePrice({ basePricePaise: 120000, durationMinutes: 180 })).toBe("₹1,200.00 for 3h");
    expect(ratePrice({})).toBe("Not provided");
  });

  it("builds a compact address and ignores blanks", () => {
    expect(addressLine({ line1: "12 MG Road", city: "Kanpur", state: "Uttar Pradesh", postalCode: "208001" })).toBe("12 MG Road, Kanpur, Uttar Pradesh 208001");
    expect(addressLine({ city: "Kanpur", line1: "  " })).toBe("Kanpur");
    expect(addressLine({})).toBe("");
  });

  it("treats assets without a decision as awaiting review", () => {
    expect(isAwaitingReview({ moderationStatus: "pending" })).toBe(true);
    expect(isAwaitingReview({ status: "pending" })).toBe(true);
    expect(isAwaitingReview({ moderationStatus: "approved" })).toBe(false);
  });
});
