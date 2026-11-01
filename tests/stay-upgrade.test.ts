import { describe, it, expect } from "vitest";
import {
  offeringSchema,
  offeringCategory,
  travelerPreferencesSchema,
  type Offering,
} from "@/lib/stay/contracts";
import {
  selectedRequests,
  extraTotals,
  canEditRequest,
} from "@/lib/stay/domain";
import { billableUnits } from "@/lib/stay/pricing";
import {
  recommendedOfferings,
  propertyAllowsPets,
} from "@/lib/stay/recommendations";
import {
  requestAmountLabel,
  assertLiveQuote,
  quotedPrice,
  requestLabel,
  supplementalFinancials,
} from "@/lib/stay/agreements";
import { searchTemplates } from "@/lib/stay/templates";
const startAt = "2027-01-03T08:30:00Z",
  endAt = "2027-01-05T05:30:00Z",
  now = Date.parse("2027-01-01T08:30:00Z");
const o: Offering = {
  id: "pillow",
  propertyId: "hotel",
  version: 1,
  name: "Extra pillow",
  description: "Additional pillow",
  kind: "item",
  travelerCategories: [],
  roomTypeIds: [],
  bookingModes: ["hourly", "overnight"],
  unitPricePaise: 15000,
  maxQuantity: 3,
  advanceNoticeMinutes: 60,
  confirmation: "approval",
  variants: [],
  status: "active",
};
const context = { startAt, endAt, nights: 2, adults: 2, children: 1 };
const select = (offer = o, inputs = {}) =>
  selectedRequests(
    [offer],
    [{ offeringId: o.id, variantId: null, quantity: 1, inputs }],
    "room",
    "overnight",
    startAt,
    null,
    now,
    context,
  )[0];
