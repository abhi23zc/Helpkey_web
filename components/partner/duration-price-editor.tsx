"use client";

import { useState } from "react";
import type { DurationPrice } from "@/lib/booking/duration-pricing";

/** Shared by onboarding and the live room/rate editor. No suggested prices are saved. */
export function DurationPriceEditor({ initialPrices = [], onChange }: { initialPrices?: DurationPrice[]; onChange?: (prices: DurationPrice[]) => void }) {
  const [rows, setRows] = useState(() => initialPrices.length ? initialPrices.map(row => ({ hours: row.hours, price: String(row.pricePaise / 100) })) : [{ hours: 1, price: "" }]);
  const prices = rows.map(row => ({ hours: row.hours, pricePaise: Math.round(Number(row.price) * 100) }));
  function update(next: typeof rows) {
    setRows(next);
    onChange?.(next.map(row => ({ hours: row.hours, pricePaise: Math.round(Number(row.price) * 100) })));
  }
  const input = "mt-1 block w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
  return <fieldset className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <legend className="px-1 text-sm font-bold">Hourly duration prices</legend>
    <p className="text-xs text-slate-600">Enter the total room price for each stay length. For example, 1 hour ₹200 and 2 hours ₹300. Only priced durations can be booked. Taxes and fees are added separately.</p>
    <input type="hidden" name="durationPrices" value={JSON.stringify(prices)} />
    {rows.map((row, index) => <div key={index} className="flex items-end gap-2">
      <label className="min-w-0 flex-1 text-xs font-semibold">Hours<select aria-label={`Hours ${index + 1}`} value={row.hours} onChange={e => update(rows.map((r, i) => i === index ? { ...r, hours: Number(e.target.value) } : r))} className={input}>{Array.from({ length: 24 }, (_, i) => i + 1).map(hours => <option key={hours} value={hours} disabled={rows.some((r, i) => i !== index && r.hours === hours)}>{hours} {hours === 1 ? "hour" : "hours"}</option>)}</select></label>
      <label className="min-w-0 flex-1 text-xs font-semibold">Total price (₹)<input aria-label={`Total price ${index + 1}`} type="number" required min="0.01" step="0.01" value={row.price} onChange={e => update(rows.map((r, i) => i === index ? { ...r, price: e.target.value } : r))} className={input} /></label>
      <button type="button" disabled={rows.length === 1} onClick={() => update(rows.filter((_, i) => i !== index))} aria-label={`Remove duration ${index + 1}`} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40">Remove</button>
    </div>)}
    <button type="button" disabled={rows.length === 24} onClick={() => update([...rows, { hours: Array.from({ length: 24 }, (_, i) => i + 1).find(h => !rows.some(r => r.hours === h))!, price: "" }])} className="text-sm font-bold underline disabled:opacity-40">+ Add duration</button>
  </fieldset>;
}
