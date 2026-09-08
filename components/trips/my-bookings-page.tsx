"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Hotel, RefreshCw, XCircle } from "lucide-react";
import { SiteHeader } from "@/components/home/home-page";

type Booking = {
  id: string;
  confirmationCode: string;
  propertySlug: string | null;
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
  razorpayOrderId: string | null;
};

declare global {
  interface Window {
    Razorpay?: new (options: {
      key: string;
      amount: number;
      currency: string;
      name: string;
      order_id: string;
      handler: (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => void;
      modal?: { ondismiss: () => void };
    }) => { open: () => void };
  }
}

const tabs = [
  { id: "upcoming", label: "Upcoming" },
  { id: "pending_payment", label: "Pending payment" },
  { id: "past", label: "Past" },
  { id: "cancelled", label: "Cancelled" },
] as const;

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value / 100);

const prettyDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const statusLabel = (value: string) => value.replaceAll("_", " ");

async function loadRazorpay() {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Secure payment could not load. Please try again."));
    document.head.appendChild(script);
  });
}

export function MyBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("upcoming");
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/bookings/mine", { cache: "no-store" });
      const body = (await response.json()) as {
        bookings?: Booking[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          body.error === "UNAUTHENTICATED"
            ? "Sign in to view your bookings."
            : "Unable to load bookings."
        );
      setBookings(body.bookings ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load bookings."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, []);

  const visible = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return bookings.filter((booking) => {
      if (tab === "pending_payment")
        return booking.bookingStatus === "pending_payment";
      if (tab === "cancelled")
        return [
          "cancelled",
          "no_show",
          "expired",
          "payment_failed",
        ].includes(booking.bookingStatus);
      if (tab === "past")
        return (
          ![
            "cancelled",
            "no_show",
            "expired",
            "payment_failed",
            "pending_payment",
          ].includes(booking.bookingStatus) && booking.checkOut < today
        );
      return (
        ![
          "cancelled",
          "no_show",
          "expired",
          "payment_failed",
          "pending_payment",
        ].includes(booking.bookingStatus) && booking.checkOut >= today
      );
    });
  }, [bookings, tab]);

  const cancel = async (bookingId: string) => {
    setBusy(bookingId);
    setError("");
    try {
      const response = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: "POST",
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to cancel booking.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to cancel booking."
      );
    } finally {
      setBusy(null);
    }
  };

  const resumePayment = async (bookingId: string) => {
    setBusy(bookingId);
    setError("");
    try {
      const response = await fetch(
        `/api/bookings/${bookingId}/payment-session`,
        { method: "POST" }
      );
      const result = (await response.json()) as {
        error?: string;
        confirmationCode?: string;
        razorpay?: {
          keyId: string;
          amount: number;
          currency: string;
          name: string;
          orderId: string;
        };
      };
      if (!response.ok || !result.razorpay)
        throw new Error(result.error ?? "Unable to resume payment.");
      await loadRazorpay();
      if (!window.Razorpay) throw new Error("Secure payment is unavailable.");
      new window.Razorpay({
        key: result.razorpay.keyId,
        amount: result.razorpay.amount,
        currency: result.razorpay.currency,
        name: result.razorpay.name,
        order_id: result.razorpay.orderId,
        handler: async (payment) => {
          const verified = await fetch(
            `/api/bookings/${bookingId}/verify-payment`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payment),
            }
          );
          if (!verified.ok) {
            setError(
              "Payment was received but could not be verified. Please contact support."
            );
            setBusy(null);
            return;
          }
          await load();
          setTab("upcoming");
          setBusy(null);
        },
        modal: { ondismiss: () => setBusy(null) },
      }).open();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to resume payment."
      );
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--hk-ivory)] text-[var(--hk-ink)]">
      <SiteHeader onLoginClick={() => {}} />
      <main className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--hk-gold-strong)]">
              Reservations
            </p>
            <h1 className="mt-2 text-4xl font-bold text-[var(--hk-navy)]">
              My bookings
            </h1>
            <p className="mt-2 text-[var(--hk-muted)]">
              Track confirmed stays, pending payments, and cancellation status.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--hk-border-strong)] bg-[#fff] px-4 py-2 text-sm font-bold text-[var(--hk-navy)]"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="mt-8 flex gap-2 overflow-x-auto">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-bold ${
                tab === item.id
                  ? "bg-[var(--hk-navy)] text-white"
                  : "border border-[var(--hk-border)] bg-white text-[var(--hk-muted)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-8 rounded-xl border border-[var(--hk-border)] bg-white p-8 text-[var(--hk-muted)]">
            Loading bookings...
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div className="mt-8 rounded-xl border border-dashed border-[var(--hk-border-strong)] bg-white p-8 text-[var(--hk-muted)]">
            No bookings in this section.{" "}
            <Link href="/search" className="font-bold text-[var(--hk-navy)] underline">
              Explore stays
            </Link>
          </div>
        )}

        <div className="mt-8 space-y-5">
          {visible.map((booking) => (
            <article
              key={booking.id}
              className="rounded-xl border border-[var(--hk-border)] bg-white p-5 shadow-[var(--hk-shadow-soft)]"
            >
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-[var(--hk-surface-soft)] text-[var(--hk-navy)]">
                    <Hotel className="h-7 w-7" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold text-[var(--hk-navy)]">
                        {booking.propertyName}
                      </h2>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ${
                          booking.bookingStatus === "confirmed"
                            ? "bg-[#000615] text-white"
                            : booking.bookingStatus === "pending_payment"
                            ? "bg-amber-50 text-amber-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {booking.bookingStatus === "confirmed" ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        {statusLabel(booking.bookingStatus)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--hk-muted)]">
                      {booking.roomName} · {booking.ratePlanName} ·{" "}
                      {booking.confirmationCode}
                    </p>
                    <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-[var(--hk-navy)]">
                      <CalendarDays className="h-4 w-4" />
                      {prettyDate(booking.checkIn)} to {prettyDate(booking.checkOut)}{" "}
                      · {booking.nights} night{booking.nights === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-sm text-[var(--hk-muted)]">
                      {booking.adults} adult{booking.adults === 1 ? "" : "s"}
                      {booking.children
                        ? `, ${booking.children} child${
                            booking.children === 1 ? "" : "ren"
                          }`
                        : ""}
                    </p>
                  </div>
                </div>

                <div className="min-w-[220px] lg:text-right">
                  <p className="text-2xl font-bold text-[var(--hk-navy)]">
                    {money(booking.totalPaise, booking.currency)}
                  </p>
                  <p className="text-sm text-[var(--hk-muted)]">
                    Payment: {statusLabel(booking.paymentStatus)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 lg:justify-end">
                    {booking.propertySlug && (
                      <Link
                        href={`/hotels/${booking.propertySlug}`}
                        className="rounded-lg border border-[var(--hk-border-strong)] px-3 py-2 text-sm font-bold text-[var(--hk-navy)]"
                      >
                        View stay
                      </Link>
                    )}
                    {booking.bookingStatus === "pending_payment" && (
                      <button
                        type="button"
                        disabled={busy === booking.id}
                        onClick={() => void resumePayment(booking.id)}
                        className="rounded-lg bg-[var(--hk-navy)] px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {busy === booking.id
                          ? "Opening payment..."
                          : "Continue payment"}
                      </button>
                    )}
                    {["pending_payment", "confirmed"].includes(
                      booking.bookingStatus
                    ) && (
                      <button
                        type="button"
                        disabled={busy === booking.id}
                        onClick={() => void cancel(booking.id)}
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-50"
                      >
                        {busy === booking.id ? "Working..." : "Cancel"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
