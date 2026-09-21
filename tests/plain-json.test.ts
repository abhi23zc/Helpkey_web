import { describe, expect, it } from "vitest";
import { toPlainJson } from "@/lib/api/plain";

describe("toPlainJson", () => {
  it("removes nested Firestore Timestamp prototypes before RSC hydration", () => {
    class TimestampLike {
      toDate() { return new Date("2026-09-22T00:00:00.000Z"); }
    }
    const result = toPlainJson({ onboarding: { currentStep: 2, completedSteps: [], lastSavedAt: new TimestampLike() } });
    expect(result).toEqual({ onboarding: { currentStep: 2, completedSteps: [], lastSavedAt: "2026-09-22T00:00:00.000Z" } });
    expect(Object.getPrototypeOf(result.onboarding)).toBe(Object.prototype);
  });
});
