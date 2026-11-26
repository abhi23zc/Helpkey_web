import { describe, expect, it } from "vitest";
import { cancellationLabel, cancellationTerms, guestScoreLabel } from "@/lib/customer/offer";
describe("customer offer claims", () => {
  const start = "2026-11-02T08:30:00Z", now = Date.parse("2026-11-01T08:29:00Z");
  it("requires a zero fee and an unexpired deadline for free cancellation", () => {
    const terms = cancellationTerms({ refundableUntilHours: 24, cancellationFeePercent: 0 }, start, now);
    expect(terms.freeCancellation).toBe(true);
    expect(terms.deadline).toBe("2026-11-01T08:30:00.000Z");
    expect(cancellationLabel(terms, "Asia/Kolkata", now)).toContain("Free cancellation until");
    expect(cancellationLabel(terms, "Asia/Kolkata", now + 61_000)).toBeNull();
    expect(cancellationTerms({ refundableUntilHours: 24, cancellationFeePercent: 20 }, start, now).freeCancellation).toBe(false);
    expect(cancellationTerms({ refundableUntilHours: 24, cancellationFeePercent: 0 }, start, now + 61_000).freeCancellation).toBe(false);
  });
  it("makes no promise for missing, malformed, or incomplete policies", () => {
    for (const policy of [null, {}, { refundableUntilHours: 0 }, { refundableUntilHours: -1, cancellationFeePercent: 0 }, { refundableUntilHours: "24", cancellationFeePercent: 0 }]) {
      expect(cancellationTerms(policy, start, now).freeCancellation).toBe(false);
    }
    expect(cancellationTerms({ refundableUntilHours: 0, cancellationFeePercent: 0 }, "", now).freeCancellation).toBe(false);
  });
  it("does not describe poor guest ratings as very good", () => {
    expect(guestScoreLabel(2)).toBe("Guest rating");
    expect(guestScoreLabel(3.5)).toBe("Good");
    expect(guestScoreLabel(4)).toBe("Very good");
    expect(guestScoreLabel(4.8)).toBe("Exceptional");
  });
});
