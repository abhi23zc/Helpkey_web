import { describe, expect, it } from "vitest";
import {
  DEFAULT_POLICY,
  EMPTY_PROFILE,
  policySchema,
  overrideSchema,
  profileSchema,
  profileReadiness,
  resolvePolicy,
  scheduleSchema,
  maskTaxIdentifiers,
  supportingDocumentsValid,
} from "@/lib/finance/domain";
import { can, staffRoles } from "@/lib/partner/pms/domain";
describe("finance configuration", () => {
  it("lets Admin hotel overrides expand or replace global payment defaults", () => {
    for (const paymentOptions of [["advance_online"], ["pay_at_property"], ["full_online", "advance_online"]] as const) {
      const result = resolvePolicy(DEFAULT_POLICY, { paymentOptions: [...paymentOptions] });
      expect(result.effective.paymentOptions).toEqual(paymentOptions);
      expect(result.sources.paymentOptions).toBe("hotel");
    }
    expect(resolvePolicy(DEFAULT_POLICY, {}).effective.paymentOptions).toEqual(["full_online"]);
  });
  it("initializes conservative configuration without enabling transfers", () => {
    expect(policySchema.parse(DEFAULT_POLICY)).toEqual(DEFAULT_POLICY);
    expect(DEFAULT_POLICY.roomCommissionBps).toBe(1000);
    expect(DEFAULT_POLICY.dues.limitPaise).toBe(200000);
    expect(DEFAULT_POLICY.payoutSchedule).toEqual({
      kind: "weekdays",
      weekdays: [1],
      localTime: "10:00",
      timezone: "Asia/Kolkata",
    });
    expect(profileReadiness(EMPTY_PROFILE, false).payoutsEnabled).toBe(false);
  });
  it("inherits by group, clears overrides and follows future globals", () => {
    const override = {
      dues: { limitPaise: 300000, warningBps: 7500 },
      roomCommissionBps: 500,
    };
    const first = resolvePolicy(DEFAULT_POLICY, override);
    expect(first.effective.dues).toEqual(override.dues);
    expect(first.sources.dues).toBe("hotel");
    expect(first.sources.advance).toBe("global");
    expect(
      resolvePolicy({ ...DEFAULT_POLICY, roomCommissionBps: 1800 }, override)
        .effective.roomCommissionBps,
    ).toBe(500);
    expect(
      resolvePolicy({ ...DEFAULT_POLICY, roomCommissionBps: 1800 }, {})
        .effective.roomCommissionBps,
    ).toBe(1800);
    expect(overrideSchema.safeParse({ dues: { limitPaise: 1 } }).success).toBe(
      false,
    );
  });
  it("validates integer paise/basis points, choices and approval", () => {
    for (const input of [
      { roomCommissionBps: 10001 },
      { roomCommissionBps: -1 },
      { minimumPayoutPaise: 0.5 },
      { paymentOptions: [] },
      { paymentOptions: ["full_online", "full_online"] },
      { approval: "automatic" },
    ])
      expect(
        policySchema.safeParse({ ...DEFAULT_POLICY, ...input }).success,
      ).toBe(false);
    expect(
      policySchema.safeParse({
        ...DEFAULT_POLICY,
        advance: { kind: "fixed", amountPaise: 100 },
      }).success,
    ).toBe(true);
  });
  it("represents schedules with valid times, weekdays and local anchors", () => {
    expect(
      scheduleSchema.safeParse({
        kind: "daily",
        localTime: "23:59",
        timezone: "Asia/Kolkata",
      }).success,
    ).toBe(true);
    const s = {
      kind: "interval",
      everyDays: 3,
      anchorDate: "2026-11-21",
      localTime: "10:00",
      timezone: "Asia/Kolkata",
    };
    expect(scheduleSchema.safeParse(s).success).toBe(true);
    for (const patch of [
      { everyDays: 0 },
      { anchorDate: "2026-02-30" },
      { anchorDate: undefined },
      { localTime: "24:00" },
      { timezone: "invalid" },
    ])
      expect(scheduleSchema.safeParse({ ...s, ...patch }).success).toBe(false);
  });
  it("allows explicit drafts but requires business identity and documents to submit", () => {
    expect(profileSchema.parse(EMPTY_PROFILE)).toEqual(EMPTY_PROFILE);
    expect(profileReadiness(EMPTY_PROFILE, false).canSubmit).toBe(false);
    const p = {
      ...EMPTY_PROFILE,
      legalPayeeName: "Hotel Ltd",
      businessAddress: "New Delhi",
      businessEmail: "hotel@example.com",
      businessPhone: "9876543210",
      pan: "ABCDE1234F",
      documentIds: ["doc"],
    };
    expect(profileReadiness(p, true, true)).toMatchObject({
      canSubmit: true,
      agreementAcceptance: true,
      manualReview: true,
      providerVerification: "not_started",
      payoutsEnabled: false,
    });
    expect(
      profileReadiness({ ...p, gstStatus: "registered" }, true).canSubmit,
    ).toBe(false);
    expect(
      profileSchema.safeParse({
        ...p,
        gstin: "27BBBBB1234B1Z5",
        gstStatus: "registered",
      }).success,
    ).toBe(false);
  });
  it("keeps finance owner-only across every staff role", () => {
    expect(can("owner", "finance.read")).toBe(true);
    expect(can("owner", "finance.profile.manage")).toBe(true);
    for (const role of staffRoles)
      for (const permission of [
        "finance.read",
        "finance.profile.manage",
      ] as const)
        expect(can(role, permission)).toBe(false);
  });
  it("requires every selected document to remain available to the same hotel", () => {
    const p = { ...EMPTY_PROFILE, documentIds: ["pan", "license"] };
    const documents = [
      { id: "pan", propertyId: "hotel" },
      { id: "license", propertyId: "hotel", status: "pending" },
    ];
    expect(supportingDocumentsValid(p, "hotel", documents)).toBe(true);
    expect(supportingDocumentsValid(p, "hotel", documents.slice(1))).toBe(false);
    for (const change of [
      { deletedAt: "2026-11-21" },
      { propertyId: "another-hotel" },
      { status: "rejected" },
    ]) {
      expect(supportingDocumentsValid(p, "hotel", [
        { ...documents[0], ...change }, documents[1],
      ])).toBe(false);
    }
    expect(supportingDocumentsValid(EMPTY_PROFILE, "hotel", documents)).toBe(false);
    expect(profileReadiness(p, true, true, false)).toMatchObject({
      documents: false, manualReview: false, canSubmit: false, payoutsEnabled: false,
    });
  });
  it("masks identifiers recursively in general history", () => {
    expect(
      maskTaxIdentifiers({
        previous: { profile: { pan: "ABCDE1234F", gstin: "27ABCDE1234F1Z5" } },
        next: [{ pan: "" }],
      }),
    ).toEqual({
      previous: { profile: { pan: "••••234F", gstin: "••••F1Z5" } },
      next: [{ pan: "" }],
    });
  });
});
