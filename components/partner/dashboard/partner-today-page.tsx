"use client";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ActionEligibility } from "@/lib/partner/reservations/eligibility";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { localParts } from "@/lib/booking/domain";
import { todayQueues, type TodayQueue } from "@/lib/partner/today/domain";
import { PartnerShell } from "./partner-shell";
import { PartnerDatePicker } from "./partner-date-picker";
import { ReservationWorkspace } from "./reservation-workspace";
import { ManualBookingDialog } from "./manual-booking-dialog";
import { useHotelCapabilities } from "./hotel-capabilities";
import { formatPaise as formatCurrency } from "@/lib/currency";
const formatPaise = (value: number) => formatCurrency(value, { withFractions: true });

type Summary = { timezone: string; date: string; evaluatedAt: string; generation: string; counts: Record<TodayQueue, number>; requestCount: number };
type Row = { id: string; guestName: string; reference: string; startAt: string; endAt: string; bookingMode: string; room: string | null; status: string; balanceDuePaise?: number; requestCount: number; reasons: string[]; actionEligibility?: Record<string, ActionEligibility> };
type Queue = Summary & { rows: Row[]; nextCursor: string | null };
const button = "min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50";
export function PartnerTodayPage() {
  return <PartnerShell>{({ selectedProperty }) => selectedProperty ? <Today key={selectedProperty.id} propertyId={selectedProperty.id} propertyName={selectedProperty.name} /> : <div className="rounded-2xl bg-white p-6"><h1>Today</h1><p>Select a hotel to view operations.</p><a href="/partner/onboarding">Add a property</a></div>}</PartnerShell>;
}
function Today({ propertyId, propertyName }: { propertyId: string; propertyName: string }) {
  const router = useRouter();
  const params = useSearchParams(), client = useQueryClient(), permits = useHotelCapabilities();
  const [manual, setManual] = useState(false), [clock, setClock] = useState(() => Date.now());
  const explicitDate = params.get("date"), cursor = params.get("cursor");
  const queue = (params.get("queue") && params.get("queue")! in todayQueues ? params.get("queue") : "arrivals") as TodayQueue;
  const update = useCallback((patch: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(window.location.search);
    next.set("propertyId", propertyId);
    Object.entries(patch).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    window.history[replace ? "replaceState" : "pushState"](null, "", `${window.location.pathname}?${next}`);
  }, [propertyId]);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  // The bootstrap response supplies the hotel's timezone, never the device's date.
  const bootstrap = useQuery({ queryKey: ["partner", propertyId, "today", "timezone"], queryFn: ({ signal }) => apiFetch<Summary>(`/api/partner/today/summary?${new URLSearchParams({ propertyId })}`, { signal }), staleTime: 30_000, refetchInterval: 30_000, refetchIntervalInBackground: false });
  const timezone = bootstrap.data?.timezone;
  const date = explicitDate || (timezone ? localParts(clock, timezone).date : "");
  const summary = useQuery({ queryKey: ["partner", propertyId, "today", "summary", date], enabled: !!date, queryFn: ({ signal }) => apiFetch<Summary>(`/api/partner/today/summary?${new URLSearchParams({ propertyId, date })}`, { signal }), refetchInterval: 30_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true, refetchOnReconnect: true });
  const list = useQuery({ queryKey: ["partner", propertyId, "today", "queue", date, queue, cursor], enabled: !!date, queryFn: ({ signal }) => apiFetch<Queue>(`/api/partner/today/reservations?${new URLSearchParams({ propertyId, date, queue, ...(cursor ? { cursor } : {}) })}`, { signal }), refetchInterval: 30_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true, refetchOnReconnect: true, retry: false });
  const refresh = useCallback(() => { void client.invalidateQueries({ queryKey: ["partner", propertyId] }); }, [client, propertyId]);
  const error = summary.error || bootstrap.error;
  const expired = list.error instanceof ApiClientError && ["CURSOR_EXPIRED", "INVALID_CURSOR"].includes(list.error.code);
  const when = (value: string) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value));
  return <section className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Today</h1><p className="text-sm text-slate-600">{propertyName} · {timezone || "Loading hotel timezone…"}</p></div><div className="flex flex-wrap gap-2">{date && <PartnerDatePicker value={date} timezone={timezone} aria-label="Selected hotel date" onChange={e => update({ date: e.target.value, cursor: null })} />}<button className={button} onClick={() => update({ date: null, cursor: null })}>Today</button>{permits("reservation.create") && <button className={button} onClick={() => setManual(true)}>Create reservation</button>}</div></header>
    <p className="text-sm text-slate-600">Selected date: {date || "Loading…"}{!explicitDate && " (follows hotel midnight)"} · Live warnings evaluated: {summary.data ? when(summary.data.evaluatedAt) : "Unavailable"}</p>
    {error && <div role="alert" className="rounded-xl bg-amber-50 p-4">{summary.data ? "Retained data is stale. " : "Counts unavailable. "}{error.message} <button className={button} onClick={refresh}>Retry</button> <a href={`/partner/reservations?propertyId=${encodeURIComponent(propertyId)}`}>Browse reservations</a></div>}
    {!date && !error && <p role="status">Loading hotel operations…</p>}
    {[["Selected date", ["arrivals", "awaiting_check_in", "departures"]], ["Live attention — now", ["in_house", "unassigned", "room_attention", "balances", "requests", "overdue", "overdue_departures", "attention"]]].map(([title, keys]) => <div key={title as string} className="space-y-3"><h2 className="font-bold">{title as string}</h2>{title === "Live attention — now" && <p className="text-xs text-slate-600">Room and balance attention also includes confirmed arrivals on the selected date. Guest requests include future active stays.</p>}<div className="grid grid-cols-2 gap-3 md:grid-cols-4">{(keys as TodayQueue[]).map(key => <button key={key} aria-pressed={queue === key} onClick={() => update({ queue: key, cursor: null })} className={`min-h-24 rounded-2xl border p-4 text-left ${queue === key ? "border-amber-600 bg-amber-50" : "border-slate-200 bg-white"}`}><span className="block text-sm">{todayQueues[key]}</span><strong className="text-2xl">{summary.data?.counts[key] ?? "—"}</strong>{key === "requests" && summary.data && <span className="block text-xs">{summary.data.requestCount} requests</span>}</button>)}</div></div>)}
    <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-4 flex items-center justify-between gap-2"><h2 className="font-bold">{todayQueues[queue]}</h2><button className={button} onClick={refresh}>Refresh</button></div>
      {list.isPending && <p role="status">Loading queue…</p>}
      {list.error && <p role="alert">{list.data ? "Retained queue is stale. " : "Queue unavailable. "}{list.error.message} <button className={button} onClick={() => expired ? update({ cursor: null }, true) : void list.refetch()}>{expired ? "Restart queue" : "Retry"}</button></p>}
      {list.data && <><p className="mb-3 text-xs text-slate-600">Last successful update: {when(list.data.evaluatedAt)} · Refreshes every 30 seconds while visible.</p>{!list.data.rows.length && <p>No reservations in this queue.</p>}<ul className="divide-y divide-slate-200">{list.data.rows.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><button className="min-h-11 text-left font-bold underline" onClick={() => update({ bookingId: row.id })}>{row.guestName} · {row.reference}</button><p className="text-sm">{when(row.startAt)} → {when(row.endAt)} · {row.bookingMode}</p><p className="text-sm">{row.room ? `Room ${row.room}` : "Unassigned"} · {row.status.replaceAll("_", " ")}{row.balanceDuePaise !== undefined && ` · ${formatPaise(row.balanceDuePaise)} due`}</p>{row.reasons.length > 0 && <p className="text-sm text-amber-800">Advisory attention: {row.reasons.join(" · ")}</p>}{(row.status === "confirmed" || row.status === "checked_in") && row.actionEligibility?.[row.status === "confirmed" ? "checked_in" : "checked_out"]?.blockers.map(blocker => <p key={blocker.code} className="mt-1 text-sm text-red-800">{blocker.message}{blocker.resolution && <button className="ml-2 min-h-11 underline" onClick={() => blocker.resolution === "settings" || blocker.resolution === "housekeeping" ? router.push(`/partner/${blocker.resolution === "settings" ? "settings" : "rooms"}?${blocker.resolution === "housekeeping" ? "section=housekeeping&" : ""}propertyId=${encodeURIComponent(propertyId)}`) : update({ bookingId: row.id, section: blocker.resolution })}>Review {blocker.resolution}</button>}</p>)}</div><button className={button} onClick={() => update({ bookingId: row.id })}>Open workspace</button></li>)}</ul><div className="mt-4 flex gap-2"><button disabled={!cursor} className={button} onClick={() => update({ cursor: null })}>First page</button><button disabled={!list.data.nextCursor} className={button} onClick={() => update({ cursor: list.data!.nextCursor })}>Next page</button></div></>}
    </div>
    <ReservationWorkspace bookingId={params.get("bookingId")} propertyId={propertyId} onChanged={refresh} onClose={() => update({ bookingId: null, section: null }, true)} />
    {manual && <ManualBookingDialog open propertyId={propertyId} propertyName={propertyName} onClose={() => setManual(false)} onCreated={id => { setManual(false); refresh(); if (id) update({ bookingId: id }); }} />}
  </section>;
}
