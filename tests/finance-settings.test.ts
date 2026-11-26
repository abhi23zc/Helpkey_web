import { describe, expect, it } from "vitest";
import { applyChanges, cappedFixedAdvance, policyErrors, policySchema, resolvePolicy, saveSchema, type Policy } from "@/lib/finance-settings/domain";

describe("finance settings domain", () => {
  it("keeps missing terms unconfigured and preserves valid zero terms", () => {
    const empty = resolvePolicy({});
    expect(empty.effective).toEqual({});
    expect(Object.values(empty.provenance).every(v => v === "unconfigured")).toBe(true);
    expect(policySchema.parse({ commissionBasisPoints: 0, minimumPayoutPaise: 0, duesLimit: { type: "limited", amountPaise: 0 } })).toMatchObject({ commissionBasisPoints: 0 });
    expect(resolvePolicy({ duesLimit: { type: "unlimited" } }).effective.duesLimit).toEqual({ type: "unlimited" });
  });
  it("inherits independently, preserves overrides on global changes, and removes only selected overrides", () => {
    const global: Policy = { commissionBasisPoints: 1000, payoutDelayDays: 3 };
    const overrides: Policy = { commissionBasisPoints: 1200 };
    expect(resolvePolicy(global, overrides)).toMatchObject({ effective: { commissionBasisPoints: 1200, payoutDelayDays: 3 }, provenance: { commissionBasisPoints: "overridden", payoutDelayDays: "inherited", payoutCycle: "unconfigured" } });
    expect(resolvePolicy({ ...global, commissionBasisPoints: 1100 }, overrides).effective.commissionBasisPoints).toBe(1200);
    const removed = applyChanges(overrides, { changes: {}, remove: ["commissionBasisPoints"] });
    expect(resolvePolicy({ ...global, commissionBasisPoints: 1100 }, removed).effective.commissionBasisPoints).toBe(1100);
  });
  it.each([
    { commissionBasisPoints: -1 }, { commissionBasisPoints: 10001 }, { commissionBasisPoints: 0.1 },
    { minimumPayoutPaise: -1 }, { minimumPayoutPaise: 1_000_000_001 },
    { payoutDelayDays: -1 }, { payoutDelayDays: 1.5 }, { payoutDelayDays: 366 },
    { duesGraceDays: -1 }, { duesGraceDays: 0.1 },
    { advance: { type: "fixed", amountPaise: 0 } }, { advance: { type: "fixed", amountPaise: -1 } },
    { advance: { type: "percentage", basisPoints: 99 } }, { advance: { type: "percentage", basisPoints: 10001 } },
    { guestPaymentOptions: [] }, { guestPaymentOptions: ["invalid"] },
    { guestPaymentOptions: ["at_hotel", "at_hotel"] }, { eligibleExtraCategories: ["comfort", "comfort"] },
    { eligibleExtraCategories: ["invented"] }, { duesLimit: { type: "limited", amountPaise: -1 } },
    { unknown: true },
  ])("rejects invalid term %j", value => expect(policySchema.safeParse(value).success).toBe(false));
  it("accepts documented upper boundaries and all supported term types", () => {
    expect(policySchema.safeParse({ commissionBasisPoints: 10000, commissionBasis: "rooms_and_extras", eligibleExtraCategories: ["food_drinks"], marketplaceCommission: true, directCommission: false, walkInCommission: false, guestPaymentOptions: ["full_online", "partial_advance", "at_hotel"], advance: { type: "percentage", basisPoints: 10000 }, payoutDelayDays: 365, payoutCycle: "weekly", payoutWeekday: "monday", minimumPayoutPaise: 1_000_000_000, duesLimit: { type: "limited", amountPaise: 1_000_000_000 }, duesWarningPaise: 1_000_000_000, duesGraceDays: 365 }).success).toBe(true);
  });
  it("validates dependent terms after inheritance", () => {
    expect(policyErrors({ guestPaymentOptions: ["partial_advance"] })[0]).toContain("advance");
    expect(policyErrors({ payoutCycle: "weekly" })[0]).toContain("weekday");
    expect(policyErrors({ commissionBasis: "rooms_and_extras" })[0]).toContain("extra category");
    expect(policyErrors({ duesLimit: { type: "limited", amountPaise: 0 }, duesWarningPaise: 1 })[0]).toContain("cannot exceed");
    expect(policyErrors({ duesLimit: { type: "limited", amountPaise: 100 }, duesWarningPaise: 100 })).toEqual([]);
    expect(policyErrors(resolvePolicy({ advance: { type: "fixed", amountPaise: 100 }, payoutWeekday: "monday" }, { guestPaymentOptions: ["partial_advance"], payoutCycle: "weekly" }).values)).toEqual([]);
  });
  it("keeps inactive requirements out of the effective policy", () => {
    const resolved = resolvePolicy({ guestPaymentOptions: ["full_online"], advance: { type: "percentage", basisPoints: 1000 }, payoutCycle: "daily", payoutWeekday: "monday", commissionBasis: "rooms", eligibleExtraCategories: ["food_drinks"] });
    expect(resolved.effective).toEqual({ guestPaymentOptions: ["full_online"], payoutCycle: "daily", commissionBasis: "rooms" });
    expect(resolved.values.advance).toBeDefined();
  });
  it("caps future fixed advances at the amount owed", () => {
    expect(cappedFixedAdvance(50000, 20000)).toBe(20000);
    expect(cappedFixedAdvance(50000, 80000)).toBe(50000);
    expect(cappedFixedAdvance(50000, 0)).toBe(0);
  });
  it("requires a reason, revisions, request identity and unambiguous mutations", () => {
    const input = { changes: { commissionBasisPoints: 0 }, remove: [], expectedRevision: 0, expectedGlobalRevision: 0, reason: "Initial agreement", requestId: crypto.randomUUID() };
    expect(saveSchema.safeParse(input).success).toBe(true);
    expect(saveSchema.safeParse({ ...input, reason: " " }).success).toBe(false);
    expect(saveSchema.safeParse({ ...input, remove: ["commissionBasisPoints"] }).success).toBe(false);
    expect(saveSchema.safeParse({ ...input, expectedRevision: -1 }).success).toBe(false);
  });
});
