"use client";
import { useState } from "react";
import type { Offering, OfferingInput, Selection } from "@/lib/stay/contracts";
import { billableUnits, variantPrice } from "@/lib/stay/pricing";
import { replaceSelection, resolveResponse, requiredResponseError } from "@/lib/stay/response";
import { formatMoney } from "@/lib/customer/offer";
import { GuestInputFields } from "./guest-input-fields";
import { ResponseControls } from "./response-controls";

export function OfferingGuestPreview({ value, currency }: { value: OfferingInput; currency: string }) {
  const [selections, setSelections] = useState<Selection[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Selection["inputs"]>>({});
  const [error, setError] = useState("");
  const [startAt] = useState(() => new Date(Date.now() + 86400000).toISOString());
  const offering: Offering = { ...value, variants: ["single", "multiple"].includes(resolveResponse(value).responseType) ? value.variants : [], id: "preview", propertyId: "preview", version: 1 };
  const count = selections.reduce((sum, s) => sum + s.quantity, 0);
  const context = { startAt, endAt: new Date(Date.parse(startAt) + 2 * 86400000).toISOString(), nights: 2, adults: 2, children: 1 };
  let total: number | null = 0;
  try { total = selections.reduce((sum, s) => sum + variantPrice(offering, s.variantId) * billableUnits(offering, s.quantity, s.inputs, context), 0); } catch { total = null; }
  return <div className="space-y-3 border-t border-amber-100 pt-3">
    <p className="text-xs text-slate-500">Try the guest form. This example does not create a request.</p>
    {(offering.variants.length ? offering.variants : [{ id: null, name: "Request" }]).map(option => {
      const selected = selections.find(s => s.variantId === option.id);
      const key = option.id ?? "request";
      return <div key={key} className="space-y-2 rounded-lg bg-white p-3">
        <GuestInputFields offering={offering} timezone="Asia/Kolkata" value={drafts[key] ?? selected?.inputs} disabled={false} onChange={inputs => { setDrafts(old => ({ ...old, [key]: inputs })); setSelections(old => old.map(s => s.variantId === option.id ? { ...s, inputs } : s)); }} />
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs">{option.name || "Unnamed option"} · {value.formType === "custom" ? "Price after hotel review" : formatMoney(variantPrice(offering, option.id), currency)}</span><ResponseControls offering={offering} optionName={option.name || "Unnamed option"} quantity={selected?.quantity ?? 0} count={count} onChange={quantity => {
          const inputs = drafts[key] ?? selected?.inputs;
          const missing = requiredResponseError(offering, inputs);
          if (quantity && missing) { setError(missing); return; }
          setError(""); setSelections(replaceSelection(selections, offering, option.id, quantity, inputs));
        }} /></div>
      </div>;
    })}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    <p className="text-xs font-semibold">Example total: {value.formType === "custom" ? "Confirmed by hotel quote" : total === null ? "Choose valid service details" : formatMoney(total, currency)}</p>
    {value.unitPricePaise > 0 && ["night", "person", "hour"].includes(value.pricingUnit ?? "") && <p className="text-xs text-slate-500">Example stay: 2 nights, 2 adults and 1 child. Service times use Asia/Kolkata. Final charges follow the guest’s actual stay and selections.</p>}
  </div>;
}
