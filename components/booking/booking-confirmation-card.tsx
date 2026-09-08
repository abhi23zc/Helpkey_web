"use client";

import Link from "next/link";
import { ArrowRight, CalendarPlus, FileText, MapPin, Plane, ShieldCheck } from "lucide-react";

type BookingConfirmationCardProps = {
  confirmationCode: string;
  propertyName: string;
  propertyAddress?: string | null;
  guestEmail: string;
  checkInDate: string;
  checkInTime?: string;
  checkOutDate: string;
  checkOutTime?: string;
  propertySlug?: string | null;
  onDownloadReceipt?: () => void;
};

const formatPrettyDate = (dateStr: string) => {
  if (!dateStr) return "Mon, May 20, 2025";
  // If already formatted, return as is
  if (dateStr.includes(",")) return dateStr;
  try {
    const d = new Date(`${dateStr}T00:00:00`);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

export function BookingConfirmationCard({
  confirmationCode,
  propertyName,
  propertyAddress,
  guestEmail,
  checkInDate,
  checkInTime = "3:00 PM",
  checkOutDate,
  checkOutTime = "11:00 AM",
  onDownloadReceipt,
}: BookingConfirmationCardProps) {
  const formattedCheckIn = formatPrettyDate(checkInDate);
  const formattedCheckOut = formatPrettyDate(checkOutDate);

  const handleAddToCalendar = () => {
    const title = `Stay at ${propertyName}`;
    const details = `Confirmation Code: ${confirmationCode}\nGuest Email: ${guestEmail}`;
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Helpkey Travel//Booking Confirmation//EN
BEGIN:VEVENT
SUMMARY:${title}
DESCRIPTION:${details}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsData], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Helpkey-Booking-${confirmationCode}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintReceipt = () => {
    if (onDownloadReceipt) {
      onDownloadReceipt();
    } else {
      window.print();
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl rounded-3xl border border-slate-100 bg-white p-7 sm:p-9 shadow-lg">
      {/* Top Success Circle */}
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#e8f5e9]">
        <svg
          className="h-8 w-8 text-[#2e7d32]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>

      {/* Heading & Email info */}
      <h2 className="mt-5 text-center text-2xl font-bold tracking-tight text-[#141b2b]">
        Booking Confirmed!
      </h2>
      <p className="mt-2 text-center text-xs leading-relaxed text-[#44474d] sm:text-sm">
        Your stay at <span className="font-semibold text-[#141b2b]">{propertyName}</span>{" "}
        is all set. We&apos;ve sent your confirmation to{" "}
        <strong className="font-bold text-[#141b2b]">{guestEmail || "your email"}</strong>.
      </p>

      {/* Confirmation Number Box */}
      <div className="my-6 rounded-2xl border border-[#e4ebff] bg-[#f4f6ff] p-4.5 text-center">
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#75777e]">
          CONFIRMATION NUMBER
        </span>
        <span className="mt-1 block font-mono text-lg font-bold tracking-wider text-[#000615] sm:text-xl">
          {confirmationCode}
        </span>
      </div>

      {/* Hotel & Stay Details */}
      <div className="my-6 grid grid-cols-1 gap-6 text-left sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-bold text-[#000615]">{propertyName}</h3>
          <p className="mt-1 flex items-start gap-1 text-xs text-[#44474d]">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>{propertyAddress || "1 Princes St, Edinburgh EH2 2EQ, UK"}</span>
          </p>
          <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#2e7d32]">
            <ShieldCheck className="h-4 w-4" />
            <span>Verified Stay</span>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <span className="block text-xs font-medium text-[#75777e]">Check-in</span>
            <span className="mt-0.5 block text-xs font-bold text-[#000615] sm:text-sm">
              {formattedCheckIn} • {checkInTime}
            </span>
          </div>
          <div>
            <span className="block text-xs font-medium text-[#75777e]">Check-out</span>
            <span className="mt-0.5 block text-xs font-bold text-[#000615] sm:text-sm">
              {formattedCheckOut} • {checkOutTime}
            </span>
          </div>
        </div>
      </div>

      <hr className="my-6 border-slate-100" />

      {/* 3 Action Buttons */}
      <div className="my-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={handleAddToCalendar}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#000615] px-3.5 py-3 text-xs font-bold text-white transition hover:bg-[#0b1f3a] active:scale-[0.98]"
        >
          <CalendarPlus className="h-4 w-4" />
          Add to Calendar
        </button>

        <button
          type="button"
          onClick={handlePrintReceipt}
          className="flex items-center justify-center gap-2 rounded-xl border border-[#000615] bg-white px-3.5 py-3 text-xs font-bold text-[#000615] transition hover:bg-slate-50 active:scale-[0.98]"
        >
          <FileText className="h-4 w-4" />
          Download Receipt
        </button>

        <Link
          href="/trips"
          className="flex items-center justify-center gap-2 rounded-xl border border-[#000615] bg-white px-3.5 py-3 text-xs font-bold text-[#000615] transition hover:bg-slate-50 active:scale-[0.98]"
        >
          <Plane className="h-4 w-4" />
          View Trip Details
        </Link>
      </div>

      {/* Bottom Business Hub Promo */}
      <div className="mt-6 rounded-2xl border border-[#e0e7ff] bg-[#f0f4ff] p-4.5 text-center">
        <p className="text-xs font-medium text-[#44474d]">
          Make the most of your business trip.
        </p>
        <Link
          href="/search"
          className="mt-1.5 inline-flex items-center justify-center gap-1 text-xs font-bold text-[#000615] underline transition hover:text-blue-900 sm:text-sm"
        >
          Explore local business hubs near your stay <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
