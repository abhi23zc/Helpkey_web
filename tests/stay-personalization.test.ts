import { describe, expect, it } from "vitest";
import {
  offeringSchema,
  selectionsSchema,
  type Offering,
} from "@/lib/stay/contracts";
import {
  agreedRequests,
  assertRequestTransition,
  canEditRequest,
  eligibleOffering,
  extraTotals,
  selectedRequests,
  stayFinancials,
  remainingCancellationRefund,
} from "@/lib/stay/domain";
import { bookingInput } from "@/lib/booking/contracts";
const now = Date.parse("2026-11-01T10:00:00Z"),
  start = "2026-11-02T10:00:00Z";
const offering: Offering = {
  id: "adapter",
  propertyId: "hotel",
  version: 1,
  name: "Charging adapter",
  description: "A charging adapter for your device",
  kind: "item",
  travelerCategories: ["Business"],
  roomTypeIds: ["room"],
  bookingModes: ["overnight"],
  unitPricePaise: 20000,
  maxQuantity: 2,
  advanceNoticeMinutes: 60,
  confirmation: "approval",
  variants: [
    { id: "usb-c", name: "USB-C" },
    { id: "lightning", name: "Lightning" },
  ],
  status: "active",
};
function requests(o = offering, quantity = 1) {
  return selectedRequests(
    [o],
    [{ offeringId: o.id, variantId: "usb-c", quantity }],
    "room",
    "overnight",
    start,
    { name: "Flexible" },
    now,
  );
}
describe("stay personalization contracts and eligibility", () => {
  it("accepts free room preferences only with hotel approval", () => {
    const input = Object.fromEntries(
      Object.entries(offering).filter(
        ([key]) => !["id", "propertyId", "version"].includes(key),
      ),
    );
    expect(
      offeringSchema.safeParse({ ...input, kind: "preference" }).success,
    ).toBe(false);
    expect(
      offeringSchema.safeParse({
        ...input,
        kind: "preference",
        unitPricePaise: 0,
        confirmation: "approval",
      }).success,
    ).toBe(true);
    expect(
      offeringSchema.safeParse({
        ...input,
        variants: [
          { id: "x", name: "A" },
          { id: "x", name: "B" },
        ],
      }).success,
    ).toBe(false);
  });
  it("excludes paused, wrong-room, wrong-mode and expired options", () => {
    expect(eligibleOffering(offering, "room", "overnight", start, now)).toBe(
      true,
    );
    expect(
      eligibleOffering(
        { ...offering, status: "paused" },
        "room",
        "overnight",
        start,
        now,
      ),
    ).toBe(false);
    expect(eligibleOffering(offering, "other", "overnight", start, now)).toBe(
      false,
    );
    expect(eligibleOffering(offering, "room", "hourly", start, now)).toBe(
      false,
    );
    expect(
      eligibleOffering(
        offering,
        "room",
        "overnight",
        start,
        Date.parse(start) - 3600000,
      ),
    ).toBe(false);
    expect(
      eligibleOffering(
        { ...offering, roomTypeIds: [] },
        "other",
        "overnight",
        start,
        now,
      ),
    ).toBe(true);
  });
  it("validates variants and combined quantity limits", () => {
    expect(() =>
      selectedRequests(
        [offering],
        [{ offeringId: "adapter", variantId: "bad", quantity: 1 }],
        "room",
        "overnight",
        start,
        null,
        now,
      ),
    ).toThrow("valid customization option");
    expect(() =>
      selectedRequests(
        [offering],
        [
          { offeringId: "adapter", variantId: "usb-c", quantity: 2 },
          { offeringId: "adapter", variantId: "lightning", quantity: 1 },
        ],
        "room",
        "overnight",
        start,
        null,
        now,
      ),
    ).toThrow("at most 2");
    expect(
      selectionsSchema.safeParse([
        { offeringId: "adapter", variantId: null, quantity: 1 },
        { offeringId: "adapter", variantId: null, quantity: 1 },
      ]).success,
    ).toBe(false);
  });
  it("keeps agreed terms independent from catalog and response changes", () => {
    const [r] = requests();
    expect(r).toMatchObject({
      name: "Charging adapter",
      variantName: "USB-C",
      offeringVersion: 1,
      totalPaise: 20000,
      status: "requested",
      deadlineAt: "2026-11-02T09:00:00.000Z",
      cancellationPolicy: { name: "Flexible" },
    });
    expect(agreedRequests([r])).toEqual(
      agreedRequests([
        {
          ...r,
          updatedAt: "later",
          status: "ready",
          preparationStarted: true,
          response: "Ready",
        },
      ]),
    );
    expect(agreedRequests([r])).not.toEqual(
      agreedRequests([{ ...r, unitPricePaise: 30000 }]),
    );
  });
  it("free requests lock at their deadline or once preparation starts", () => {
    const [r] = requests({ ...offering, unitPricePaise: 0 });
    expect(canEditRequest(r, now)).toBe(true);
    expect(canEditRequest({ ...r, preparationStarted: true }, now)).toBe(false);
    expect(canEditRequest(r, Date.parse(r.deadlineAt))).toBe(false);
    expect(canEditRequest({ ...r, status: "declined" }, now)).toBe(false);
    expect(canEditRequest(requests()[0], now)).toBe(false);
  });
  it("enforces the preparation state machine", () => {
    for (const [from, to] of [
      ["requested", "confirmed"],
      ["requested", "declined"],
      ["confirmed", "preparing"],
      ["preparing", "ready"],
      ["ready", "fulfilled"],
    ] as const)
      expect(() => assertRequestTransition(from, to)).not.toThrow();
    expect(() => assertRequestTransition("confirmed", "declined")).toThrow();
    expect(() => assertRequestTransition("ready", "requested")).toThrow();
    expect(() => assertRequestTransition("cancelled", "preparing")).toThrow();
  });
  it("keeps old checkout clients compatible and preferences optional", () => {
    const p = bookingInput.parse({
      propertySlug: "hotel",
      roomTypeId: "room",
      ratePlanId: "rate",
      checkIn: "2026-11-02",
      checkOut: "2026-11-03",
      adults: 1,
    });
    expect(p.customizationSelections).toEqual([]);
    expect(p.travelerPreferences).toEqual([]);
  });
});
describe("extra payment and refund accounting", () => {
  it.each([
    ["full", 100000, 120000],
    ["deposit", 25000, 45000],
    ["pay_at_property", 0, 0],
  ])(
    "%s payments preserve the room split and collect extras upfront",
    (mode, roomDue, due) => {
      expect(extraTotals(100000, roomDue, mode, requests())).toMatchObject({
        totalPaise: 120000,
        payableNowPaise: due,
        balanceDuePaise: 120000 - due,
      });
    },
  );
  it("a declined extra leaves the same room balance while its refund is pending or processed", () => {
    expect(
      stayFinancials({
        totalPaise: 120000,
        paidPaise: 45000,
        customizationCreditPaise: 20000,
        refundDuePaise: 20000,
      }),
    ).toEqual({
      effectiveTotalPaise: 100000,
      netPaidPaise: 25000,
      balanceDuePaise: 75000,
    });
    expect(
      stayFinancials({
        totalPaise: 120000,
        paidPaise: 45000,
        customizationCreditPaise: 20000,
        refundedPaise: 20000,
      }),
    ).toEqual({
      effectiveTotalPaise: 100000,
      netPaidPaise: 25000,
      balanceDuePaise: 75000,
    });
  });
  it("pay-at-property credits remove unpaid extras and cancelled bookings owe nothing", () => {
    expect(
      stayFinancials({
        totalPaise: 120000,
        paidPaise: 0,
        customizationCreditPaise: 20000,
      }).balanceDuePaise,
    ).toBe(100000);
    expect(
      stayFinancials({ totalPaise: 120000, bookingStatus: "cancelled" })
        .balanceDuePaise,
    ).toBe(0);
  });
});