describe("upgraded stay agreements", () => {
  it("excludes new approval prices from checkout but retains legacy and immediate extras", () => {
    const r = select();
    expect(r).toMatchObject({
      agreementVersion: 2,
      totalPaise: 15000,
      settlement: "pending_hotel",
      status: "requested",
    });
    expect(extraTotals(100000, 25000, "deposit", [r])).toMatchObject({
      totalPaise: 100000,
      payableNowPaise: 25000,
    });
    expect(
      extraTotals(100000, 25000, "deposit", [
        { ...r, agreementVersion: undefined },
      ]).payableNowPaise,
    ).toBe(40000);
    expect(
      extraTotals(100000, 25000, "deposit", [
        select({ ...o, confirmation: "immediate" }),
      ]).payableNowPaise,
    ).toBe(40000);
  });
  it.each([
    ["item", 2],
    ["package", 2],
    ["stay", 2],
    ["night", 4],
    ["person", 6],
    ["hour", 90],
  ] as const)("calculates %s", (pricingUnit, expected) => {
    expect(billableUnits({ ...o, pricingUnit }, 2, {}, context)).toBe(expected);
  });
  it("uses participating people and explicit hours; validates stay bounds", () => {
    expect(
      billableUnits({ ...o, pricingUnit: "person" }, 1, { people: 2 }, context),
    ).toBe(2);
    expect(() =>
      billableUnits({ ...o, pricingUnit: "person" }, 1, { people: 4 }, context),
    ).toThrow("People cannot exceed");
    expect(() =>
      billableUnits(
        { ...o, pricingUnit: "night" },
        1,
        {},
        { ...context, nights: 0 },
      ),
    ).toThrow("overnight");
    expect(
      billableUnits({ ...o, pricingUnit: "hour" }, 1, { hours: 3 }, context),
    ).toBe(3);
    expect(() =>
      billableUnits({ ...o, pricingUnit: "hour" }, 1, { hours: 46 }, context),
    ).toThrow("within");
  });
  it("checks required notes, independent choice dimensions and service time", () => {
    const configured = {
      ...o,
      formType: "scheduled" as const,
      noteLabel: "Pickup",
      noteRequired: true,
      choiceGroups: [
        { id: "car", name: "Car", required: true, options: ["Sedan"] },
      ],
    };
    expect(() => select(configured)).toThrow("Pickup");
    expect(() =>
      select(configured, {
        note: "Airport",
        serviceAt: endAt,
        choices: { car: "Sedan" },
      }),
    ).toThrow("within");
    expect(() =>
      select(configured, {
        note: "Airport",
        serviceAt: startAt,
        choices: { car: "Van" },
      }),
    ).toThrow("Car");
    expect(
      select(configured, {
        note: "Airport",
        serviceAt: startAt,
        choices: { car: "Sedan" },
      }).inputs?.choices,
    ).toEqual({ car: "Sedan" });
  });
  it("keeps pet offerings gated by explicit policy and included amenities unsellable", () => {
    expect(propertyAllowsPets({ petPolicy: { allowed: true } })).toBe(true);
    expect(propertyAllowsPets({ amenities: ["pets"] })).toBe(false);
    expect(
      propertyAllowsPets({ petPolicy: { allowed: false }, petsAllowed: true }),
    ).toBe(false);
    expect(() => select({ ...o, category: "pets" })).toThrow("pet requests");
    expect(() =>
      selectedRequests(
        [{ ...o, includedAmenityCode: "breakfast" }],
        [{ offeringId: o.id, variantId: null, quantity: 1 }],
        "room",
        "overnight",
        startAt,
        null,
        now,
        { ...context, includedCodes: ["breakfast"] },
      ),
    ).toThrow("already included");
  });
  it("uses small deterministic diverse recommendations without filtering away other trip types", () => {
    const catalog = Array.from({ length: 47 }, (_, i) => ({
      ...o,
      id: String(i),
      name: `Option ${i}`,
      travelerCategories: i === 20 ? ["Business" as const] : [],
    }));
    expect(recommendedOfferings(catalog, ["Business"])).toHaveLength(8);
    expect(recommendedOfferings(catalog, ["Business"])[0].id).toBe("20");
    expect(recommendedOfferings(catalog, [], 100)).toHaveLength(10);
  });
  it("maps old categories and preserves multiple saved traveler preferences", () => {
    expect(offeringCategory({ ...o, category: "devices" })).toBe("technology");
    expect(offeringCategory({ ...o, category: "room_essentials" })).toBe(
      "comfort",
    );
    expect(
      travelerPreferencesSchema.parse(["Family", "Business", "Solo"]),
    ).toEqual(["Family", "Business", "Solo"]);
  });
  it("creates editable template drafts and rejects irrelevant fields on simple preferences", () => {
    expect(searchTemplates("cake").map((x) => x.draft.name)).toEqual([
      "Birthday Cake",
      "Celebration Cake",
    ]);
    expect(searchTemplates("charger")[0].draft.formType).toBe("variants");
    const input = Object.fromEntries(
      Object.entries(o).filter(
        ([key]) => !["id", "propertyId", "version"].includes(key),
      ),
    );
    expect(
      offeringSchema.safeParse({ ...input, formType: "simple", maxQuantity: 3 })
        .success,
    ).toBe(false);
  });
  it("saves package inclusions independently from later catalog edits", () => {
    const packageOffering = {
      ...o,
      formType: "package" as const,
      pricingUnit: "package" as const,
      variants: [
        {
          id: "premium",
          name: "Premium",
          inclusions: "Flowers and cake",
          unitPricePaise: 25000,
        },
      ],
    };
    const [saved] = selectedRequests(
      [packageOffering],
      [{ offeringId: o.id, variantId: "premium", quantity: 1 }],
      "room",
      "overnight",
      startAt,
      null,
      now,
      context,
    );
    packageOffering.variants[0].inclusions = "Flowers only";
    expect(saved).toMatchObject({
      variantInclusions: "Flowers and cake",
      variantName: "Premium",
      totalPaise: 25000,
    });
  });
  it("labels unlisted placeholders, agreed free requests and final quote amounts accurately", () => {
    const r = { ...select(), source: "unlisted" as const, totalPaise: 0 };
    expect(requestAmountLabel(r)).toBe("Awaiting quote");
    expect(requestAmountLabel({ ...r, status: "declined" })).toBe(
      "Not charged",
    );
    expect(
      supplementalFinancials([
        {
          ...r,
          status: "cancelled",
          settlement: "awaiting_payment",
          quote: {
            version: 1,
            amountPaise: 25000,
            scope: "Service",
            conditions: "All charges included",
            expiresAt: endAt,
            status: "accepted",
          },
        },
      ]).awaitingPaymentPaise,
    ).toBe(0);
    expect(
      requestAmountLabel({ ...r, settlement: "included", status: "preparing" }),
    ).toBe("Free");
    expect(
      requestAmountLabel({
        ...r,
        quote: {
          version: 1,
          amountPaise: 25000,
          scope: "Service",
          conditions: "All charges included",
          expiresAt: endAt,
          status: "offered",
        },
      }),
    ).toBe("₹250");
  });
  it("expires/revokes exact-version acceptance and preserves quoted commitments from precheckin editing", () => {
    const r = quotedPrice(select(), {
      version: 2,
      amountPaise: 18000,
      scope: "One pillow",
      conditions: "All charges included",
      expiresAt: endAt,
      status: "offered",
    });
    expect(assertLiveQuote(r, 2, now).amountPaise).toBe(18000);
    expect(() => assertLiveQuote(r, 1, now)).toThrow("changed");
    expect(() => assertLiveQuote(r, 2, Date.parse(endAt))).toThrow("expired");
    expect(() =>
      assertLiveQuote(
        { ...r, quote: { ...r.quote!, status: "withdrawn" } },
        2,
        now,
      ),
    ).toThrow("withdrawn");
    expect(canEditRequest({ ...r, unitPricePaise: 0 }, now)).toBe(false);
    expect(requestLabel(r, now)).toBe("Awaiting your price acceptance");
    expect(
      supplementalFinancials([
        {
          ...r,
          settlement: "paid",
          quote: { ...r.quote!, paymentId: "payment", paymentStatus: "paid" },
        },
      ]),
    ).toMatchObject({ paidPaise: 18000, totalPaise: 18000 });
  });
});

