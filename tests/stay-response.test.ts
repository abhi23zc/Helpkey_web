import { describe, it, expect } from "vitest";
import { offeringSchema, type Offering, type Selection } from "@/lib/stay/contracts";
import { resolveResponse, replaceSelection, responseLimit } from "@/lib/stay/response";
import { selectedRequests, validateResponseInputs } from "@/lib/stay/domain";
const now = Date.parse("2027-01-01T00:00Z"), startAt = "2027-01-03T00:00:00Z";
const base: Offering = { id: "aroma", propertyId: "hotel", version: 1, name: "Room aroma", description: "Choose your preferred room aroma", kind: "preference", travelerCategories: ["Couple"], roomTypeIds: [], bookingModes: ["overnight"], unitPricePaise: 70050, maxQuantity: 3, advanceNoticeMinutes: 0, confirmation: "approval", variants: [{ id: "rose", name: "Rose" }, { id: "vanilla", name: "Vanilla", unitPricePaise: 10000 }, { id: "lavender", name: "Lavender", unitPricePaise: 0 }], status: "active" };
const selections = (...ids: string[]): Selection[] => ids.map(variantId => ({ offeringId: base.id, variantId, quantity: 1 }));
const requests = (o: Offering, selected: Selection[]) => selectedRequests([o], selected, "room", "overnight", startAt, null, now);
describe("universal offering responses", () => {
  for (const responseType of ["yes_no", "single", "multiple", "text"] as const) {
    for (const quantityEnabled of [false, true]) {
      it(`accepts independent ${responseType} and quantity ${quantityEnabled}`, () => {
        const o = { ...base, responseConfig: { responseType, quantityEnabled }, variants: ["single", "multiple"].includes(responseType) ? base.variants : [], maxQuantity: quantityEnabled || responseType === "multiple" ? 3 : 1 };
        const input = Object.fromEntries(Object.entries(o).filter(([key]) => !["id", "propertyId", "version"].includes(key)));
        expect(offeringSchema.safeParse(input).success).toBe(true);
        const selection = { offeringId: base.id, variantId: o.variants[0]?.id ?? null, quantity: quantityEnabled ? 2 : 1, ...(responseType === "text" ? { inputs: { note: "Please prepare before arrival" } } : {}) };
        expect(requests(o, [selection])[0].quantity).toBe(selection.quantity);
        if (!quantityEnabled) expect(() => requests(o, [{ ...selection, quantity: 2 }])).toThrow("only be selected once");
      });
    }
  }
  it("switches one aroma atomically but keeps other offerings", () => {
    const o: Offering = { ...base, maxQuantity: 1, responseConfig: { responseType: "single", quantityEnabled: false } };
    const old = [...selections("rose"), { offeringId: "petals", variantId: null, quantity: 1 }];
    const next = replaceSelection(old, o, "vanilla", 1);
    expect(next.map(s => s.variantId)).toEqual([null, "vanilla"]);
    expect(() => requests(o, selections("rose", "vanilla"))).toThrow("only one option");
    expect(replaceSelection(next, o, "vanilla", 0)).toEqual([old[1]]);
  });
  it("sums multiple option prices and enforces the shared quantity limit", () => {
    const o: Offering = { ...base, responseConfig: { responseType: "multiple", quantityEnabled: false } };
    expect(requests(o, selections("rose", "vanilla", "lavender")).reduce((sum, r) => sum + r.totalPaise, 0)).toBe(80050);
    const limited = { ...o, maxQuantity: 2 };
    expect(() => requests(limited, selections("rose", "vanilla", "lavender"))).toThrow("at most 2");
    const quantities = { ...o, responseConfig: { responseType: "multiple" as const, quantityEnabled: true } };
    expect(requests(quantities, [{ ...selections("rose")[0], quantity: 2 }, ...selections("vanilla")])).toHaveLength(2);
    expect(() => requests(quantities, [{ ...selections("rose")[0], quantity: 3 }, ...selections("vanilla")])).toThrow("at most 3");
  });
  it("requires selected text, rejects unknown options and snapshots response rules", () => {
    const o: Offering = { ...base, variants: [], responseConfig: { responseType: "text", quantityEnabled: false }, maxQuantity: 1 };
    expect(() => requests(o, [{ offeringId: o.id, variantId: null, quantity: 1 }])).toThrow("Provide");
    expect(requests(o, [])).toEqual([]);
    const saved = requests(o, [{ offeringId: o.id, variantId: null, quantity: 1, inputs: { note: "Rose petals please" } }])[0];
    o.responseConfig!.responseType = "yes_no";
    expect(saved.requestRules?.responseConfig?.responseType).toBe("text");
    expect(() => validateResponseInputs({ ...saved.requestRules!, name: saved.name }, {}, startAt, now)).toThrow("Provide");
    expect(() => requests(base, selections("fake"))).toThrow("valid customization option");
  });
  it("keeps legacy forms unchanged, including quantity-bearing variants", () => {
    expect(resolveResponse(base)).toEqual({ responseType: "multiple", quantityEnabled: true });
    expect(responseLimit({ ...base, formType: "choice" })).toBe(1);
    expect(resolveResponse({ ...base, formType: "scheduled", variants: [] }).quantityEnabled).toBe(true);
    expect(requests(base, [{ ...selections("rose")[0], quantity: 2 }])[0].quantity).toBe(2);
  });
});
