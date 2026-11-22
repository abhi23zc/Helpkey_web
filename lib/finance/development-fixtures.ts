import { taxRuleSchema, type TaxRule } from "./calculation";
/** Synthetic examples only. These percentages make no claim about applicable law. */
export function syntheticRules(): TaxRule[] {
  return ([
    ["accommodation", "overnight", "night_date"],
    ["accommodation", "hourly", "hourly_start"],
    ["food", "service", "fulfilment_date"],
    ["transport", "service", "fulfilment_date"],
    ["customer_fee", "service", "agreement_date"],
    ["cancellation", "service", "agreement_date"],
  ] as const).map(([category, mode, dateBasis]) => taxRuleSchema.parse({ id: `synthetic_${category}_${mode}`, version: 1, category, treatment: category === "cancellation" ? "exempt" : "percentage", reason: "Synthetic development example only", components: category === "cancellation" ? [] : [{ code: "example_a", basisPoints: 500 }, { code: "example_b", basisPoints: 500 }], serviceDateBasis: dateBasis, scope: { jurisdictions: ["example"], registrations: ["registered", "unregistered", "composition", "exempt"], bookingModes: [mode], profileKinds: ["example"], minimumTaxablePaise: 0, maximumTaxablePaise: null, effectiveFrom: "2026-01-01", effectiveThrough: "2030-12-31" }, legalReference: "SYNTHETIC ONLY — not a legal authority", reviewedBy: "development_fixture", reviewedAt: "2026-01-01T00:00:00.000Z", synthetic: true }));
}