describe("single-choice preference forms", () => {
  const aroma: Offering = { ...o, name: "Room Aroma", kind: "preference", formType: "choice", unitPricePaise: 0, maxQuantity: 1, confirmation: "approval", variants: [{ id: "rose", name: "Rose" }, { id: "vanilla", name: "Vanilla" }, { id: "lavender", name: "Lavender" }] };
  const requests = (selections: { offeringId: string; variantId: string; quantity: number }[]) => selectedRequests([aroma], selections, "room", "overnight", startAt, null, now, context);
  it("accepts one aroma without a quantity and preserves its selected label", () => {
    const { id: _id, propertyId: _propertyId, version: _version, ...input } = aroma;
    expect(offeringSchema.safeParse(input).success).toBe(true);
    expect(requests([{ offeringId: o.id, variantId: "lavender", quantity: 1 }])[0]).toMatchObject({ variantId: "lavender", variantName: "Lavender", quantity: 1, totalPaise: 0 });
    expect(offeringSchema.safeParse({ ...input, maxQuantity: 2 }).success).toBe(false);
    expect(offeringSchema.safeParse({ ...input, variants: [] }).success).toBe(false);
  });
  it("rejects multiple aromas, larger quantities and invalid choices", () => {
    expect(() => requests([{ offeringId: o.id, variantId: "rose", quantity: 1 }, { offeringId: o.id, variantId: "vanilla", quantity: 1 }])).toThrow();
    expect(() => requests([{ offeringId: o.id, variantId: "rose", quantity: 2 }])).toThrow("only be selected once");
    expect(() => requests([{ offeringId: o.id, variantId: "unknown", quantity: 1 }])).toThrow("valid customization option");
  });
  it("keeps a yes/no preference as a single request without variants", () => {
    const petals: Offering = { ...aroma, name: "Rose petals on the bed", formType: "simple", variants: [] };
    expect(selectedRequests([petals], [{ offeringId: o.id, variantId: null, quantity: 1 }], "room", "overnight", startAt, null, now, context)[0]).toMatchObject({ quantity: 1, totalPaise: 0 });
    expect(() => selectedRequests([petals], [{ offeringId: o.id, variantId: null, quantity: 2 }], "room", "overnight", startAt, null, now, context)).toThrow();
  });
});
