import { describe, it, expect } from "vitest";
import {
  initialCollection,
  parseCollectionPaise,
} from "@/lib/partner/reservations/collection-amount";
describe("initial hotel collections", () => {
  it("converts rupees exactly without rounding fractional paise", () => {
    expect(parseCollectionPaise("500.50")).toBe(50050);
    expect(parseCollectionPaise("0.01")).toBe(1);
    expect(parseCollectionPaise("001.2")).toBe(120);
    for (const invalid of [
      "-1",
      "1.001",
      "1e3",
      "1,000",
      "",
      "NaN",
      "90071992547409910",
    ])
      expect(parseCollectionPaise(invalid)).toBeNull();
  });
  it("supports none, partial, full and legacy mapping", () => {
    expect(initialCollection(undefined, false, 100000)).toBe(0);
    expect(initialCollection(undefined, true, 100000)).toBe(100000);
    expect(initialCollection(50050, false, 100000)).toBe(50050);
    expect(initialCollection(0, true, 100000)).toBe(0);
    expect(initialCollection(100000, false, 100000)).toBe(100000);
  });
  it("rejects unsafe amounts, negative values and overpayment", () => {
    for (const value of [
      -1,
      100001,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ])
      expect(() => initialCollection(value, false, 100000)).toThrow(
        "INVALID_INITIAL_COLLECTION",
      );
    expect(() =>
      initialCollection(0, false, Number.MAX_SAFE_INTEGER + 1),
    ).toThrow();
  });
});
