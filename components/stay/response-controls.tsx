"use client";
import { Minus, Plus } from "lucide-react";
import type { OfferingInput } from "@/lib/stay/contracts";
import { resolveResponse, responseLimit } from "@/lib/stay/response";

/** Shared controls for checkout, pre-arrival edits and the owner preview. */
export function ResponseControls({ offering, optionName, quantity, count, onChange, disabled = false, blockIncrease = false, legacySelect = false }: {
  offering: OfferingInput; optionName: string; quantity: number; count: number;
  onChange: (quantity: number) => void; disabled?: boolean; blockIncrease?: boolean; legacySelect?: boolean;
}) {
  const config = resolveResponse(offering);
  const single = config.responseType === "single";
  const atLimit = count >= responseLimit(offering) && !(single && quantity === 0 && count > 0);
  const cannotAdd = disabled || blockIncrease || atLimit;
  const title = `${offering.name} ${optionName}`;
  if (!config.quantityEnabled) {
    if (config.responseType === "multiple") return <label className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><input type="checkbox" checked={quantity > 0} disabled={disabled || (!quantity && cannotAdd)} onChange={e => onChange(e.target.checked ? 1 : 0)} />Select {optionName}</label>;
    return <button type="button" aria-pressed={quantity > 0} disabled={disabled || (!quantity && cannotAdd)} onClick={() => onChange(quantity ? 0 : 1)} className={`hk-extra-chip rounded-lg border px-3 py-2 text-xs font-semibold ${quantity ? "border-[#061224] bg-[#061224] text-white" : "border-slate-200 bg-white text-slate-700"}`}>{single ? quantity ? "Selected · Remove" : `Choose ${optionName}` : quantity ? "Remove request" : "Request this"}</button>;
  }
  if (legacySelect && !offering.responseConfig) return <select aria-label={title} disabled={disabled} value={quantity} onChange={e => onChange(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white p-2">{Array.from({ length: Math.max(responseLimit(offering) - count + quantity, quantity) + 1 }, (_, n) => <option key={n} value={n} disabled={n > 0 && (blockIncrease || n > responseLimit(offering) - count + quantity)}>{n || "Not selected"}</option>)}</select>;
  return <div role="group" aria-label={title} className="flex items-center rounded-xl border border-slate-200">
    <button type="button" aria-label={`Remove one ${title}`} disabled={disabled || quantity === 0} onClick={() => onChange(quantity - 1)} className="grid h-11 w-11 place-items-center disabled:opacity-30"><Minus className="h-4 w-4" /></button>
    <output aria-label={`${title} quantity`} className="min-w-6 text-center text-sm font-semibold">{quantity}</output>
    <button type="button" aria-label={`Add one ${title}`} disabled={cannotAdd} onClick={() => onChange(quantity + 1)} className="grid h-11 w-11 place-items-center disabled:opacity-30"><Plus className="h-4 w-4" /></button>
  </div>;
}
