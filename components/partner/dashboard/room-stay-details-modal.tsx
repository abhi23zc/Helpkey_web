"use client";

import { formatPaise } from "@/lib/currency";
import {
  BedDouble,
  CalendarDays,
  Clock,
  CreditCard,
  DoorClosed,
  FileText,
  LogOut,
  Phone,
  Receipt,
  Repeat,
  User,
  X,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export type StayDetails = {
  bookingId: string;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  checkIn: string;
  checkOut: string;
  startAt: string;
  endAt: string;
  confirmationCode: string;
  bookingStatus: string;
  totalPaise: number;
  paidPaise: number;
  balanceDuePaise: number;
  guestCount: number;
  source?: string;
};

type Props = {
  open: boolean;
  unitLabel: string;
  roomTypeName: string;
  stay: StayDetails | null;
  propertyId: string;
  onClose: () => void;
  onOpenSection: (section: "summary" | "guests" | "assignment" | "billing" | "payments") => void;
};

function formatDisplayDate(dateStr: string, timeStr?: string) {
  if (!dateStr) return "—";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    const formatted = dateObj.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    return timeStr ? `${formatted} · ${timeStr}` : formatted;
  } catch {
    return dateStr;
  }
}

function formatIsoTime(isoString?: string) {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

export function RoomStayDetailsModal({
  open,
  unitLabel,
  roomTypeName,
  stay,
  propertyId,
  onClose,
  onOpenSection,
}: Props) {
  if (!open || !stay) return null;

  const isCheckedIn = stay.bookingStatus === "checked_in";
  const hasBalance = stay.balanceDuePaise > 0;
  const inTime = formatIsoTime(stay.startAt) || "12:00 PM";
  const outTime = formatIsoTime(stay.endAt) || "11:00 AM";

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="stay-details-title"
          className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200/90 animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-100 bg-[#061224] p-5 text-white">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex h-7 items-center justify-center rounded-lg bg-[#c89b3c] px-2.5 font-mono text-sm font-extrabold text-[#061224]">
                  Room {unitLabel}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-xs font-medium text-slate-300">
                  <BedDouble className="h-3 w-3 text-[#c89b3c]" />
                  {roomTypeName}
                </span>
              </div>
              <h2
                id="stay-details-title"
                className="text-lg font-bold tracking-tight text-white flex items-center gap-2 pt-1"
              >
                {stay.guestName}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span className="font-mono text-[11px] text-[#c89b3c]">
                  Ref: {stay.confirmationCode}
                </span>
                <span>•</span>
                <span className="capitalize">
                  {isCheckedIn ? "Checked In" : stay.bookingStatus.replace("_", " ")}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Close stay details"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Quick Stay Snapshot */}
          <div className="border-b border-slate-100 bg-slate-50/70 p-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-slate-200/70 bg-white p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">
                  Check-in
                </span>
                <p className="mt-1 font-bold text-slate-800">
                  {formatDisplayDate(stay.checkIn, inTime)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/70 bg-white p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">
                  Check-out
                </span>
                <p className="mt-1 font-bold text-slate-800">
                  {formatDisplayDate(stay.checkOut, outTime)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/70 bg-white p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">
                  Contact Phone
                </span>
                <p className="mt-1 font-bold text-slate-800 truncate">
                  {stay.guestPhone || "—"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/70 bg-white p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">
                  Guests &amp; Folio
                </span>
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-bold text-slate-800">
                    {stay.guestCount} {stay.guestCount === 1 ? "Guest" : "Guests"}
                  </span>
                  <span
                    className={`text-[11px] font-extrabold ${
                      hasBalance ? "text-amber-700" : "text-emerald-700"
                    }`}
                  >
                    {hasBalance
                      ? `${formatPaise(stay.balanceDuePaise)} due`
                      : "Settled"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action List (Image 2 style) */}
          <div className="p-4 space-y-2">
            {/* View / Edit Details */}
            <button
              type="button"
              onClick={() => onOpenSection("summary")}
              className="w-full flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-xs font-bold text-slate-800 hover:border-[#c89b3c]/50 hover:bg-[#fbf5e8]/60 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 group-hover:bg-[#c89b3c]/15 text-slate-600 group-hover:text-[#c89b3c] transition-colors">
                  <FileText className="h-4 w-4" />
                </div>
                <span>View / Edit Details</span>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600" />
            </button>

            {/* Manage Billing & Folio */}
            <button
              type="button"
              onClick={() => onOpenSection("billing")}
              className="w-full flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-xs font-bold text-slate-800 hover:border-[#c89b3c]/50 hover:bg-[#fbf5e8]/60 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 group-hover:bg-[#c89b3c]/15 text-slate-600 group-hover:text-[#c89b3c] transition-colors">
                  <Receipt className="h-4 w-4" />
                </div>
                <span>Manage Billing &amp; Folio</span>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600" />
            </button>

            {/* Add Payment */}
            <button
              type="button"
              onClick={() => onOpenSection("payments")}
              className="w-full flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-xs font-bold text-slate-800 hover:border-[#c89b3c]/50 hover:bg-[#fbf5e8]/60 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 group-hover:bg-[#c89b3c]/15 text-slate-600 group-hover:text-[#c89b3c] transition-colors">
                  <CreditCard className="h-4 w-4" />
                </div>
                <span>Add / Collect Payment</span>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600" />
            </button>

            {/* Shift Room */}
            <button
              type="button"
              onClick={() => onOpenSection("assignment")}
              className="w-full flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-xs font-bold text-slate-800 hover:border-[#c89b3c]/50 hover:bg-[#fbf5e8]/60 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 group-hover:bg-[#c89b3c]/15 text-slate-600 group-hover:text-[#c89b3c] transition-colors">
                  <Repeat className="h-4 w-4" />
                </div>
                <span>Shift Room</span>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600" />
            </button>

            {/* Checkout (Red highlight) */}
            <button
              type="button"
              onClick={() => onOpenSection("summary")}
              className="w-full flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3 text-xs font-bold text-rose-700 hover:bg-rose-100/70 hover:border-rose-300 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-700 group-hover:bg-rose-200 transition-colors">
                  <LogOut className="h-4 w-4" />
                </div>
                <span>Checkout Guest</span>
              </div>
              <ChevronRight className="h-4 w-4 text-rose-400 group-hover:text-rose-600" />
            </button>

            {/* Check-In Invoice / Receipt */}
            <button
              type="button"
              onClick={() => onOpenSection("billing")}
              className="w-full flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-xs font-bold text-slate-800 hover:border-slate-300 hover:bg-slate-50 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <FileText className="h-4 w-4" />
                </div>
                <span>View Invoice / Receipt</span>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
