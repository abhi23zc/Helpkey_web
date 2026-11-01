import { describe, expect, it } from "vitest";
import { pageRange, rangeDays, validPageRange } from "@/lib/partner/date-range";
import { selectedBuckets } from "@/lib/partner/dashboard/domain";
describe("partner page date ranges", () => {
  it("accepts inclusive ranges of 1–31 days and rejects invalid ranges", () => {
    expect(validPageRange("2026-01-01", "2026-01-31")).toBe(true);
    expect(validPageRange("2026-01-01", "2026-02-01")).toBe(false);
    expect(validPageRange("2026-02-30", "2026-03-01")).toBe(false);
    expect(validPageRange("2026-01-02", "2026-01-01")).toBe(false);
    expect(rangeDays("2026-01-01", "2026-01-01")).toEqual(["2026-01-01"]);
  });
  it("uses page defaults for invalid or partial URL selections", () => {
    expect(pageRange(null, null, "2026-11-03", 6)).toEqual({
      from: "2026-10-28",
      to: "2026-11-03",
    });
    expect(pageRange("2026-11-01", null, "2026-11-03")).toEqual({
      from: "2026-11-03",
      to: "2026-11-03",
    });
  });
  it("supports seven-day operational defaults without replacing explicit selections", () => {
    expect(pageRange(null, null, "2026-11-03", 0, 6)).toEqual({
      from: "2026-11-03",
      to: "2026-11-09",
    });
    expect(pageRange("2026-11-05", "2026-11-05", "2026-11-03", 0, 6)).toEqual({
      from: "2026-11-05",
      to: "2026-11-05",
    });
  });
  it("groups dates without extending the selected reporting window", () => {
    for (const grouping of ["daily", "weekly", "monthly"] as const) {
      const buckets = selectedBuckets("2026-10-28", "2026-11-03", grouping);
      expect(buckets[0].start).toBe("2026-10-28");
      expect(buckets.at(-1)?.end).toBe("2026-11-03");
      expect(buckets.flatMap((b) => rangeDays(b.start, b.end))).toHaveLength(7);
    }
  });
});
