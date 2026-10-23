"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  HelpCircle,
  Hotel,
  IndianRupee,
  Mail,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  Printer,
  RefreshCw,
  Share2,
  ShieldCheck,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { apiFetch } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { formatMoney, cancellationTerms, cancellationLabel } from "@/lib/customer/offer";
import { BookingReceiptModal, type BookingReceiptData } from "./booking-receipt-modal";
import { PublicMediaImage } from "@/components/shared/public-media-image";
import { SiteHeader } from "@/components/shared/site-header";

type CancellationPolicy = {
  name: string;
  description: string;
  refundableUntilHours: number;
  cancellationFeePercent: number;
} | null;

export type CustomerBooking = BookingReceiptData & {
  propertySlug: string | null;
  propertyAddress: string | null;
  propertyPublicPhone: string | null;
  propertyPublicEmail: string | null;
  propertyCoverImageUrl: string | null;
  infants: number;
  payableNowPaise: number;
  startAt: string | null;
  endAt: string | null;
  timezone: string;
  cancellationPolicy: CancellationPolicy;
  bookingStatus: string;
  paymentStatus: string;
  specialRequest?: string | null;
  propertyId?: string;
};

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

const prettyDate = (value: string) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parseLocalDate(value));
};

const prettyDay = (value: string) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { weekday: "long" }).format(parseLocalDate(value));
};

const prettyDateShort = (value: string) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(parseLocalDate(value));
};

