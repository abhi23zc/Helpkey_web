"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, RefreshCw, Search, XCircle } from "lucide-react";

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
  payableNowPaise: number;
  paidPaise: number;
  currency: string;
  bookingStatus: string;
  paymentStatus: string;
  paymentMethod: string | null;
  leadGuest: { name?: string; email?: string; phone?: string } | null;
  createdAt: string | null;
};

const statuses = ["all", "pending_payment", "confirmed", "checked_in", "completed", "cancelled", "no_show", "expired", "payment_failed"] as const;
const money = (value: number, currency: string) => new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value / 100);
const label = (value: string) => value.replaceAll("_", " ");

export function AdminBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<(typeof statuses)[number]>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ status, q: query });
      const response = await fetch(`/api/admin/bookings?${params}`, { cache: "no-store" });
      const body = await response.json() as { bookings?: Booking[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to load bookings.");
      setBookings(body.bookings ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load bookings.");
    } finally {
      setLoading(false);
    }
  }, [query, status]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  const totals = useMemo(() => ({
    count: bookings.length,
    revenue: bookings.reduce((sum, booking) => sum + (booking.paidPaise || 0), 0),
    pending: bookings.filter((booking) => booking.bookingStatus === "pending_payment").length,
  }), [bookings]);

  const cancel = async (bookingId: string) => {
    setBusy(bookingId);
    setError("");
    try {
      const response = await fetch(`/api/admin/bookings/${bookingId}/cancel`, { method: "POST" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to cancel booking.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to cancel booking.");
    } finally {
      setBusy(null);
    }
  };

  return <section className="space-y-6 p-4 sm:p-6"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#b58522]">Operations</p><h1 className="mt-2 text-3xl font-bold text-[#061224]">Bookings</h1><p className="mt-1 text-sm text-slate-500">Search reservations, inspect payments, and release inventory when cancelling.</p></div><button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-[#061224]"><RefreshCw className="h-4 w-4" />Refresh</button></div><div className="grid gap-3 md:grid-cols-3"><Metric label="Loaded bookings" value={String(totals.count)} /><Metric label="Paid value" value={money(totals.revenue, "INR")} /><Metric label="Pending payments" value={String(totals.pending)} /></div><div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-col gap-3 lg:flex-row"><label className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guest, property, phone, confirmation" className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm outline-none focus:border-[#c6973e]" /></label><select value={status} onChange={(event) => setStatus(event.target.value as (typeof statuses)[number])} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold outline-none">{statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></div>{error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}{loading ? <p className="mt-6 text-sm text-slate-500">Loading bookings...</p> : <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-3 pr-4">Booking</th><th className="py-3 pr-4">Guest</th><th className="py-3 pr-4">Stay</th><th className="py-3 pr-4">Payment</th><th className="py-3 pr-4 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{bookings.map((booking) => <tr key={booking.id}><td className="py-4 pr-4 align-top"><p className="font-bold text-[#061224]">{booking.confirmationCode}</p><p className="text-slate-500">{booking.propertyName}</p><p className="text-xs text-slate-400">{booking.roomName} · {booking.ratePlanName}</p></td><td className="py-4 pr-4 align-top"><p className="font-semibold text-[#061224]">{booking.leadGuest?.name ?? "Guest"}</p><p className="text-xs text-slate-500">{booking.leadGuest?.email}</p><p className="text-xs text-slate-500">{booking.leadGuest?.phone}</p></td><td className="py-4 pr-4 align-top"><p className="flex items-center gap-1 font-semibold"><CalendarDays className="h-4 w-4 text-[#c6973e]" />{booking.checkIn} to {booking.checkOut}</p><p className="text-xs text-slate-500">{booking.nights} nights · {booking.adults + booking.children} guests</p><p className="mt-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-bold capitalize text-slate-700">{label(booking.bookingStatus)}</p></td><td className="py-4 pr-4 align-top"><p className="font-bold text-[#061224]">{money(booking.totalPaise, booking.currency)}</p><p className="text-xs text-slate-500">Paid {money(booking.paidPaise, booking.currency)}</p><p className="text-xs capitalize text-slate-500">{label(booking.paymentStatus)}</p></td><td className="py-4 text-right align-top">{["pending_payment", "confirmed"].includes(booking.bookingStatus) && <button type="button" disabled={busy === booking.id} onClick={() => void cancel(booking.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50"><XCircle className="h-4 w-4" />{busy === booking.id ? "Cancelling" : "Cancel"}</button>}</td></tr>)}</tbody></table>{bookings.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No bookings match this view.</p>}</div>}</div></section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-[#061224]">{value}</p></div>;
}
