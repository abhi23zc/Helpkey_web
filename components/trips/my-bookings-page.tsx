"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Edit,
  FileText,
  Hotel,
  MapPin,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { SiteHeader } from "@/components/shared/site-header";
import { BookingReceiptModal, BookingReceiptData } from "./booking-receipt-modal";

type Booking = {
  id: string;
  confirmationCode: string;
  propertyId: string;
  propertySlug: string | null;
  propertyName: string;
  propertyCity?: string | null;
  propertyState?: string | null;
  propertyCoverImageUrl?: string | null;
  checkInTime?: string;
  checkOutTime?: string;
  roomName: string;
  ratePlanName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  infants: number;
  leadGuest?: {
    name: string;
    email: string;
    phone: string;
  } | null;
  subtotalPaise?: number;
  taxPaise?: number;
  customerFeePaise?: number;
  totalPaise: number;
  payableNowPaise: number;
  paidPaise: number;
  currency: string;
  bookingStatus: string;
  paymentStatus: string;
  paymentMethod: string | null;
  razorpayOrderId: string | null;
  createdAt?: string | null;
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

const FALLBACK_HOTEL_IMAGES = [
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80",
];

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value / 100);

const prettyDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const statusLabel = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

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
  const [receiptBooking, setReceiptBooking] = useState<BookingReceiptData | null>(
    null
  );

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
    if (!window.confirm("Are you sure you want to cancel this booking?")) {
      return;
    }
    setBusy(bookingId);
    setError("");
    try {
      const response = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: "POST",
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error ?? "Unable to cancel booking.");
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
    <div className="min-h-screen flex flex-col bg-[#f8f7f3] text-[#141b2b] font-sans">
      <SiteHeader onLoginClick={() => {}} />

      <main className="flex-grow w-full max-w-[1280px] mx-auto px-4 sm:px-6 md:px-10 py-10 md:py-16">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-[#0b1f3a] mb-2">
              My Bookings
            </h1>
            <p className="text-base md:text-lg text-[#44474d]">
              Manage your upcoming stays and review past trips.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="self-start md:self-auto inline-flex items-center gap-2 rounded-xl border border-[#e5e1d8] bg-white px-4 py-2.5 text-sm font-semibold text-[#0b1f3a] shadow-sm hover:border-[#0b1f3a] hover:bg-slate-50 transition-all"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Tab Filters */}
        <div className="flex gap-1.5 p-1.5 mb-10 bg-[#e9edff]/60 rounded-full w-fit max-w-full overflow-x-auto border border-[#e5e1d8]/50">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`px-5 sm:px-6 py-2 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-200 ${
                tab === item.id
                  ? "bg-[#0b1f3a] text-white shadow-md"
                  : "text-[#44474d] hover:text-[#0b1f3a] hover:bg-white/60"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-8 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900 flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              className="text-rose-700 hover:text-rose-900 text-xs font-bold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Loading State Skeleton */}
        {loading && (
          <div className="space-y-6">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col md:flex-row gap-6 animate-pulse"
              >
                <div className="w-full md:w-1/3 lg:w-1/4 h-48 bg-slate-200 rounded-xl" />
                <div className="flex-grow space-y-4">
                  <div className="h-6 bg-slate-200 rounded w-1/3" />
                  <div className="h-4 bg-slate-100 rounded w-1/4" />
                  <div className="h-20 bg-slate-100 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && visible.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
            <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
              <Hotel className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-[#0b1f3a]">No bookings found</h3>
            <p className="text-sm text-[#44474d] mt-1 max-w-sm mx-auto">
              {tab === "upcoming"
                ? "You have no upcoming stays booked at the moment."
                : tab === "pending_payment"
                ? "No pending payment bookings."
                : tab === "past"
                ? "No past completed stays recorded."
                : "No cancelled bookings."}
            </p>
            <Link
              href="/search"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#0b1f3a] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-opacity-90 transition-colors"
            >
              Explore Stays
            </Link>
          </div>
        )}

        {/* Booking Cards List */}
        {!loading && visible.length > 0 && (
          <div className="space-y-6">
            {visible.map((booking, idx) => {
              const fallbackImage =
                FALLBACK_HOTEL_IMAGES[idx % FALLBACK_HOTEL_IMAGES.length];
              const coverImage = booking.propertyCoverImageUrl || fallbackImage;

              const isConfirmed = booking.bookingStatus === "confirmed";
              const isPending = booking.bookingStatus === "pending_payment";
              const isCancelled = [
                "cancelled",
                "no_show",
                "expired",
                "payment_failed",
              ].includes(booking.bookingStatus);

              const locationStr = [
                booking.propertyCity,
                booking.propertyState,
              ]
                .filter(Boolean)
                .join(", ");

              return (
                <div
                  key={booking.id}
                  className="bg-white rounded-2xl p-6 flex flex-col md:flex-row gap-6 border border-transparent shadow-[0_4px_20px_rgba(11,31,58,0.04)] hover:border-[#0b1f3a]/10 hover:shadow-[0_12px_32px_rgba(11,31,58,0.08)] transition-all duration-300"
                >
                  {/* Left Side Hotel Cover Image with Status Badge */}
                  <div className="w-full md:w-1/3 lg:w-1/4 h-48 md:h-auto min-h-[190px] rounded-xl overflow-hidden relative group shrink-0 bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={coverImage}
                      alt={booking.propertyName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />

                    {/* Status Badge */}
                    <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm border border-slate-100">
                      {isConfirmed ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#2f7d5c]" />
                          <span className="text-[#2f7d5c] text-xs font-bold">
                            Confirmed
                          </span>
                        </>
                      ) : isPending ? (
                        <>
                          <Clock className="h-3.5 w-3.5 text-amber-600" />
                          <span className="text-amber-700 text-xs font-bold">
                            Pending Payment
                          </span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3.5 w-3.5 text-slate-500" />
                          <span className="text-slate-600 text-xs font-bold">
                            {statusLabel(booking.bookingStatus)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right Side Content */}
                  <div className="flex-grow flex flex-col justify-between">
                    <div>
                      {/* Title & Price Header */}
                      <div className="flex justify-between items-start gap-4 mb-2">
                        <div>
                          <h3 className="font-bold text-xl md:text-2xl text-[#141b2b] tracking-tight mb-1">
                            {booking.propertyName}
                          </h3>
                          <div className="flex items-center text-[#44474d] text-sm gap-1">
                            <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                            <span>{locationStr || "India"}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-bold text-2xl text-[#141b2b]">
                            {money(booking.totalPaise, booking.currency)}
                          </div>
                          <div className="text-xs text-[#44474d] mt-0.5">
                            Total for {booking.nights} night
                            {booking.nights > 1 ? "s" : ""}
                          </div>
                        </div>
                      </div>

                      {/* 4-Column Details Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 p-4 bg-[#f8f7f3] rounded-xl border border-[#e5e1d8]/60">
                        <div>
                          <div className="text-[11px] font-bold text-[#44474d] uppercase tracking-wider mb-1">
                            Check In
                          </div>
                          <div className="text-sm font-semibold text-[#141b2b]">
                            {prettyDate(booking.checkIn)}
                          </div>
                          <div className="text-xs text-[#44474d] mt-0.5">
                            {booking.checkInTime || "3:00 PM"}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] font-bold text-[#44474d] uppercase tracking-wider mb-1">
                            Check Out
                          </div>
                          <div className="text-sm font-semibold text-[#141b2b]">
                            {prettyDate(booking.checkOut)}
                          </div>
                          <div className="text-xs text-[#44474d] mt-0.5">
                            {booking.checkOutTime || "11:00 AM"}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] font-bold text-[#44474d] uppercase tracking-wider mb-1">
                            Guests
                          </div>
                          <div className="text-sm font-semibold text-[#141b2b]">
                            {booking.adults} Adult
                            {booking.adults > 1 ? "s" : ""}
                            {booking.children ? `, ${booking.children} Child` : ""}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] font-bold text-[#44474d] uppercase tracking-wider mb-1">
                            Confirmation
                          </div>
                          <div className="text-sm font-semibold text-[#141b2b] font-mono">
                            #{booking.confirmationCode}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons Footer */}
                    <div className="flex flex-wrap gap-3 mt-6 justify-end items-center">
                      {/* Cancel / Change Booking */}
                      {["pending_payment", "confirmed"].includes(
                        booking.bookingStatus
                      ) && (
                        <button
                          type="button"
                          disabled={busy === booking.id}
                          onClick={() => void cancel(booking.id)}
                          className="px-5 py-2.5 rounded-xl border border-[#0b1f3a] text-[#0b1f3a] font-semibold text-sm hover:bg-[#0b1f3a] hover:text-white transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                          <Edit className="h-4 w-4" />
                          {busy === booking.id
                            ? "Processing..."
                            : "Change Booking"}
                        </button>
                      )}

                      {/* Continue Payment */}
                      {booking.bookingStatus === "pending_payment" && (
                        <button
                          type="button"
                          disabled={busy === booking.id}
                          onClick={() => void resumePayment(booking.id)}
                          className="px-5 py-2.5 rounded-xl bg-[#0b1f3a] text-white font-semibold text-sm hover:bg-opacity-90 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                        >
                          <Clock className="h-4 w-4" />
                          {busy === booking.id
                            ? "Opening Payment..."
                            : "Continue Payment"}
                        </button>
                      )}

                      {/* View Stay Link */}
                      {booking.propertySlug && (
                        <Link
                          href={`/hotels/${booking.propertySlug}`}
                          className="px-5 py-2.5 rounded-xl border border-[#e5e1d8] text-[#141b2b] font-semibold text-sm hover:border-[#0b1f3a] transition-colors flex items-center gap-2"
                        >
                          View stay
                        </Link>
                      )}

                      {/* Get Receipt Modal Trigger */}
                      <button
                        type="button"
                        onClick={() => setReceiptBooking(booking)}
                        className="px-5 py-2.5 rounded-xl border border-[#e5e1d8] text-[#141b2b] font-semibold text-sm hover:border-[#0b1f3a] transition-colors flex items-center gap-2"
                      >
                        <FileText className="h-4 w-4" />
                        Get Receipt
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Booking Receipt Modal */}
      <BookingReceiptModal
        booking={receiptBooking}
        onClose={() => setReceiptBooking(null)}
      />

      {/* Page Footer */}
      <footer className="bg-white border-t border-[#e5e1d8] mt-auto">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 md:px-10 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 text-xl font-bold text-[#0b1f3a]">
            <Hotel className="h-5 w-5" />
            <span>Helpkey</span>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-[#44474d]">
            <a href="#" className="hover:text-[#0b1f3a] transition-colors">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-[#0b1f3a] transition-colors">
              Terms of Service
            </a>
            <a href="#" className="hover:text-[#0b1f3a] transition-colors">
              Cookie Policy
            </a>
            <a href="#" className="hover:text-[#0b1f3a] transition-colors">
              Careers
            </a>
          </div>
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} Helpkey International. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