function formatFriendlyTime(timeStr?: string | null, fallback = "14:00"): string {
  if (!timeStr) return fallback;
  if (timeStr.toLowerCase().includes("am") || timeStr.toLowerCase().includes("pm")) {
    return timeStr;
  }
  const [hStr, mStr] = timeStr.split(":");
  const hour = parseInt(hStr, 10);
  if (isNaN(hour)) return timeStr;
  const minute = mStr ? mStr.slice(0, 2) : "00";
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute} ${ampm}`;
}

function cleanAddress(raw: string | null | undefined): string {
  if (!raw) return "";
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  const cleaned: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i > 0 && part.toLowerCase() === parts[i - 1].toLowerCase()) continue;
    cleaned.push(part);
  }
  const result: string[] = [];
  const seenCityState = new Set<string>();
  for (let i = 0; i < cleaned.length; i++) {
    const token = cleaned[i].toLowerCase();
    const isPincode = /^\d{6}$/.test(token);
    if (!isPincode && result.length > 3 && seenCityState.has(token)) {
      continue;
    }
    seenCityState.add(token);
    result.push(cleaned[i]);
  }
  return result.join(", ");
}

const statusDetails = (booking: CustomerBooking) => {
  if (["confirmed"].includes(booking.bookingStatus)) {
    return {
      title: "Booking confirmed & guaranteed",
      badge: "Confirmed & Guaranteed",
      detail: `Your reservation at ${booking.propertyName} is fully confirmed. A copy has been emailed to you.`,
      tone: "pine",
    } as const;
  }
  if (["checked_in"].includes(booking.bookingStatus)) {
    return {
      title: "You are checked in",
      badge: "Active Stay",
      detail: `Welcome to ${booking.propertyName}. Have a comfortable and pleasant stay!`,
      tone: "pine",
    } as const;
  }
  if (["checked_out"].includes(booking.bookingStatus)) {
    return {
      title: "Stay completed",
      badge: "Completed Stay",
      detail: `Thank you for staying at ${booking.propertyName}. We hope you had a restful stay!`,
      tone: "slate",
    } as const;
  }
  if (booking.bookingStatus === "pending_payment") {
    return {
      title: "Confirming your payment",
      badge: "Payment In Progress",
      detail: "We are securely verifying your transaction with the payment gateway. This will refresh automatically.",
      tone: "stone",
    } as const;
  }
  if (booking.paymentStatus === "refund_pending" || booking.paymentStatus === "refunded") {
    return {
      title: "Refund in progress",
      badge: "Refund Processing",
      detail: "The amount is being returned to your original payment method. Typically takes 3–5 working days.",
      tone: "stone",
    } as const;
  }
  if (["cancelled", "expired", "no_show", "payment_failed"].includes(booking.bookingStatus)) {
    return {
      title: "Reservation cancelled",
      badge: "Cancelled",
      detail: "This booking is no longer active. If you need any assistance, our traveler concierge is available.",
      tone: "stone",
    } as const;
  }
  return {
    title: "Booking needs attention",
    badge: "Attention Required",
    detail: "Please review your booking details or connect with Helpkey traveler support.",
    tone: "stone",
  } as const;
};

function getStayTiming(booking: CustomerBooking) {
  if (booking.bookingStatus === "checked_in") {
    return { pill: "Currently Checked In" };
  }
  if (booking.bookingStatus === "checked_out") {
    return { pill: "Completed Stay" };
  }
  if (["cancelled", "expired", "payment_failed"].includes(booking.bookingStatus)) {
    return { pill: "Reservation Inactive" };
  }

  const checkInDate = parseLocalDate(booking.checkIn);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const checkInMidnight = new Date(checkInDate.getFullYear(), checkInDate.getMonth(), checkInDate.getDate());
  const diffDays = Math.round((checkInMidnight.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return { pill: "Check-in today" };
  }
  if (diffDays === 1) {
    return { pill: "Check-in tomorrow" };
  }
  if (diffDays > 1) {
    return { pill: `Check-in in ${diffDays} days` };
  }
  if (diffDays < 0) {
    return { pill: "Past Stay" };
  }
  return { pill: "Confirmed" };
}

const icsText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
const icsUtc = (value: string) =>
  new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function downloadCalendar(booking: CustomerBooking) {
  if (!booking.startAt || !booking.endAt) return;
  const location = cleanAddress(
    [booking.propertyAddress, booking.propertyCity, booking.propertyState].filter(Boolean).join(", ")
  );
  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Helpkey//Hotel Itinerary//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${booking.id}@helpkey.in`,
    `DTSTAMP:${icsUtc(new Date().toISOString())}`,
    `DTSTART:${icsUtc(booking.startAt)}`,
    `DTEND:${icsUtc(booking.endAt)}`,
    `SUMMARY:${icsText(`Hotel Stay at ${booking.propertyName}`)}`,
    `LOCATION:${icsText(location || booking.propertyName)}`,
    `DESCRIPTION:${icsText(
      `Helpkey Booking ID: ${booking.confirmationCode}\\nHotel: ${booking.propertyName}\\nRoom: ${booking.roomName}\\nCheck-in: ${formatFriendlyTime(
        booking.checkInTime,
        "2:00 PM"
      )}\\nCheck-out: ${formatFriendlyTime(booking.checkOutTime, "11:00 AM")}`
    )}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([calendar], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `Helpkey-${booking.confirmationCode}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getGoogleCalendarUrl(booking: CustomerBooking) {
  if (!booking.startAt || !booking.endAt) return null;
  try {
    const start = new Date(booking.startAt).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const end = new Date(booking.endAt).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const address = cleanAddress(
      [booking.propertyAddress, booking.propertyCity, booking.propertyState].filter(Boolean).join(", ")
    );
    const title = encodeURIComponent(`Hotel Stay: ${booking.propertyName}`);
    const details = encodeURIComponent(
      `Helpkey Booking ID: ${booking.confirmationCode}\n` +
        `Property: ${booking.propertyName}\n` +
        `Room: ${booking.roomName} (${booking.ratePlanName})\n` +
        `Check-in: ${formatFriendlyTime(booking.checkInTime, "2:00 PM")}\n` +
        `Check-out: ${formatFriendlyTime(booking.checkOutTime, "11:00 AM")}\n` +
        `Guest: ${booking.leadGuest?.name || "Guest"}\n`
    );
    const location = encodeURIComponent(address || booking.propertyName);
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=${location}`;
  } catch {
    return null;
  }
}

function getWhatsAppUrl(booking: CustomerBooking) {
  if (!booking.propertyPublicPhone) return null;
  const digits = booking.propertyPublicPhone.replace(/\D/g, "");
  if (!digits) return null;
  const phone = digits.length === 10 ? `91${digits}` : digits;
  const text = encodeURIComponent(
    `Hello ${booking.propertyName}, I have a reservation via Helpkey (Booking ID: ${booking.confirmationCode}) under ${
      booking.leadGuest?.name || "my name"
    } for check-in on ${prettyDate(booking.checkIn)}. I would like to inquire about my arrival.`
  );
  return `https://wa.me/${phone}?text=${text}`;
}

export function BookingItineraryPage({ initialBooking }: { initialBooking: CustomerBooking }) {
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [calendarMenuOpen, setCalendarMenuOpen] = useState(false);

  const bookingQuery = useQuery({
    queryKey: queryKeys.booking(initialBooking.id),
    queryFn: ({ signal }) =>
      apiFetch<{ booking: CustomerBooking }>(`/api/bookings/${encodeURIComponent(initialBooking.id)}`, {
        signal,
        cache: "no-store",
      }),
    initialData: { booking: initialBooking },
    select: (result) => result.booking,
    refetchInterval: (query) => (query.state.data?.booking.bookingStatus === "pending_payment" ? 4_000 : false),
    refetchOnWindowFocus: true,
  });

  const booking = bookingQuery.data ?? initialBooking;
  const status = statusDetails(booking);
  const timing = getStayTiming(booking);
  const balance = Math.max(0, booking.totalPaise - booking.paidPaise);
  const isPaidInFull = booking.paidPaise >= booking.totalPaise;
  const bookedAmenities = booking.amenitySnapshot
    ? [
        ...booking.amenitySnapshot.roomAmenities.map((amenity) => ({ ...amenity, group: "In your room" })),
        ...booking.amenitySnapshot.propertyAmenities.map((amenity) => ({ ...amenity, group: "Hotel facility" })),
        ...booking.amenitySnapshot.rateInclusions.map((amenity) => ({ ...amenity, group: "Rate inclusion" })),
      ]
    : [];

  const displayAddress = cleanAddress(
    [booking.propertyAddress, booking.propertyCity, booking.propertyState].filter(Boolean).join(", ")
  );

  const googleMapsUrl = displayAddress || booking.propertyName
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [booking.propertyName, displayAddress].filter(Boolean).join(", ")
      )}`
    : null;

  const appleMapsUrl = displayAddress || booking.propertyName
    ? `https://maps.apple.com/?q=${encodeURIComponent(
        [booking.propertyName, displayAddress].filter(Boolean).join(", ")
      )}`
    : null;

  const cancellationTermsData =
    booking.cancellationPolicy && booking.startAt
      ? cancellationTerms(booking.cancellationPolicy as Record<string, unknown>, booking.startAt)
      : null;
  const freeCancellationBadge = cancellationTermsData
    ? cancellationLabel(cancellationTermsData, booking.timezone)
    : null;

  const isCancellable =
    ["confirmed", "pending_payment"].includes(booking.bookingStatus);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(null), 2400);
  };

  const copyCode = async () => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(booking.confirmationCode);
    } catch {
      const input = document.createElement("textarea");
      input.value = booking.confirmationCode;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCodeCopied(true);
    triggerToast("Booking ID copied to clipboard");
    window.setTimeout(() => setCodeCopied(false), 2000);
  };

  const copyAddress = async () => {
    if (!displayAddress) return;
    try {
      await navigator.clipboard.writeText(displayAddress);
      triggerToast("Hotel address copied");
    } catch {
      triggerToast("Unable to copy address.");
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: `Stay at ${booking.propertyName}`,
      text: `Hotel reservation confirmed at ${booking.propertyName} (${booking.propertyCity || ""})! Booking ID: ${
        booking.confirmationCode
      }. Check-in: ${prettyDate(booking.checkIn)}.`,
      url: window.location.href,
    };
    if (typeof navigator !== "undefined" && navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${shareData.text} Link: ${window.location.href}`);
      triggerToast("Itinerary link copied to clipboard");
    } catch {
      triggerToast("Unable to copy link.");
    }
  };

  const handleConfirmCancel = async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(booking.id)}/cancel`, {
        method: "POST",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Unable to cancel booking.");
      }
      setCancelModalOpen(false);
      triggerToast("Your reservation has been cancelled.");
      await bookingQuery.refetch();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Cancellation failed. Please contact Helpkey support.");
    } finally {
      setCancelling(false);
    }
  };

  const whatsappUrl = getWhatsAppUrl(booking);
  const googleCalUrl = getGoogleCalendarUrl(booking);

  return (
    <main className="min-h-screen bg-[#fbfaf8] pb-16 text-[#121826]">
      <SiteHeader />

      {/* Floating Quiet Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center gap-2 rounded-full border border-stone-200/90 bg-[#111827] px-4 py-2 text-xs font-semibold text-white shadow-xl">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#a7c5b3]" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[1140px] px-4 py-6 sm:px-6 sm:py-8">
        {/* Top Navigation Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7e4dc] pb-4">
          <Link
            href="/trips"
            className="group inline-flex items-center gap-2 py-1 text-xs font-bold uppercase tracking-wider text-stone-600 transition hover:text-[#0b1f3a]"
          >
            <span className="transition-transform group-hover:-translate-x-0.5">←</span>
            <span>Back to My Trips</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#e7e4dc] bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-2xs transition hover:bg-stone-50 hover:text-[#0b1f3a]"
              title="Share itinerary"
            >
              <Share2 className="h-3.5 w-3.5 text-stone-500" />
              <span>Share</span>
            </button>

            <button
              type="button"
              onClick={() => setReceiptOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#e7e4dc] bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-2xs transition hover:bg-stone-50 hover:text-[#0b1f3a]"
              title="View receipt"
            >
              <Printer className="h-3.5 w-3.5 text-stone-500" />
              <span>View receipt</span>
            </button>

            <Link
              href="/help"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#e7e4dc] bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-2xs transition hover:bg-stone-50 hover:text-[#0b1f3a]"
            >
              <HelpCircle className="h-3.5 w-3.5 text-stone-500" />
              <span>Support</span>
            </Link>
          </div>
        </div>

        {/* Hero Banner: Luxury Atelier / Architectural Quiet White Card */}
        <section
          aria-live="polite"
          className="relative mt-5 rounded-2xl border border-[#e7e4dc] bg-white p-5 sm:p-7 shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                  status.tone === "pine"
                    ? "bg-[#183b2b] text-white"
                    : status.tone === "slate"
                    ? "bg-stone-800 text-white"
                    : "bg-stone-800 text-white"
                }`}
              >
                {status.tone === "pine" ? (
                  <CheckCircle2 className="h-5 w-5 stroke-[2]" />
                ) : (
                  <Clock3 className="h-5 w-5 stroke-[2]" />
                )}
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md border border-stone-200/80 bg-stone-100/70 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-700">
                    <ShieldCheck className="h-3 w-3 text-stone-600" />
                    Helpkey Guaranteed
                  </span>
                  <span className="inline-flex items-center rounded-md border border-[#d6e2d9] bg-[#f0f4f1] px-2 py-0.5 text-[10px] font-bold text-[#183b2b]">
                    {timing.pill}
                  </span>
                </div>

                <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#0f172a] sm:text-3xl">
                  {status.title}
                </h1>
                <p className="mt-1 max-w-2xl text-xs sm:text-sm leading-relaxed text-stone-600">
                  {status.detail}
                </p>
              </div>
            </div>

            {/* Quick Hero Key Data Pills */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2 md:pt-0">
              <div className="rounded-xl border border-[#e7e4dc] bg-stone-50/70 px-3.5 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Booking Reference
                </span>
                <span className="font-mono text-sm font-extrabold tracking-tight text-[#0b1f3a]">
                  {booking.confirmationCode}
                </span>
              </div>
              <div className="rounded-xl border border-[#e7e4dc] bg-stone-50/70 px-3.5 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Check-in Window
                </span>
                <span className="text-sm font-bold text-[#0b1f3a]">
                  {prettyDateShort(booking.checkIn)} • {formatFriendlyTime(booking.checkInTime, "2:00 PM")}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Main 2-Column Layout */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* LEFT / PRIMARY COLUMN */}
          <section className="space-y-6">
            {/* DIGITAL HOTEL CHECK-IN PASS (BOARDING CARD) */}
            <article className="overflow-hidden rounded-2xl border border-[#e7e4dc] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
              {/* Hotel Featured Cover Image */}
              {booking.propertyCoverImageUrl && (
                <div className="relative h-52 w-full sm:h-64 overflow-hidden bg-stone-900">
                  <PublicMediaImage
                    src={booking.propertyCoverImageUrl}
                    alt={booking.propertyName}
                    className="h-full w-full object-cover transition duration-300 hover:scale-[1.01]"
                  />
                  <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between">
                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-stone-900 shadow-sm backdrop-blur-xs">
                        <Hotel className="h-3.5 w-3.5 text-stone-700" />
                        Helpkey Verified Hotel
                      </span>
                    </div>
                    {booking.propertySlug && (
                      <Link
                        href={`/hotel/${booking.propertySlug}`}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-black/55 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm backdrop-blur-md transition hover:bg-black/75"
                      >
                        <span>View Hotel Page</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {/* Pass Header: Executive Midnight Navy */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 bg-[#0b1f3a] px-6 py-3.5 text-white">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/10 text-stone-300">
                    <Hotel className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-xs font-bold tracking-wider uppercase text-stone-200">
                    Official Check-in Pass
                  </span>
                </div>
                <span className="text-[11px] font-normal text-stone-300">
                  Present at front desk reception upon arrival
                </span>
              </div>

              {/* Pass Body */}
              <div className="p-6">
                <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                      Stay Reservation
                    </span>
                    <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[#0f172a]">
                      {booking.propertySlug ? (
                        <Link
                          href={`/hotel/${booking.propertySlug}`}
                          className="hover:text-stone-700 hover:underline"
                        >
                          {booking.propertyName}
                        </Link>
                      ) : (
                        booking.propertyName
                      )}
                    </h2>

                    {displayAddress && (
                      <p className="mt-1.5 flex items-start gap-1.5 text-xs text-stone-600 leading-relaxed">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-500" />
                        <span>{displayAddress}</span>
                      </p>
                    )}

                    {/* Booking ID Highlight Box */}
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <div className="rounded-xl border border-[#e7e4dc] bg-stone-50/70 px-3.5 py-2">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-500">
                          Booking ID
                        </span>
                        <div className="flex items-center gap-2.5">
                          <code className="font-mono text-base font-extrabold tracking-wider text-[#0b1f3a]">
                            {booking.confirmationCode}
                          </code>
                          <button
                            type="button"
                            onClick={copyCode}
                            className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2 py-0.5 text-xs font-bold text-stone-700 shadow-2xs hover:bg-stone-50"
                            title="Copy booking ID"
                          >
                            {codeCopied ? (
                              <>
                                <Check className="h-3 w-3 text-[#183b2b]" />
                                <span className="text-[#183b2b]">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3 text-stone-500" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Primary Guest Tag */}
                      <div className="rounded-xl border border-[#e7e4dc] bg-stone-50/70 px-3.5 py-2">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-500">
                          Primary Staying Guest
                        </span>
                        <p className="text-sm font-bold text-[#0f172a]">
                          {booking.leadGuest?.name || "Confirmed Guest"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Scannable Vector QR Code Frame */}
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-[#e7e4dc] bg-stone-50/80 p-4 text-center">
                    <div className="rounded-xl bg-white p-2 shadow-2xs border border-stone-200/60">
                      <QRCodeSVG
                        value={booking.confirmationCode}
                        size={100}
                        bgColor="#ffffff"
                        fgColor="#0b1f3a"
                        level="M"
                      />
                    </div>
                    <span className="mt-2 text-[10px] font-semibold text-stone-600">
                      Scan at desk
                    </span>
                  </div>
                </div>

                {/* Direct Pass Action Toolbar */}
                <div className="mt-6 flex flex-wrap items-center gap-2.5 border-t border-stone-100 pt-5">
                  {/* Calendar Button */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setCalendarMenuOpen((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#0b1f3a] px-3.5 py-2 text-xs font-bold text-white shadow-2xs transition hover:bg-[#152e4d]"
                    >
                      <CalendarPlus className="h-3.5 w-3.5" />
                      <span>Add to Calendar</span>
                    </button>

                    {calendarMenuOpen && (
                      <div className="absolute left-0 top-full z-20 mt-1.5 w-56 rounded-xl border border-stone-200 bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100">
                        <button
                          type="button"
                          onClick={() => {
                            downloadCalendar(booking);
                            setCalendarMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-stone-700 hover:bg-stone-50"
                        >
                          <Calendar className="h-3.5 w-3.5 text-stone-500" />
                          <span>Apple Calendar / Outlook (.ics)</span>
                        </button>
                        {googleCalUrl && (
                          <a
                            href={googleCalUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => setCalendarMenuOpen(false)}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-stone-700 hover:bg-stone-50"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-stone-500" />
                            <span>Google Calendar (web)</span>
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Directions */}
                  {googleMapsUrl && (
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#e7e4dc] bg-white px-3.5 py-2 text-xs font-bold text-stone-800 shadow-2xs transition hover:bg-stone-50 hover:text-[#0b1f3a]"
                    >
                      <Navigation className="h-3.5 w-3.5 text-stone-600" />
                      <span>Google Maps</span>
                    </a>
                  )}

                  {/* WhatsApp Front Desk - Forest Pine Outline */}
                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#d6e2d9] bg-[#f0f4f1] px-3.5 py-2 text-xs font-bold text-[#183b2b] shadow-2xs transition hover:bg-[#e6efe9]"
                    >
                      <MessageSquare className="h-3.5 w-3.5 text-[#183b2b]" />
                      <span>WhatsApp Reception</span>
                    </a>
                  )}

                  {/* Call Property */}
                  {booking.propertyPublicPhone && (
                    <a
                      href={`tel:${booking.propertyPublicPhone}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#e7e4dc] bg-white px-3.5 py-2 text-xs font-bold text-stone-800 shadow-2xs transition hover:bg-stone-50 hover:text-[#0b1f3a]"
                    >
                      <Phone className="h-3.5 w-3.5 text-stone-500" />
                      <span>Call Hotel</span>
                    </a>
                  )}

                  {/* View Full Receipt */}
                  <button
                    type="button"
                    onClick={() => setReceiptOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#e7e4dc] bg-white px-3.5 py-2 text-xs font-bold text-stone-800 shadow-2xs transition hover:bg-stone-50 hover:text-[#0b1f3a]"
                  >
                    <FileText className="h-3.5 w-3.5 text-stone-500" />
                    <span>View Receipt</span>
                  </button>
                </div>
              </div>
            </article>

            {/* VISUAL STAY TIMELINE & DATES */}
            <article className="overflow-hidden rounded-2xl border border-[#e7e4dc] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
              <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-[#0f172a]">Stay Schedule & Itinerary</h3>
                  <p className="text-xs text-stone-500">Official check-in and check-out window</p>
                </div>
                <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-bold text-stone-700">
                  {booking.bookingMode === "hourly"
                    ? `${Math.round((booking.durationMinutes ?? 0) / 60)} Hours Stay`
                    : `${booking.nights} Night${booking.nights === 1 ? "" : "s"}`}
                </span>
              </div>

              {/* Graphic Journey Tracker */}
              <div className="mt-6 grid grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
                {/* Check-in Node */}
                <div className="rounded-2xl border border-[#e7e4dc] bg-stone-50/60 p-4.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0f4f1] text-[#183b2b]">
                      <Clock className="h-4 w-4" />
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#183b2b]">
                      Check-In
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-stone-500">{prettyDay(booking.checkIn)}</p>
                  <p className="text-lg font-extrabold text-[#0f172a]">{prettyDate(booking.checkIn)}</p>
                  <div className="mt-1 flex items-center gap-1.5 text-xs font-bold text-stone-700">
                    <span>From {formatFriendlyTime(booking.checkInTime, "2:00 PM")}</span>
                  </div>
                </div>

                {/* Duration Connector Indicator */}
                <div className="hidden flex-col items-center justify-center sm:flex">
                  <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-[11px] font-extrabold text-[#0b1f3a] shadow-2xs">
                    {booking.bookingMode === "hourly"
                      ? `${Math.round((booking.durationMinutes ?? 0) / 60)}h`
                      : `${booking.nights}n`}
                  </span>
                  <div className="mt-1 flex items-center text-stone-300">
                    <div className="h-0.5 w-12 bg-stone-200" />
                    <ArrowRight className="h-4 w-4 text-stone-400 -ml-1" />
                  </div>
                </div>

                {/* Check-out Node */}
                <div className="rounded-2xl border border-[#e7e4dc] bg-stone-50/60 p-4.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-200/80 text-stone-700">
                      <Clock className="h-4 w-4" />
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-stone-600">
                      Check-Out
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-stone-500">{prettyDay(booking.checkOut)}</p>
                  <p className="text-lg font-extrabold text-[#0f172a]">{prettyDate(booking.checkOut)}</p>
                  <div className="mt-1 flex items-center gap-1.5 text-xs font-bold text-stone-700">
                    <span>Until {formatFriendlyTime(booking.checkOutTime, "11:00 AM")}</span>
                  </div>
                </div>
              </div>

              {/* Guests and Room Summary Bar */}
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-stone-100 pt-5 sm:grid-cols-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    Room Type
                  </span>
                  <p className="mt-0.5 text-sm font-bold text-[#0f172a]">{booking.roomName}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    Rate Plan
                  </span>
                  <p className="mt-0.5 text-sm font-bold text-[#0f172a]">{booking.ratePlanName}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    Guests
                  </span>
                  <p className="mt-0.5 text-sm font-bold text-[#0f172a]">
                    {booking.adults} Adult{booking.adults === 1 ? "" : "s"}
                    {booking.children ? `, ${booking.children} Child` : ""}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    Lead Guest
                  </span>
                  <p className="mt-0.5 text-sm font-bold text-[#0f172a] truncate">
                    {booking.leadGuest?.name || "Confirmed Guest"}
                  </p>
                </div>
              </div>
            </article>

            {/* Only show amenities promised with this booking, never generic hospitality claims. */}
            {bookedAmenities.length > 0 && <article className="overflow-hidden rounded-2xl border border-[#e7e4dc] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
              <div className="flex items-center gap-2 border-b border-stone-100 pb-4">
                <CheckCircle2 className="h-5 w-5 text-[#0b1f3a]" />
                <h3 className="text-base font-extrabold text-[#0f172a]">Room & Stay Inclusions</h3>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {bookedAmenities.map((amenity) => <div key={`${amenity.group}-${amenity.code}`} className="rounded-xl border border-stone-100 bg-stone-50/60 p-4"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-[#183b2b]" /><p className="text-sm font-bold text-stone-800">{amenity.label}</p></div><p className="mt-1 text-[11px] text-stone-500">{amenity.group}</p></div>)}
              </div>

              {booking.specialRequest && (
                <div className="mt-5 rounded-xl border border-[#e7e4dc] bg-stone-50/70 p-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    Special Request Noted
                  </span>
                  <p className="mt-1 text-xs text-stone-700 italic">
                    &ldquo;{booking.specialRequest}&rdquo;
                  </p>
                </div>
              )}
            </article>}

            {/* HOTEL LOCATION & RECEPTION ASSISTANCE */}
            <article className="overflow-hidden rounded-2xl border border-[#e7e4dc] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
              <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-[#0b1f3a]" />
                  <h3 className="text-base font-extrabold text-[#0f172a]">Location & Front Desk</h3>
                </div>
                <button
                  type="button"
                  onClick={copyAddress}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-bold text-stone-700 hover:bg-stone-50"
                >
                  <Copy className="h-3 w-3 text-stone-500" />
                  <span>Copy Address</span>
                </button>
              </div>

              <div className="mt-4">
                <p className="text-sm font-bold text-[#0f172a]">{booking.propertyName}</p>
                <p className="mt-1 text-xs leading-relaxed text-stone-600">{displayAddress}</p>

                {/* Map & Navigation Links */}
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {googleMapsUrl && (
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2 text-xs font-bold text-stone-800 transition hover:bg-stone-100"
                    >
                      <Navigation className="h-3.5 w-3.5 text-stone-600" />
                      <span>Open in Google Maps</span>
                      <ExternalLink className="h-3 w-3 text-stone-400" />
                    </a>
                  )}
                  {appleMapsUrl && (
                    <a
                      href={appleMapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2 text-xs font-bold text-stone-800 transition hover:bg-stone-100"
                    >
                      <Navigation className="h-3.5 w-3.5 text-stone-600" />
                      <span>Apple Maps</span>
                    </a>
                  )}
                </div>

                {/* Property Contact Channels */}
                <div className="mt-5 grid gap-3 sm:grid-cols-2 border-t border-stone-100 pt-4">
                  {booking.propertyPublicPhone ? (
                    <div className="rounded-xl border border-[#e7e4dc] bg-stone-50/70 p-3.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                        Front Desk Phone
                      </span>
                      <a
                        href={`tel:${booking.propertyPublicPhone}`}
                        className="mt-1 flex items-center gap-1.5 text-xs font-bold text-[#0b1f3a] hover:underline"
                      >
                        <Phone className="h-3.5 w-3.5 text-stone-600" />
                        <span>{booking.propertyPublicPhone}</span>
                      </a>
                    </div>
                  ) : null}

                  {booking.propertyPublicEmail ? (
                    <div className="rounded-xl border border-[#e7e4dc] bg-stone-50/70 p-3.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                        Property Email
                      </span>
                      <a
                        href={`mailto:${booking.propertyPublicEmail}`}
                        className="mt-1 flex items-center gap-1.5 text-xs font-bold text-[#0b1f3a] hover:underline truncate"
                      >
                        <Mail className="h-3.5 w-3.5 text-stone-600" />
                        <span className="truncate">{booking.propertyPublicEmail}</span>
                      </a>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>

            {/* ARRIVAL GUIDELINES & COMPLIANCE */}
            <article className="overflow-hidden rounded-2xl border border-[#e7e4dc] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
              <div className="flex items-center gap-2 border-b border-stone-100 pb-4">
                <ShieldCheck className="h-5 w-5 text-stone-700" />
                <h3 className="text-base font-extrabold text-[#0f172a]">Check-in Guidelines & ID Policy</h3>
              </div>

              <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
                <div className="rounded-xl bg-stone-50/80 p-4 border border-[#e7e4dc]">
                  <p className="text-xs font-bold text-[#0f172a]">Mandatory Government Photo ID</p>
                  <p className="mt-1 text-xs leading-relaxed text-stone-600">
                    All adult guests must carry an original valid government ID (Aadhaar Card, Passport, Driving License, or Voter ID). PAN Card is not accepted per local hotel regulations.
                  </p>
                </div>
                <div className="rounded-xl bg-stone-50/80 p-4 border border-[#e7e4dc]">
                  <p className="text-xs font-bold text-[#0f172a]">Primary Guest Verification</p>
                  <p className="mt-1 text-xs leading-relaxed text-stone-600">
                    The lead guest (<span className="font-semibold text-stone-800">{booking.leadGuest?.name || "Lead Guest"}</span>) must be present at check-in. The reservation name must match the ID.
                  </p>
                </div>
              </div>
            </article>
          </section>

          {/* RIGHT / SECONDARY STICKY ASIDE */}
          <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            {/* PAYMENT & INVOICE SUMMARY CARD */}
            <section className="rounded-2xl border border-[#e7e4dc] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  <IndianRupee className="h-4 w-4 text-[#0b1f3a]" />
                  <h3 className="font-extrabold text-[#0f172a]">Payment Summary</h3>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    isPaidInFull
                      ? "bg-[#f0f4f1] text-[#183b2b] border border-[#d6e2d9]"
                      : "bg-stone-100 text-stone-800 border border-stone-200"
                  }`}
                >
                  {isPaidInFull ? "Paid in Full" : "Balance Due"}
                </span>
              </div>

              {/* Itemized Price Breakdown */}
              <dl className="mt-4 space-y-2.5 text-xs">
                {booking.subtotalPaise !== undefined && booking.subtotalPaise > 0 && (
                  <AmountRow
                    label={`Room charges (${
                      booking.bookingMode === "hourly"
                        ? `${Math.round((booking.durationMinutes ?? 0) / 60)} hrs`
                        : `${booking.nights} night${booking.nights === 1 ? "" : "s"}`
                    })`}
                    value={formatMoney(booking.subtotalPaise, booking.currency)}
                  />
                )}
                {booking.taxPaise !== undefined && booking.taxPaise > 0 && (
                  <AmountRow
                    label="Taxes & GST"
                    value={formatMoney(booking.taxPaise, booking.currency)}
                  />
                )}
                {booking.customerFeePaise !== undefined && booking.customerFeePaise > 0 && (
                  <AmountRow
                    label="Platform fee"
                    value={formatMoney(booking.customerFeePaise, booking.currency)}
                  />
                )}

                <div className="border-t border-stone-100 pt-2.5">
                  <AmountRow
                    label="Grand Total"
                    value={formatMoney(booking.totalPaise, booking.currency)}
                    isTotal
                  />
                </div>

                <AmountRow
                  label="Amount Paid"
                  value={formatMoney(booking.paidPaise, booking.currency)}
                  tone="text-[#183b2b]"
                />

                {balance > 0 ? (
                  <div className="mt-2 rounded-xl border border-stone-300 bg-stone-100 p-3">
                    <div className="flex items-center justify-between text-xs font-bold text-stone-900">
                      <span>Payable at Hotel</span>
                      <span>{formatMoney(balance, booking.currency)}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-stone-600">
                      Please pay this balance directly at the hotel front desk upon arrival.
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 rounded-xl border border-[#d6e2d9] bg-[#f0f4f1] p-2.5 text-center text-xs font-bold text-[#183b2b]">
                    ✓ ₹0 Due at Check-in • Fully Paid
                  </div>
                )}
              </dl>

              <div className="mt-5 space-y-2 border-t border-stone-100 pt-4">
                <button
                  type="button"
                  onClick={() => setReceiptOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0b1f3a] px-4 py-2.5 text-xs font-bold text-white shadow-2xs transition hover:bg-[#152e4d]"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>View receipt</span>
                </button>
              </div>
            </section>

            {/* CANCELLATION POLICY & ACTIONS */}
            {booking.cancellationPolicy && (
              <section className="rounded-2xl border border-[#e7e4dc] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-[#0f172a]">Cancellation Policy</h3>
                  {freeCancellationBadge && (
                    <span className="rounded-md bg-[#f0f4f1] px-2 py-0.5 text-[11px] font-bold text-[#183b2b] border border-[#d6e2d9]">
                      Free Cancellation
                    </span>
                  )}
                </div>

                <p className="mt-2 text-xs font-bold text-stone-800">{booking.cancellationPolicy.name}</p>

                {freeCancellationBadge ? (
                  <p className="mt-1 text-xs text-[#183b2b] leading-relaxed font-semibold">
                    {freeCancellationBadge}
                  </p>
                ) : null}

                <p className="mt-1.5 text-xs text-stone-600 leading-relaxed">
                  {booking.cancellationPolicy.description ||
                    `Cancellation fee: ${booking.cancellationPolicy.cancellationFeePercent}%`}
                </p>

                {isCancellable && (
                  <div className="mt-4 border-t border-stone-100 pt-3">
                    <button
                      type="button"
                      onClick={() => setCancelModalOpen(true)}
                      className="text-xs font-semibold text-stone-500 transition hover:text-stone-900 underline"
                    >
                      Need to cancel this reservation?
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* HELPKEY STAY GUARANTEE */}
            <section className="overflow-hidden rounded-2xl bg-[#0b1f3a] p-5 text-white shadow-md">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-stone-300">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-white">Helpkey Traveler Guarantee</h4>
                  <p className="mt-1 text-xs leading-relaxed text-stone-300">
                    Guaranteed check-in or 100% refund plus emergency hotel re-accommodation. Our concierge is available 24/7 for support.
                  </p>
                  <Link
                    href="/help"
                    className="mt-2.5 inline-flex items-center gap-1 text-xs font-bold text-stone-200 hover:text-white hover:underline"
                  >
                    <span>Contact Helpkey Concierge</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {/* Official Booking Receipt Modal */}
      <BookingReceiptModal booking={receiptOpen ? booking : null} onClose={() => setReceiptOpen(false)} />

      {/* Safe Cancellation Confirmation Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-150 border border-stone-200">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-100 text-stone-800">
              <AlertTriangle className="h-5 w-5" />
            </div>

            <h3 className="mt-4 text-lg font-extrabold text-[#0f172a]">
              Cancel Reservation?
            </h3>
            <p className="mt-1 text-xs text-stone-600 leading-relaxed">
              Are you sure you want to cancel your stay at{" "}
              <strong className="text-stone-900">{booking.propertyName}</strong>?
            </p>

            <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3.5 text-xs">
              <div className="flex justify-between font-semibold text-stone-700">
                <span>Check-in:</span>
                <span>{prettyDate(booking.checkIn)}</span>
              </div>
              <div className="flex justify-between font-semibold text-stone-700 mt-1">
                <span>Room:</span>
                <span>{booking.roomName}</span>
              </div>
              <div className="mt-2 border-t border-stone-200 pt-2 text-[11px] text-stone-600">
                {freeCancellationBadge ? (
                  <span className="font-bold text-[#183b2b]">
                    ✓ Eligible for 100% refund of your paid amount.
                  </span>
                ) : (
                  <span>
                    Standard cancellation policy terms will apply based on the property rules.
                  </span>
                )}
              </div>
            </div>

            {cancelError && (
              <div className="mt-3 rounded-xl border border-stone-300 bg-stone-100 p-3 text-xs text-stone-800">
                {cancelError}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                disabled={cancelling}
                className="rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-50"
              >
                Keep Reservation
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={cancelling}
                className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-black disabled:opacity-60"
              >
                {cancelling ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Cancelling...</span>
                  </>
                ) : (
                  <span>Yes, Cancel Booking</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function AmountRow({
  label,
  value,
  tone = "text-[#0f172a]",
  isTotal = false,
}: {
  label: string;
  value: string;
  tone?: string;
  isTotal?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${isTotal ? "text-sm font-extrabold text-[#0f172a]" : ""}`}>
      <dt className={isTotal ? "text-stone-900" : "text-stone-600"}>{label}</dt>
      <dd className={`font-bold ${tone}`}>{value}</dd>
    </div>
  );
}
