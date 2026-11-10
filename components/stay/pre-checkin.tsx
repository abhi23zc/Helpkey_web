"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { localParts, resolveLocal } from "@/lib/booking/domain";
import type { StayBookingData } from "@/lib/stay/contracts";
import { CalendarDays, Check, Clock3, Info, Mail, Phone, UserRound, Sparkles } from "lucide-react";
import { PartnerDatePicker } from "@/components/partner/dashboard/partner-date-picker";
import { Drawer } from "@/components/partner/dashboard/drawer";
import { StayRequestList } from "./stay-request-list";
import { UnlistedRequestForm } from "./unlisted-request";
import { supplementalFinancials } from "@/lib/stay/agreements";
import { formatMoney } from "@/lib/customer/offer";
type Booking = Partial<StayBookingData> & { id: string; bookingStatus: string; startAt: string | null; endAt: string | null; timezone: string; currency: string; leadGuest?: { name?: string; email?: string; phone?: string } | null; propertyPublicPhone?: string | null };
const button = "min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold transition-colors hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b58a32] disabled:opacity-50";
export function PreCheckinPanel({ booking }: { booking: Booking }) {
  const client = useQueryClient(), [editing, setEditing] = useState(false), [success, setSuccess] = useState("");
  const refresh = () => { void client.invalidateQueries({ queryKey: queryKeys.booking(booking.id) }); void client.invalidateQueries({ queryKey: ["arrival-options", booking.id] }); };
  const q = useQuery({ queryKey: ["arrival-options", booking.id], queryFn: ({ signal }) => apiFetch<{ editable: boolean; startAt?: string | null }>(`/api/bookings/${encodeURIComponent(booking.id)}/pre-checkin`, { signal }), enabled: booking.bookingStatus === "confirmed", refetchOnWindowFocus: true, refetchInterval: 15000 });
  const editable = booking.bookingStatus === "confirmed" && q.data?.editable;
  const p = booking.preCheckin;
  const supplemental = supplementalFinancials(booking.customizations ?? [], booking.stayPaymentReceipts);
  return <div className="space-y-6">
    <section className="rounded-2xl border border-[#e7e4dc] bg-white p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#fbf7ee] border border-[#e8d9b5] text-[#b48a3c]">
            <Clock3 className="h-4 w-4" />
          </div>
          <h2 className="text-base font-bold text-[#061224]">Arrival coordination</h2>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
          p?.status === "submitted"
            ? "border-slate-200 bg-slate-100 text-[#0b1f3a]"
            : "border-[#e8d9b5] bg-[#fbf7ee] text-[#785d1c]"
        }`}>
          {p?.status === "submitted" ? "Arrival time shared" : "Optional · Share arrival time"}
        </span>
      </div>
      <p className="mt-3 text-xs sm:text-sm text-slate-600 leading-relaxed">
        {p?.arrivalChoice === "unknown"
          ? "Arrival time: Not sure yet. You can update it whenever your plans are set."
          : p?.expectedArrivalAt
            ? `Expected arrival: ${new Date(p.expectedArrivalAt).toLocaleString("en-IN", { timeZone: booking.timezone })} (${booking.timezone})`
            : "Let the front desk know when you expect to arrive so they can prepare your room keys."}
      </p>
      {p?.notes && <p className="mt-2 text-xs text-slate-500 rounded-lg bg-slate-50 border border-slate-100 p-2.5">Arrival note: {p.notes}</p>}
      <p className="mt-2 text-[11px] text-slate-400">Online pre-check-in helps the front desk prepare. Standard check-in starts at the official hotel check-in time.</p>
      {success && <p role="status" className="mt-3 text-xs font-semibold text-[#785d1c] bg-[#fbf7ee] p-2.5 rounded-lg border border-[#e8d9b5]">{success}</p>}
      {editable && <button className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-[#0b1f3a] px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-[#152e4d] transition" onClick={() => setEditing(true)}>{p?.status === "submitted" ? "Update arrival time" : "Set estimated arrival time"}</button>}
      {q.isPending && booking.bookingStatus === "confirmed" && <p className="mt-3 text-xs text-slate-500">Loading arrival details…</p>}
      {q.isError && <p role="alert" className="mt-3 text-xs text-rose-600">Arrival details could not load. <button className="underline font-bold" onClick={() => void q.refetch()}>Retry</button></p>}
      {!editable && !q.isPending && !q.isError && <p className="mt-3 text-xs text-slate-500">Online changes are closed. Contact the hotel for assistance. {booking.propertyPublicPhone}</p>}
    </section>
    <section className="rounded-2xl border border-[#e7e4dc] bg-white p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#fbf7ee] border border-[#e8d9b5] text-[#b48a3c]">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#061224]">Your requested additions</h2>
            <p className="text-[11px] text-slate-500">Personalized touches arranged with the hotel</p>
          </div>
        </div>
      </div>
      <StayRequestList requests={booking.customizations ?? []} currency={booking.currency} timezone={booking.timezone} guest={{ bookingId: booking.id, revision: booking.stayRevision ?? 0, enabled: ["confirmed", "checked_in"].includes(booking.bookingStatus), refresh }} />
      {supplemental.paidPaise > 0 && <p className="mt-3 text-xs text-slate-500">Extras paid separately: {formatMoney(supplemental.paidPaise, booking.currency)}{supplemental.refundDuePaise > 0 ? ` · Refund pending: ${formatMoney(supplemental.refundDuePaise, booking.currency)}` : ""}{supplemental.refundedPaise > 0 ? ` · Refunded: ${formatMoney(supplemental.refundedPaise, booking.currency)}` : ""}</p>}
      {["confirmed", "checked_in"].includes(booking.bookingStatus) && <div className="mt-4"><UnlistedRequestForm timezone={booking.timezone} disabled={false} onAdd={async request => { try { await apiFetch(`/api/bookings/${encodeURIComponent(booking.id)}/stay-requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", revision: booking.stayRevision ?? 0, request }) }); } finally { refresh(); } }} /></div>}
    </section>
    {editing && <ArrivalEditor booking={{ ...booking, startAt: booking.startAt ?? q.data?.startAt ?? null }} close={() => setEditing(false)} saved={submitted => { setSuccess(submitted ? "Pre-check-in confirmed. Your arrival plan and guest information have been saved." : "Arrival draft saved. Resume pre-check-in whenever you’re ready."); refresh(); }} />}
  </div>;
}
const arrivalTimes = Array.from({ length: 96 }, (_, index) => `${String(Math.floor(index / 4)).padStart(2, "0")}:${String((index % 4) * 15).padStart(2, "0")}`);
const arrivalTimeLabel = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
};
type Draft = { choice: "time" | "unknown" | null; date: string; time: string; notes: string; revision: number; step: number };
function ArrivalEditor({ booking, close, saved }: { booking: Booking; close: () => void; saved: (submitted: boolean) => void }) {
  const client = useQueryClient();
  const key = `arrival-draft:${booking.id}`;
  const [draft, setDraft] = useState<Draft>(() => {
    try { const stored = sessionStorage.getItem(key); if (stored) return JSON.parse(stored); } catch { /* storage is optional */ }
    const p = booking.preCheckin?.draft ?? booking.preCheckin;
    const parts = p?.expectedArrivalAt ? localParts(Date.parse(p.expectedArrivalAt), booking.timezone) : null;
    return { choice: p?.arrivalChoice ?? (parts ? "time" : null), date: parts?.date ?? "", time: parts?.time ?? "", notes: p?.notes ?? "", revision: booking.stayRevision ?? 0, step: 0 };
  });
  const [baseline] = useState(JSON.stringify(draft));
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [confirmClose, setConfirmClose] = useState(false);
  const guard = useRef(false), heading = useRef<HTMLHeadingElement>(null);
  const closeWarning = useRef<HTMLDivElement>(null);
  const dirty = baseline !== JSON.stringify(draft), conflict = draft.revision !== (booking.stayRevision ?? 0);
  const patch = (value: Partial<Draft>) => { setDraft(d => ({ ...d, ...value })); setError(""); };
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(draft)); } catch { /* storage is optional */ } }, [key, draft]);
  useEffect(() => { heading.current?.focus(); }, [draft.step]);
  useEffect(() => { const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); } }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  useEffect(() => {
    if (!confirmClose) return;
    closeWarning.current?.focus({ preventScroll: true });
    closeWarning.current?.scrollIntoView({ block: "end", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [confirmClose]);
  function validate() {
    if (!draft.choice) return "Choose an arrival time or ‘Not sure yet’.";
    if (draft.choice === "unknown") return "";
    if (!draft.date || !draft.time) return "Choose both an arrival date and time.";
    try {
      const instant = resolveLocal(draft.date, draft.time, booking.timezone), parts = localParts(instant, booking.timezone);
      if (parts.date !== draft.date || parts.time !== draft.time || instant < Date.now() || (booking.startAt && draft.date < localParts(Date.parse(booking.startAt), booking.timezone).date) || (booking.endAt && instant >= Date.parse(booking.endAt))) return "Choose an upcoming arrival time on your booked dates before departure.";
    } catch { return "Choose a valid arrival date and time."; }
    return "";
  }
  async function save(submit: boolean) {
    if (guard.current) return;
    const invalid = submit ? validate() : "";
    if (invalid) { setError(invalid); patch({ step: 0 }); setError(invalid); return; }
    if (conflict) { setError("Your booking changed. Review the current booking before retrying; your draft has been kept."); return; }
    guard.current = true; setBusy(true); setError("");
    try {
      await apiFetch(`/api/bookings/${encodeURIComponent(booking.id)}/pre-checkin`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: draft.revision, arrivalChoice: draft.choice, expectedArrivalLocal: draft.choice === "time" && draft.date && draft.time ? `${draft.date}T${draft.time}` : null, notes: draft.notes, submit, guestsReviewed: submit && draft.step === 2 }) });
      if (submit) sessionStorage.removeItem(key); else sessionStorage.setItem(key, JSON.stringify({ ...draft, revision: (booking.stayRevision ?? 0) + 1 })); saved(submit); close();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save. Your draft has been kept."); void client.invalidateQueries({ queryKey: queryKeys.booking(booking.id) }); } finally { guard.current = false; setBusy(false); }
  }
  const guestInfo = (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#b58a32] shadow-sm"><UserRound className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0"><p className="text-xs font-medium text-slate-500">Guests on this booking</p><p className="mt-1 break-words text-sm font-semibold">{(booking.guestNames?.length ? booking.guestNames : [booking.leadGuest?.name ?? "Guest"]).join(", ")}</p></div>
      </div>
      <div className="space-y-3 p-4 text-sm">
        {booking.leadGuest?.email && <p className="flex items-start gap-3"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" /><span className="break-all">{booking.leadGuest.email}</span></p>}
        {booking.leadGuest?.phone && <p className="flex items-center gap-3"><Phone className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />{booking.leadGuest.phone}</p>}
      </div>
    </section>
  );
  return <Drawer open onClose={() => { if (!busy) { if (dirty) { setConfirmClose(true); closeWarning.current?.scrollIntoView({ block: "end", behavior: "instant" }); } else close(); } }} title="Pre-check-in" description={`Step ${draft.step + 1} of 3 · ${["Arrival", "Guest details", "Review & confirm"][draft.step]}`} footer={<div className="flex w-full flex-wrap items-center gap-2"><button className={button} disabled={busy || draft.step === 0} onClick={() => patch({ step: draft.step - 1 })}>Back</button>{booking.preCheckin?.status !== "submitted" && <button className={button} disabled={busy} onClick={() => void save(false)}>Save and close</button>}<button className={`${button} ml-auto bg-[#061224] text-white hover:bg-[#10243f]`} disabled={busy} onClick={() => { if (draft.step === 2) void save(true); else { const invalid = draft.step === 0 ? validate() : ""; if (invalid) setError(invalid); else patch({ step: draft.step + 1 }); } }}>{busy ? "Saving…" : draft.step === 2 ? "Confirm pre-check-in" : "Continue"}</button></div>}>
    <div className="space-y-5 text-[#061224]"><ol aria-label="Pre-check-in progress" className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100/70 p-2">{["Arrival", "Guest details", "Review & confirm"].map((label, i) => <li key={label} aria-current={draft.step === i ? "step" : undefined} className={`flex flex-col items-center gap-2 rounded-xl px-1 py-3 text-center text-[11px] sm:text-xs ${draft.step === i ? "bg-white font-semibold shadow-sm" : "text-slate-500"}`}><span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${draft.step >= i ? "bg-[#061224] text-white" : "bg-slate-200 text-slate-500"}`}>{draft.step > i ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}</span>{label}</li>)}</ol>
      <h3 ref={heading} tabIndex={-1} className="text-lg font-bold">{["When will you arrive?", "Check your guest details", "Review & confirm"][draft.step]}</h3>
      {draft.step === 0 && <fieldset disabled={busy} className="space-y-5">
        <legend className="sr-only">Arrival choice</legend>
        <p className="text-sm leading-6 text-slate-500">Share your expected arrival so the hotel can prepare for your stay.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {([["time", "Choose arrival time", "I know when I’ll arrive"], ["unknown", "Not sure yet", "I’ll share my plans later"]] as const).map(([value, label, hint]) => <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${draft.choice === value ? "border-[#b58a32] bg-[#b58a32]/5 ring-1 ring-[#b58a32]/20" : "border-slate-200 bg-white hover:border-slate-300"}`}><input type="radio" name="arrival-choice" aria-label={label} className="mt-1 h-4 w-4 shrink-0 accent-[#061224]" checked={draft.choice === value} onChange={() => patch({ choice: value })} /><span><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{hint}</span></span></label>)}
        </div>
        {draft.choice === "time" && <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="grid gap-4 sm:grid-cols-2"><div><p className="mb-2 text-sm font-medium">Arrival date</p><PartnerDatePicker aria-label="Arrival date" timezone={booking.timezone} disabled={busy} value={draft.date} min={booking.startAt ? localParts(Date.parse(booking.startAt), booking.timezone).date : undefined} max={booking.endAt ? localParts(Date.parse(booking.endAt), booking.timezone).date : undefined} onChange={e => patch({ date: e.target.value })} description="Choose your arrival date within your booked stay." className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" /></div><label className="text-sm font-medium">Arrival time<select aria-label="Arrival time" value={draft.time} onChange={e => patch({ time: e.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#b58a32] focus:ring-2 focus:ring-[#b58a32]/15"><option value="" disabled>Select arrival time</option>{draft.time && !arrivalTimes.includes(draft.time) && <option value={draft.time}>{arrivalTimeLabel(draft.time)}</option>}{arrivalTimes.map(time => <option key={time} value={time}>{arrivalTimeLabel(time)}</option>)}</select></label></div><p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />Hotel local time · {booking.timezone}</p></div>}
        {draft.choice === "unknown" && <p className="rounded-xl bg-slate-100 p-4 text-sm leading-6 text-slate-600">You can complete pre-check-in now and update your arrival time later.</p>}
        <label className="block text-sm font-medium">Arrival note <span className="font-normal text-slate-400">(optional)</span><textarea aria-label="Arrival note (optional)" value={draft.notes} maxLength={1000} rows={3} placeholder="Anything the hotel should know about your arrival?" onChange={e => patch({ notes: e.target.value })} className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm font-normal outline-none placeholder:text-slate-400 focus:border-[#b58a32] focus:ring-2 focus:ring-[#b58a32]/15" /><span className="mt-1 block text-right text-xs font-normal text-slate-400">{draft.notes.length}/1000</span></label>
      </fieldset>}
      {draft.step === 1 && <div className="space-y-4"><p className="text-sm leading-6 text-slate-500">Review the guest and contact information saved with your booking.</p>{guestInfo}<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-semibold">Need to correct something?</p><p className="mt-1 text-sm leading-6 text-slate-500">Contact the hotel if any guest details need correcting.</p>{booking.propertyPublicPhone ? <a className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold hover:bg-slate-100" href={`tel:${booking.propertyPublicPhone}`}><Phone className="h-4 w-4" aria-hidden="true" />Contact hotel · {booking.propertyPublicPhone}</a> : <p className="mt-2 text-sm text-slate-500">Use the hotel contact details on your booking for corrections.</p>}</div></div>}
      {draft.step === 2 && <div className="space-y-4"><section className="rounded-2xl border border-slate-200 bg-white p-4"><p className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-[#b58a32]" aria-hidden="true" />Your arrival plan</p><p className="mt-3 text-sm">{draft.choice === "unknown" ? "Not sure yet — update later" : `${new Date(`${draft.date}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} at ${arrivalTimeLabel(draft.time)}`}</p>{draft.choice === "time" && <p className="mt-1 text-xs text-slate-500">Hotel local time · {booking.timezone}</p>}{draft.notes && <div className="mt-4 border-t border-slate-100 pt-3"><p className="text-xs font-medium text-slate-500">Arrival note</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{draft.notes}</p></div>}</section>{guestInfo}<p className="text-sm leading-6 text-slate-500">By confirming, you confirm the arrival plan and guest information displayed here.</p></div>}
      <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>Online pre-check-in does not guarantee early room access.</p></div>
      {conflict && <div role="alert" className="rounded-xl bg-amber-50 p-3 text-sm">Your booking changed while this draft was open. Your draft has been kept. Review the current booking before saving.<button className={`${button} mt-2`} onClick={() => { patch({ revision: booking.stayRevision ?? 0, step: 0 }); }}>I’ve reviewed the current booking; review my draft</button></div>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {confirmClose && <div ref={closeWarning} role="alert" tabIndex={-1} className="scroll-mb-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 outline-none focus-visible:ring-2 focus-visible:ring-amber-400"><p>You have unsaved changes. Keep this draft on this device and close?</p><button className={button} onClick={close}>Keep draft and close</button><button className={button} onClick={() => setConfirmClose(false)}>Continue editing</button></div>}
    </div>
  </Drawer>;
}
