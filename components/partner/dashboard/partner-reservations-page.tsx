"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, RefreshCw, Search } from "lucide-react";
import { PartnerShell } from "./partner-shell";

type Booking = {
  id: string;
  confirmationCode: string;
  propertyName: string;
  roomName: string;
  ratePlanName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  totalPaise: number;
  paidPaise: number;
  currency: string;
  bookingStatus: string;
  paymentStatus: string;
  leadGuest: { name?: string; email?: string; phone?: string } | null;
  specialRequest: string | null;
};

const statuses = ["all", "pending_payment", "confirmed", "checked_in", "completed", "cancelled", "no_show", "expired", "payment_failed"] as const;
const money = (value: number, currency: string) => new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value / 100);
const label = (value: string) => value.replaceAll("_", " ");

export function PartnerReservationsPage() {
  return <PartnerShell>{({ selectedProperty }) => <PartnerReservations propertyId={selectedProperty?.id} propertyName={selectedProperty?.name ?? "Selected property"} />}</PartnerShell>;
}

function PartnerReservations({ propertyId, propertyName }: { propertyId?: string; propertyName: string }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<(typeof statuses)[number]>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!propertyId) {
      setBookings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ propertyId, status, q: query });
      const response = await fetch(`/api/partner/bookings?${params}`, { cache: "no-store" });
      const body = await response.json() as { bookings?: Booking[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to load reservations.");
      setBookings(body.bookings ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load reservations.");
    } finally {
      setLoading(false);
    }
  }, [propertyId, query, status]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  const updateStatus = async (bookingId: string, nextStatus: "checked_in" | "completed" | "no_show" | "cancelled") => {
    setBusy(bookingId);
    setError("");
    try {
      const response = await fetch(`/api/partner/bookings/${bookingId}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to update reservation.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update reservation.");
    } finally {
      setBusy(null);
    }
  };

  return <section className="space-y-5"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#b58522]">Reservations</p><h1 className="mt-2 text-2xl font-bold text-[#061224]">{propertyName}</h1><p className="mt-1 text-sm text-slate-500">Manage guest arrivals, payment status, and reservation actions.</p></div><button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-[#061224]"><RefreshCw className="h-4 w-4" />Refresh</button></div><div className="mt-5 flex flex-col gap-3 lg:flex-row"><label className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guest, phone, email, confirmation" className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm outline-none focus:border-[#c6973e]" /></label><select value={status} onChange={(event) => setStatus(event.target.value as (typeof statuses)[number])} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold outline-none">{statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></div>{error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}</div>{loading ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading reservations...</div> : bookings.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">No reservations match this view.</div> : <div className="grid gap-4">{bookings.map((booking) => <article key={booking.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-[#061224]">{booking.leadGuest?.name ?? "Guest"}</h2><span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold capitalize text-slate-700">{label(booking.bookingStatus)}</span><span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-bold capitalize text-amber-800">{label(booking.paymentStatus)}</span></div><p className="mt-1 text-sm text-slate-500">{booking.confirmationCode} · {booking.roomName} · {booking.ratePlanName}</p><p className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#061224]"><CalendarDays className="h-4 w-4 text-[#c6973e]" />{booking.checkIn} to {booking.checkOut} · {booking.nights} night{booking.nights === 1 ? "" : "s"}</p><p className="mt-1 text-sm text-slate-500">{booking.adults + booking.children} guest{booking.adults + booking.children === 1 ? "" : "s"} · {booking.leadGuest?.email ?? "No email"} · {booking.leadGuest?.phone ?? "No phone"}</p>{booking.specialRequest && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{booking.specialRequest}</p>}</div><div className="min-w-[260px] xl:text-right"><p className="text-2xl font-bold text-[#061224]">{money(booking.totalPaise, booking.currency)}</p><p className="text-xs text-slate-500">Paid {money(booking.paidPaise, booking.currency)}</p><div className="mt-4 flex flex-wrap gap-2 xl:justify-end">{booking.bookingStatus === "confirmed" && <button disabled={busy === booking.id} onClick={() => void updateStatus(booking.id, "checked_in")} className="rounded-lg bg-[#061224] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Check in</button>}{booking.bookingStatus === "checked_in" && <button disabled={busy === booking.id} onClick={() => void updateStatus(booking.id, "completed")} className="rounded-lg bg-green-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Complete</button>}{["pending_payment", "confirmed"].includes(booking.bookingStatus) && <button disabled={busy === booking.id} onClick={() => void updateStatus(booking.id, "cancelled")} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50">Cancel</button>}</div></div></div></article>)}</div>}</section>;
}