describe("customization cancellation policy", () => {
  const base = {
    paidPaise: 45000,
    totalPaise: 120000,
    customizationCreditPaise: 20000,
    startAt: start,
    checkIn: "2026-11-02",
    cancellationPolicy: { refundableUntilHours: 0, cancellationFeePercent: 0 },
  };
  it("reserves only the room refund after a pending or processed extra refund", () => {
    expect(
      remainingCancellationRefund(
        { ...base, refundDuePaise: 20000 },
        now,
        false,
      ),
    ).toBe(25000);
    expect(
      remainingCancellationRefund(
        { ...base, refundedPaise: 20000 },
        now,
        false,
      ),
    ).toBe(25000);
  });
  it("applies cancellation fees to the remaining room commitment", () => {
    expect(
      remainingCancellationRefund(
        {
          ...base,
          refundDuePaise: 20000,
          cancellationPolicy: {
            refundableUntilHours: 0,
            cancellationFeePercent: 20,
          },
        },
        now,
        false,
      ),
    ).toBe(5000);
    expect(
      remainingCancellationRefund(
        { ...base, refundDuePaise: 20000 },
        Date.parse(start) + 1,
        false,
      ),
    ).toBe(0);
    expect(
      remainingCancellationRefund(
        { ...base, refundDuePaise: 20000 },
        Date.parse(start) + 1,
        true,
      ),
    ).toBe(25000);
  });
});

