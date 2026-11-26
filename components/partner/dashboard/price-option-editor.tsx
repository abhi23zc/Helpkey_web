"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Check, Moon, Clock3 } from "lucide-react";
import Link from "next/link";
import { DurationPriceEditor } from "@/components/partner/duration-price-editor";
import { eligiblePricing, validDurationPrices } from "@/lib/booking/duration-pricing";
import { calculateGuestPrice } from "@/lib/booking/domain";
import { formatPaise } from "@/lib/currency";
import { requestJson } from "@/lib/partner/upload-client";
import type { ListingRatePlan, ListingResponse } from "./use-property-listing";

const inputClass = "mt-1.5 block w-full min-w-0 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/10 disabled:bg-slate-50";
const sectionClass = "space-y-4 rounded-2xl border border-slate-200/70 bg-white p-4 sm:p-5";
const amount = (value: string) => /^\d+(\.\d{1,2})?$/.test(value.trim()) && Number.isSafeInteger(Math.round(Number(value) * 100)) ? Math.round(Number(value) * 100) : NaN;
const money = (value: number) => formatPaise(value, { withFractions: true });

export function PriceOptionEditor({ propertyId, roomTypeId, policies, rates, selectedRate: rate, selectRate, saving, setSaving, onMessage, onRateAdded, onRateUpdated, onDirty }: {
  propertyId: string; roomTypeId: string; policies: ListingResponse["policies"]; rates: ListingRatePlan[]; selectedRate: ListingRatePlan | null;
  selectRate: (id: string) => void; saving: boolean; setSaving: (value: boolean) => void; onMessage: (ok: boolean, text: string) => void;
  onRateAdded: (rate: ListingRatePlan) => void; onRateUpdated: (rate: ListingRatePlan) => void; onDirty: (dirty: boolean) => void;
}) {
  // The parent keys by option ID. Refreshing the same saved option must never replace a draft.
  const [form, setForm] = useState(() => ({
    name: rate?.name ?? "", mode: rate?.bookingMode === "hourly" ? "hourly" : "overnight",
    price: rate ? String(rate.basePricePaise / 100) : "", breakfast: rate?.breakfastIncluded ?? false,
    policy: rate?.cancellationPolicyId ?? policies[0]?.id ?? "", payment: rate?.paymentMode ?? "full", status: rate?.status ?? "active",
    tax: String((rate?.taxBasisPoints ?? 0) / 100), fee: String((rate?.customerFeePaise ?? 0) / 100), deposit: String((rate?.depositBasisPoints ?? 2500) / 100),
    minimum: String(rate?.minimumNights ?? 1), maximum: rate?.maximumNights ? String(rate.maximumNights) : "",
    durations: rate?.durationPrices ?? [], arrivalStart: rate?.arrivalWindow?.start ?? "00:00", arrivalEnd: rate?.arrivalWindow?.end ?? "23:59",
    opens: rate?.operatingWindow?.start ?? "00:00", closes: rate?.operatingWindow?.end ?? "00:00", midnight: rate?.allowMidnightCrossing ?? false,
  }));
  const [baseline, setBaseline] = useState(JSON.stringify(form));
  const dirty = JSON.stringify(form) !== baseline;
  const busy = useRef(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [exampleHours, setExampleHours] = useState(rate?.durationPrices?.[0]?.hours ?? 0);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function update<K extends keyof typeof form>(key: K, value: typeof form[K]) { setForm(current => ({ ...current, [key]: value })); }
  function switchOption(id: string) {
    if (saving || (id === (rate?.id ?? "new"))) return;
    if (!dirty || window.confirm("Discard unsaved changes to this price option?")) { onDirty(false); selectRate(id); }
  }
  const hourly = form.mode === "hourly";
  const minimum = Number(form.minimum), maximum = form.maximum.trim() ? Number(form.maximum) : null;
  const tax = amount(form.tax), fee = amount(form.fee), deposit = amount(form.deposit);
  const selectedDuration = form.durations.find(row => row.hours === exampleHours) ?? form.durations[0];
  let preview: ReturnType<typeof calculateGuestPrice> | null = null;
  const validNights = Number.isInteger(minimum) && minimum >= 1 && minimum <= 30 && (maximum === null || maximum >= minimum);
  try {
    if (hourly ? validDurationPrices(form.durations) : validNights && amount(form.price) > 0) {
      preview = calculateGuestPrice(hourly ? selectedDuration!.pricePaise : amount(form.price) * minimum, { taxBasisPoints: tax, customerFeePaise: fee, depositBasisPoints: form.payment === "deposit" ? deposit : undefined, paymentMode: form.payment });
    }
  } catch { /* Invalid fields have no misleading example. */ }
  const error = (key: string) => errors[key] ? <p role="alert" className="mt-1 text-xs text-rose-700">{errors[key]}</p> : null;
  const numberField = (key: "price" | "tax" | "fee" | "deposit" | "minimum" | "maximum", label: string) => <label className="block min-w-0 text-xs font-semibold text-slate-600">{label}<input type="number" step={key === "minimum" || key === "maximum" ? "1" : "0.01"} min={key === "minimum" ? 1 : 0} value={form[key]} onChange={event => update(key, event.target.value)} aria-invalid={!!errors[key]} className={inputClass} />{error(key)}</label>;
  async function submit() {
    if (busy.current || saving) return;
    const next: Record<string, string> = {};
    if (form.name.trim() && (form.name.trim().length < 2 || form.name.trim().length > 140)) next.name = "Use 2–140 characters for the price option name.";
    if (!hourly && !(amount(form.price) > 0)) next.price = "Enter a room price greater than ₹0, with up to two decimal places.";
    if (hourly && !validDurationPrices(form.durations)) next.durations = "Add a unique duration and a total price greater than ₹0 for each row.";
    if (!form.policy) next.policy = "Choose a cancellation policy.";
    if (!(tax >= 0 && tax <= 10000)) next.tax = "Enter a percentage from 0 to 100, with up to two decimal places.";
    if (!(fee >= 0)) next.fee = "Enter ₹0 or more, with up to two decimal places.";
    if (form.payment === "deposit" && !(deposit >= 0 && deposit <= 10000)) next.deposit = "Enter a percentage from 0 to 100, with up to two decimal places.";
    if (!hourly && (!Number.isInteger(minimum) || minimum < 1 || minimum > 365)) next.minimum = "Enter a whole number from 1 to 365.";
    if (!hourly && maximum !== null && (!Number.isInteger(maximum) || maximum < minimum || maximum > 365)) next.maximum = "Enter a whole number at least the minimum, up to 365, or leave blank.";
    if (hourly && (!form.arrivalStart || !form.arrivalEnd || form.arrivalStart > form.arrivalEnd)) next.times = "The latest check-in time must be after the earliest check-in time.";
    if (hourly && (!form.opens || !form.closes)) next.times = "Choose opening and closing times.";
    setErrors(next); setNotice("");
    if (Object.keys(next).length) return;
    const payload = {
      name: form.name.trim() || "Standard price", bookingMode: form.mode, pricingModel: hourly ? "duration" : "nightly",
      ...(hourly ? { durationPrices: form.durations, arrivalWindow: { start: form.arrivalStart, end: form.arrivalEnd }, operatingWindow: { start: form.opens, end: form.closes }, allowMidnightCrossing: form.midnight } : { minimumNights: minimum, maximumNights: maximum }),
      basePricePaise: hourly ? Math.min(...form.durations.map(row => row.pricePaise)) : amount(form.price),
      breakfastIncluded: form.breakfast, cancellationPolicyId: form.policy, paymentMode: form.payment,
      taxBasisPoints: tax, customerFeePaise: fee,
      ...(form.payment === "deposit" ? { depositBasisPoints: deposit } : {}),
    };
    busy.current = true; setSaving(true);
    try {
      const result = await requestJson<{ ratePlan: ListingRatePlan }>(`/api/partner/properties/${propertyId}/rate-plans${rate ? `/${rate.id}` : ""}`, rate ? { ...payload, status: form.status } : { ...payload, roomTypeId }, rate ? "PATCH" : "POST");
      if (!result.ratePlan) throw new Error("Could not confirm the saved price option. Please try again.");
      setBaseline(JSON.stringify(form)); onDirty(false);
      if (rate) onRateUpdated(result.ratePlan); else { onRateAdded(result.ratePlan); selectRate(result.ratePlan.id); }
      setNotice("Price option saved."); onMessage(true, "Price option saved.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setNotice(message && !/^[A-Z_]+$/.test(message) && !/code|\[|\{/.test(message) ? message : "Could not save the price option. Your changes are still here; please try again.");
    } finally { busy.current = false; setSaving(false); }
  }
  const summary = [tax > 0 && `${form.tax}% tax`, fee > 0 && `${money(fee)} per booking`, !hourly && (minimum > 1 || maximum !== null) && `${form.minimum}–${maximum ?? "no maximum"} nights`, hourly && `Check-in ${form.arrivalStart}–${form.arrivalEnd}`, hourly && (form.opens === form.closes ? "Available all day" : `Room use ${form.opens}–${form.closes}${form.closes < form.opens ? " next day" : ""}`), hourly && (form.midnight ? "Stays may continue past midnight" : "Stays must end before midnight"), rate?.eligibleWeekdays?.length && `Check-in days: ${rate.eligibleWeekdays.map(day => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(", ")}`, rate?.minimumAdvanceMinutes && `Book at least ${rate.minimumAdvanceMinutes} minutes ahead`, rate?.maximumAdvanceDays != null && `Book up to ${rate.maximumAdvanceDays} days ahead`, rate?.minimumDurationMinutes && rate.minimumDurationMinutes !== 15 && `Minimum ${rate.minimumDurationMinutes} minutes`, rate?.maximumDurationMinutes && rate.maximumDurationMinutes !== 1440 && `Maximum ${rate.maximumDurationMinutes} minutes`].filter(Boolean).join(" · ");
  return <div className="min-w-0 space-y-4">
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Price options</p>
      <div className="flex flex-wrap gap-2">
        {rates.filter(eligiblePricing).map(item => <button key={item.id} type="button" disabled={saving} onClick={() => switchOption(item.id)} className={`inline-flex max-w-full items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c] disabled:opacity-50 ${rate?.id === item.id ? "bg-[#092442] text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`} aria-pressed={rate?.id === item.id}>{rate?.id === item.id && <Check className="h-3 w-3 shrink-0" />}<span className="truncate">{item.name}</span></button>)}
        <button type="button" disabled={saving} onClick={() => switchOption("new")} className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-500 transition hover:border-[#092442] hover:text-[#092442] disabled:opacity-50"><Plus className="h-3 w-3" />New price option</button>
      </div>
    </div>
    <fieldset disabled={saving} className="min-w-0 space-y-4">
      <section className={sectionClass} aria-label="Stay and price"><h3 className="text-sm font-bold text-[#092442]">Stay and price</h3>
        {rate ? <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5"><span className="text-xs text-slate-500">Type of stay</span><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">{hourly ? <Clock3 className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}{hourly ? "Hourly stays" : "Overnight stays"}</span></div> : <label className="block text-xs font-semibold text-slate-600">Type of stay<select className={inputClass} value={form.mode} onChange={e => update("mode", e.target.value)}><option value="overnight">Overnight stays</option><option value="hourly">Hourly stays</option></select></label>}
        <label className="block text-xs font-semibold text-slate-600">Price option name (optional)<input className={inputClass} value={form.name} placeholder="Standard price" onChange={e => update("name", e.target.value)} aria-invalid={!!errors.name} />{error("name")}</label>
        {hourly ? <><DurationPriceEditor compact initialPrices={form.durations} onChange={rows => update("durations", rows)} />{error("durations")}</> : numberField("price", "Price per room, per night (₹)")}
        <label className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-3 text-xs font-medium text-slate-600"><input type="checkbox" checked={form.breakfast} onChange={e => update("breakfast", e.target.checked)} />Breakfast included in the room price</label>
      </section>
      <section className={sectionClass} aria-label="Booking terms"><h3 className="text-sm font-bold text-[#092442]">Booking terms</h3>
        <label className="block text-xs font-semibold text-slate-600">Cancellation policy<select className={inputClass} value={form.policy} onChange={e => update("policy", e.target.value)} aria-invalid={!!errors.policy}><option value="">Select a policy</option>{policies.map(p => <option key={p.id} value={p.id}>{p.name ?? "Policy"}</option>)}</select>{error("policy")}</label>
        {policies.find(p => p.id === form.policy)?.description && <p className="text-xs leading-relaxed text-slate-500">{policies.find(p => p.id === form.policy)?.description}</p>}
        {!policies.length && <Link className="text-sm underline" href={`/partner/listing?propertyId=${encodeURIComponent(propertyId)}&section=policies`}>Create a cancellation policy for this property</Link>}
        <label className="block text-xs font-semibold text-slate-600">When the guest pays<select className={inputClass} value={form.payment} onChange={e => update("payment", e.target.value)}><option value="full">Pay the full amount when booking</option><option value="deposit">Pay part now, balance at the hotel</option><option value="pay_at_property">Pay at the hotel</option></select></label>
        {form.payment === "deposit" && numberField("deposit", "Percentage paid when booking (%)")}
        {rate && <label className="block text-xs font-semibold text-slate-600">Booking availability<select className={inputClass} value={form.status} onChange={e => update("status", e.target.value as typeof form.status)}><option value="active">Available for booking</option><option value="paused">Not available for new bookings</option></select></label>}
        <p className="text-xs text-slate-500">The room and property must also allow this stay type before guests can book.</p>
      </section>
      <details className="group space-y-4 rounded-2xl border border-slate-200/70 bg-white p-4 sm:p-5" open={Object.keys(errors).some(key => ["tax", "fee", "minimum", "maximum", "times"].includes(key)) || undefined}><summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-sm font-semibold text-[#092442] [&::-webkit-details-marker]:hidden"><span>Additional charges and stay rules<span className="mt-1.5 block text-xs font-normal leading-relaxed text-slate-500">{summary || "No additional charges or stay length limits"}</span></span><ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" /></summary>
        {numberField("tax", "Tax added to the room price (%)")}<p className="text-xs text-slate-500">Tax is added to the room charge. It does not apply to the additional charge below.</p>
        {numberField("fee", "Additional charge per booking (₹)")}<p className="text-xs text-slate-500">Charged once per booking, regardless of nights or hours.</p>
        {!hourly ? <div className="space-y-3"><h4 className="text-sm font-bold">Stay length limits</h4><div className="grid grid-cols-2 gap-3">{numberField("minimum", "Minimum nights")}{numberField("maximum", "Maximum nights (optional)")}</div><p className="text-xs text-slate-500">A blank maximum means no additional limit. Bookings are currently limited to 30 nights.</p></div> : <>
          <h4 className="text-sm font-bold">When guests can check in</h4><div className="grid grid-cols-2 gap-3">{([['arrivalStart', 'Earliest check-in'], ['arrivalEnd', 'Latest check-in']] as const).map(([key, label]) => <label className="min-w-0 text-xs" key={key}>{label}<input type="time" className={inputClass} value={form[key]} onChange={e => update(key, e.target.value)} /></label>)}</div>
          <h4 className="text-sm font-bold">Hours guests can use the room</h4><div className="grid grid-cols-2 gap-3">{([['opens', 'Opens'], ['closes', 'Closes']] as const).map(([key, label]) => <label className="min-w-0 text-xs" key={key}>{label}<input type="time" className={inputClass} value={form[key]} onChange={e => update(key, e.target.value)} /></label>)}</div>
          <p className="text-xs text-slate-500">{form.opens === form.closes ? "Available all day. Equal opening and closing times mean 24-hour availability." : form.closes < form.opens ? "Operating hours end the following day." : "Guests must finish their stay within these hours."}</p>
          <label className="flex gap-2 text-xs"><input type="checkbox" checked={form.midnight} onChange={e => update("midnight", e.target.checked)} />Allow a stay to continue past midnight</label><p className="text-xs text-slate-500">{form.midnight ? "Stays may continue into the next day within the operating hours." : "Stays must end before midnight, even when operating hours extend into the next day."}</p>{error("times")}
        </>}
      </details>
    </fieldset>
    <section aria-label="Example guest price" className="space-y-3 rounded-2xl border border-slate-200/70 bg-[#f5f8fb] p-4 sm:p-5"><h3 className="text-sm font-bold text-[#092442]">Example guest price</h3><p className="text-xs text-slate-600">For one room, {hourly ? `${selectedDuration?.hours ?? "—"} hours (the total for this duration)` : `${validNights ? minimum : "—"} night(s)`}. Date-specific prices and optional extras can change the final booking total.</p>
      {hourly && form.durations.length > 1 && <label className="block text-xs">Example duration<select value={selectedDuration?.hours ?? ""} onChange={e => setExampleHours(Number(e.target.value))} className={inputClass}>{form.durations.map((row, index) => <option key={index} value={row.hours}>{row.hours} hours — {money(row.pricePaise)}</option>)}</select></label>}
      {preview ? <dl className="space-y-2 text-sm">{[["Room charge", preview.subtotalPaise], ["Tax", preview.taxPaise], ["Additional charge per booking", preview.customerFeePaise], ["Total", preview.totalPaise], ["Payable when booking", preview.payableNowPaise], ["Payable at the hotel", preview.balanceDuePaise]].map(([label, value]) => <div className="flex justify-between gap-3" key={label}><dt>{label}</dt><dd className="font-bold">{money(Number(value))}</dd></div>)}</dl> : <p className="text-xs">Enter valid prices and stay limits to see an example.</p>}
    </section>
    <div className="sticky -bottom-5 z-10 -mx-5 space-y-2 border-t border-slate-100 bg-white/95 px-5 pb-4 pt-3 backdrop-blur-sm">
      {notice && <p role="status" className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{notice}</p>}
      <button type="button" disabled={saving || !policies.length} onClick={() => void submit()} className="w-full rounded-xl bg-[#092442] px-3 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#12395f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c] disabled:opacity-50">{saving ? "Saving…" : rate ? "Save price option" : "Add price option"}</button>
      <p className="text-center text-[10px] leading-relaxed text-slate-400">Changes apply to future bookings. Existing bookings keep their agreed price and terms.</p>
    </div>
  </div>;
}
