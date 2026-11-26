"use client";

import { useState } from "react";
import { Check, Clock3, MessageCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";

type Rate = { id: string; name: string; roomTypeId: string; roomTypeName: string; bookingMode: string; equivalents: string[] };
type Settings = { revision: number; cutoffHours: number; reservationsPhone: string | null; rates: Rate[] };
const labelForMode = (mode: string) => mode === "hourly" ? "Hourly stay" : "Overnight stay";

export function BookingEditingSettings({ propertyId }: { propertyId: string }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<Settings | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const url = `/api/partner/properties/${propertyId}/booking-editing`;
  const query = useQuery({ queryKey: ["partner", propertyId, "booking-editing"], queryFn: () => apiFetch<Settings>(url) });
  const data = draft ?? query.data;
  if (!data) return <section className="rounded-2xl border border-stone-200 bg-white p-5 text-sm text-slate-600" role="status">{query.error ? "Booking editing settings could not load." : "Loading booking editing settings…"}</section>;

  const toggleEquivalent = (rateId: string, equivalentId: string) => setDraft({
    ...data,
    rates: data.rates.map((rate) => rate.id !== rateId ? rate : {
      ...rate,
      equivalents: rate.equivalents.includes(equivalentId) ? rate.equivalents.filter((id) => id !== equivalentId) : [...rate.equivalents, equivalentId],
    }),
  });

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-amber-50/50 px-5 py-5 sm:px-6">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0b1f3a] text-amber-300"><RefreshCw className="h-5 w-5" aria-hidden="true" /></div>
        <div><h2 className="text-lg font-bold text-slate-950">Customer booking changes</h2><p className="mt-1 text-sm leading-6 text-slate-600">Online guests can edit eligible bookings. These settings define the change window and which room packages can be exchanged automatically.</p></div>
      </div>
    </div>
    <form className="space-y-7 p-5 sm:p-6" onSubmit={(event) => {
      event.preventDefault(); setBusy(true); setNotice(null);
      void apiFetch<Settings>(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: data.revision, cutoffHours: data.cutoffHours, reservationsPhone: data.reservationsPhone || null, mappings: data.rates.map((rate) => ({ ratePlanId: rate.id, equivalents: rate.equivalents })) }) })
        .then((saved) => { setDraft(saved); setNotice({ kind: "success", text: "Changes saved. They apply to eligible bookings from now on." }); return client.invalidateQueries({ queryKey: ["partner", propertyId] }); })
        .catch((error) => setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to save changes." }))
        .finally(() => setBusy(false));
    }}>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="rounded-xl border border-slate-200 p-4">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Clock3 className="h-4 w-4 text-amber-600" />Stay-change window</span><span className="mt-1 block text-sm text-slate-600">Guests can change their stay until this many hours before arrival.</span>
          <div className="mt-3 flex items-center gap-2"><input required className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-center font-semibold outline-none focus:border-[#0b1f3a] focus:ring-2 focus:ring-[#0b1f3a]/15" type="number" min={0} max={8760} value={data.cutoffHours} onChange={(e) => setDraft({ ...data, cutoffHours: Number(e.target.value) })} /><span className="text-sm text-slate-600">hours before arrival</span></div>
          <span className="mt-2 block text-xs text-slate-500">Use 0 to allow changes until the scheduled arrival time.</span>
        </label>
        <label className="rounded-xl border border-slate-200 p-4">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-900"><MessageCircle className="h-4 w-4 text-emerald-600" />Help with a change</span><span className="mt-1 block text-sm text-slate-600">Optional WhatsApp number shown when a guest needs hotel assistance.</span>
          <input className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none placeholder:text-slate-400 focus:border-[#0b1f3a] focus:ring-2 focus:ring-[#0b1f3a]/15" type="tel" placeholder="+91 98765 43210" value={data.reservationsPhone ?? ""} onChange={(e) => setDraft({ ...data, reservationsPhone: e.target.value })} />
        </label>
      </div>
      <div>
        <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#0b1f3a]" aria-hidden="true" /><div><h3 className="font-bold text-slate-950">Automatic room-package changes</h3><p className="mt-1 text-sm leading-6 text-slate-600">Choose only packages with equivalent inclusions and benefits. Guests can still change dates and guest details; unlinked package changes are routed to your team.</p></div></div>
        <div className="mt-4 space-y-4">{data.rates.map((rate) => {
          const candidates = data.rates.filter((candidate) => candidate.id !== rate.id && candidate.roomTypeId !== rate.roomTypeId && candidate.bookingMode === rate.bookingMode);
          return <fieldset key={rate.id} className="rounded-xl border border-slate-200 p-4"><legend className="sr-only">Equivalent packages for {rate.name}</legend>
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-semibold text-slate-900">{rate.name}</h4><p className="text-sm text-slate-500">{rate.roomTypeName} · {labelForMode(rate.bookingMode)}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{rate.equivalents.length} linked</span></div>
            {candidates.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{candidates.map((candidate) => {
              const checked = rate.equivalents.includes(candidate.id);
              return <label key={candidate.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${checked ? "border-[#0b1f3a] bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}><input className="mt-0.5 h-4 w-4 accent-[#0b1f3a]" type="checkbox" checked={checked} onChange={() => toggleEquivalent(rate.id, candidate.id)} /><span><span className="block text-sm font-medium text-slate-900">{candidate.name}</span><span className="block text-xs text-slate-500">{candidate.roomTypeName}</span></span></label>;
            })}</div> : <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">No other {labelForMode(rate.bookingMode).toLowerCase()} package is available in a different room category.</p>}
          </fieldset>;
        })}</div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5"><p className="text-xs text-slate-500">Booking editing is available across HelpKey hotels; these settings do not turn it on or off.</p><button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Saving changes…" : <><Check className="h-4 w-4" />Save changes</>}</button></div>
      {notice && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${notice.kind === "success" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{notice.text}</p>}
    </form>
  </section>;
}
