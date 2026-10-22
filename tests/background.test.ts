import { afterEach, describe, expect, it, vi } from "vitest";
import { IdleSchedule, positiveInteger, retryDelay } from "@/lib/background/config";
import { safeJobId, publicationSchema } from "@/lib/background/jobs";
import { contribution, applyContribution, emptyTotals, summary } from "@/lib/background/review-model";
import { generationKeys, invalidationKeys } from "@/lib/background/cache";
afterEach(() => vi.unstubAllEnvs());
describe("background scheduling and identities", () => {
  it("backs off while idle, caps reads, and immediately drains busy work", () => {
    const schedule = new IdleSchedule(2000, 30000);
    expect(Array.from({ length: 7 }, () => schedule.next(false))).toEqual([2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    expect(schedule.next(true)).toBe(0); expect(schedule.next(false)).toBe(2000);
  });
  it("rejects invalid operational settings and caps retry growth", () => {
    for (const value of ["0", "-1", "NaN", "1.5", "Infinity"]) { vi.stubEnv("TEST_INTERVAL", value); expect(() => positiveInteger("TEST_INTERVAL", 100)).toThrow(); }
    expect(retryDelay(999)).toBe(3600000);
  });
  it("creates unambiguous queue-safe identities and validates media collection", () => {
    expect(safeJobId("a:b", "c")).not.toBe(safeJobId("a", "b:c"));
    expect(safeJobId("publish", "a:b")).toMatch(/^job-[a-f0-9]{64}$/);
    expect(publicationSchema.safeParse({ operation: "publish", assetType: "property_image", sourceCollection: "reviewPhotos", assetId: "id", sourceObjectKey: "key", sourceChecksum: "a".repeat(64) }).success).toBe(false);
  });
  it("invalidates matching scopes without scanning Redis", () => {
    expect(invalidationKeys(["property:hotel", "property:hotel"])).toHaveLength(1);
    expect(generationKeys(["property", "hotel"])).toContain(invalidationKeys(["property:hotel"])[0]);
    expect(generationKeys(["search", "query"])).toContain(invalidationKeys(["search:*"])[0]);
  });
});
describe("review contributions", () => {
  it("adjusts edits, replies, photos and removals without recounting unrelated reviews", () => {
    const a = contribution({ status: "approved", rating: 5, text: "clean helpful staff", photoIds: [] });
    const b = contribution({ status: "approved", rating: 2, text: "noise", photoIds: ["photo"], partnerReply: { text: "Thanks" } });
    let totals = applyContribution(emptyTotals(), undefined, a);
    totals = applyContribution(totals, a, b);
    expect(summary(totals)).toMatchObject({ count: 1, ratingSum: 2, average: 2 });
    expect(totals).toMatchObject({ awaiting: 0, withPhotos: 1, topicCounts: { Cleanliness: 0, "Staff & service": 0, Noise: 1 } });
    expect(applyContribution(totals, b, b)).toEqual(totals);
    expect(applyContribution(totals, b, contribution()).count).toBe(0);
  });
  it("excludes invalid ratings and detects corrupt negative aggregates", () => {
    expect(contribution({ status: "approved", rating: 0 }).active).toBe(false);
    expect(() => applyContribution(emptyTotals(), contribution({ status: "approved", rating: 5 }), contribution())).toThrow("REVIEW_AGGREGATE_DRIFT");
  });
});