describe("variant final prices", () => {
  const input = offeringSchema.parse(Object.fromEntries(Object.entries(offering).filter(([key]) => !["id", "propertyId", "version"].includes(key))));
  it("resolves inherited, custom and explicitly free prices and snapshots mixed totals", async () => {
    const { variantPrice, offeringPriceLabel } = await import("@/lib/stay/pricing");
    const custom = { ...offering, variants: [{ id: "usb-c", name: "USB-C", unitPricePaise: 15000 }, { id: "lightning", name: "Lightning", unitPricePaise: 0 }] };
    expect(variantPrice(offering, "usb-c")).toBe(20000);
    expect(variantPrice({ ...offering, variants: [{ id: "usb-c", name: "USB-C", unitPricePaise: null }] }, "usb-c")).toBe(20000);
    expect(offeringPriceLabel(custom)).toBe("Free – ₹150");
    const saved = selectedRequests([custom], [{ offeringId: custom.id, variantId: "usb-c", quantity: 1 }, { offeringId: custom.id, variantId: "lightning", quantity: 1 }], "room", "overnight", start, null, now);
    expect(saved.map((r) => r.unitPricePaise).sort((a,b) => a-b)).toEqual([0, 15000]);
    expect(extraTotals(100000, 25000, "deposit", saved).payableNowPaise).toBe(40000);
    custom.variants[0].unitPricePaise = 99999;
    expect(saved.find((r) => r.variantId === "usb-c")?.totalPaise).toBe(15000);
  });
  it("preserves omitted overrides, clears null, and clears prices on preference conversion", async () => {
    const { mergeVariantPrices } = await import("@/lib/stay/pricing");
    const previous = { ...input, variants: [{ id: "usb-c", name: "USB-C", unitPricePaise: 12345 }] };
    expect(mergeVariantPrices(input, previous).variants[0].unitPricePaise).toBe(12345);
    expect(mergeVariantPrices({ ...input, variants: [{ id: "usb-c", name: "USB-C", unitPricePaise: null }] }, previous).variants[0].unitPricePaise).toBeNull();
    expect(mergeVariantPrices({ ...input, kind: "preference", unitPricePaise: 0 }, previous).variants.every((v) => v.unitPricePaise === null)).toBe(true);
  });
  it.each([-1, 0.5, 100000001, NaN, Infinity])("rejects invalid variant price %s", (price) => {
    expect(offeringSchema.safeParse({ ...input, variants: [{ id: "x", name: "Choice", unitPricePaise: price }] }).success).toBe(false);
  });
  it("rejects paid variants on room preferences", () => {
    expect(offeringSchema.safeParse({ ...input, kind: "preference", unitPricePaise: 0, variants: [{ id: "x", name: "Choice", unitPricePaise: 1 }] }).success).toBe(false);
  });
});
