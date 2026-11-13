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
  const offering: Offering = { ...value, variants: (value.formType === "package" || ["single", "multiple"].includes(resolveResponse(value).responseType)) ? value.variants : [], id: "preview", propertyId: "preview", version: 1 };
  const count = selections.reduce((sum, s) => sum + s.quantity, 0);
  const context = { startAt, endAt: new Date(Date.parse(startAt) + 2 * 86400000).toISOString(), nights: 2, adults: 2, children: 1 };
  let total: number | null = 0;
  try { total = selections.reduce((sum, s) => sum + variantPrice(offering, s.variantId) * billableUnits(offering, s.quantity, s.inputs, context), 0); } catch { total = null; }
  return (
    <div className="space-y-3.5 pt-1">
      <div className="flex items-center justify-between text-xs text-slate-500 pb-1">
        <span>Interactive guest simulator</span>
        <span className="text-[11px] font-medium text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded-full border border-amber-200/60">
          Live Guest Experience
        </span>
      </div>

      <div className="space-y-2.5">
        {(offering.variants.length ? offering.variants : [{ id: null, name: "Request" }]).map(option => {
          const selected = selections.find(s => s.variantId === option.id);
          const key = option.id ?? "request";
          return (
            <div key={key} className="space-y-3 rounded-xl border border-amber-200/80 bg-white p-4 shadow-2xs">
              <GuestInputFields
                offering={offering}
                timezone="Asia/Kolkata"
                value={drafts[key] ?? selected?.inputs}
                disabled={false}
                onChange={inputs => {
                  setDrafts(old => ({ ...old, [key]: inputs }));
                  setSelections(old => old.map(s => s.variantId === option.id ? { ...s, inputs } : s));
                }}
              />
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
                <div className="min-w-0">
                  <span className="text-xs font-bold text-slate-900 block truncate">
                    {option.name || "Default Option"}
                  </span>
                  <span className="text-xs font-medium text-amber-800">
                    {value.formType === "custom"
                      ? "Price upon hotel review"
                      : formatMoney(variantPrice(offering, option.id), currency)}
                    {value.unitPricePaise > 0 && offering.pricingUnit ? ` / ${offering.pricingUnit}` : ""}
                  </span>
                </div>
                <ResponseControls
                  offering={offering}
                  optionName={option.name || "Unnamed option"}
                  quantity={selected?.quantity ?? 0}
                  count={count}
                  onChange={quantity => {
                    const inputs = drafts[key] ?? selected?.inputs;
                    const missing = requiredResponseError(offering, inputs);
                    if (quantity && missing) { setError(missing); return; }
                    setError("");
                    setSelections(replaceSelection(selections, offering, option.id, quantity, inputs));
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {error && <p role="alert" className="text-xs text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200">{error}</p>}

      <div className="flex items-center justify-between rounded-xl bg-amber-100/60 border border-amber-200/80 p-3 text-xs">
        <span className="font-semibold text-slate-700">Simulated Total</span>
        <span className="font-bold text-sm text-[#061224]">
          {value.formType === "custom"
            ? "Quote upon review"
            : total === null
              ? "Select details"
              : formatMoney(total, currency)}
        </span>
      </div>

      {value.unitPricePaise > 0 && ["night", "person", "hour"].includes(value.pricingUnit ?? "") && (
        <p className="text-[11px] leading-relaxed text-slate-500">
          Simulation based on an example stay of 2 nights, 2 adults, 1 child. Final billing will dynamically match each guest&apos;s actual reservation parameters.
        </p>
      )}
    </div>
  );
}
