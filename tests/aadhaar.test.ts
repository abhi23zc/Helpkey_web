import { describe, expect, it } from "vitest";
import { isValidAadhaar, normalizeAadhaar } from "@/lib/aadhaar";

// Synthetic checksum fixtures, unrelated to the guests' submitted numbers.
const fixtures = ["234567890124", "987654321091", "456789012340"];

describe("Aadhaar format and checksum", () => {
  it("accepts checksum-valid synthetic values and common spacing", () => {
    for (const value of fixtures) {
      expect(isValidAadhaar(value)).toBe(true);
      expect(isValidAadhaar(value.match(/.{4}/g)!.join(" "))).toBe(true);
      expect(isValidAadhaar(value.match(/.{4}/g)!.join("-"))).toBe(true);
    }
    expect(normalizeAadhaar("2345 6789-0124")).toBe(fixtures[0]);
  });

  it("rejects every single-digit corruption of the fixtures", () => {
    for (const value of fixtures) {
      for (let index = 0; index < value.length; index++) {
        for (let digit = 0; digit < 10; digit++) {
          if (String(digit) === value[index]) continue;
          expect(isValidAadhaar(value.slice(0, index) + digit + value.slice(index + 1))).toBe(false);
        }
      }
    }
  });

  it("rejects missing digits, repeated digits, and nonnumeric content", () => {
    for (const value of ["", "23456789012", "2345678901240", "000000000000", "111111111111", "23456789012x", "234567890124x"]) {
      expect(isValidAadhaar(value)).toBe(false);
    }
  });
});
