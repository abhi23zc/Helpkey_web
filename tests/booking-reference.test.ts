import { describe, expect, it } from "vitest";
import { formatBookingReference } from "@/lib/booking/reference";

describe("booking references", () => {
  it("uses the first three city letters and a six-digit suffix", () => {
    expect(formatBookingReference("Kanpur", "kanpur-hotel", 482731)).toMatch(/^KNP\d{6}$/);
  });

  it("keeps leading zeroes in the suffix", () => {
    expect(formatBookingReference("Kanpur", "kanpur-hotel", 42)).toBe("KNP000042");
  });

  it("falls back from city to property slug and then HKY", () => {
    expect(formatBookingReference("", "mumbai-hotel", 1)).toBe("MMB000001");
    expect(formatBookingReference(null, "--", 1)).toBe("HKY000001");
  });
});
