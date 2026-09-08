"use client";

import React from "react";
import { X, Printer, CheckCircle, Hotel, MapPin, Calendar, User, FileText } from "lucide-react";

export type BookingReceiptData = {
  id: string;
  confirmationCode: string;
  propertyName: string;
  propertyCity?: string | null;
  propertyState?: string | null;
  roomName: string;
  ratePlanName: string;
  checkIn: string;
  checkOut: string;
  checkInTime?: string;
  checkOutTime?: string;
  nights: number;
  adults: number;
  children: number;
  leadGuest?: {
    name: string;
    email: string;
    phone: string;
  } | null;
  subtotalPaise?: number;
  taxPaise?: number;
  customerFeePaise?: number;
  totalPaise: number;
  paidPaise: number;
  currency: string;
  bookingStatus: string;
  paymentStatus: string;
  paymentMethod?: string | null;
  createdAt?: string | null;
};

type Props = {
  booking: BookingReceiptData | null;
  onClose: () => void;
};

const formatMoney = (paise: number = 0, currency: string = "INR") => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(paise / 100);
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return "";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export function BookingReceiptModal({ booking, onClose }: Props) {
  if (!booking) return null;

  const handlePrint = () => {
    window.print();
  };

  const locationText = [booking.propertyCity, booking.propertyState]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl print:max-w-none print:shadow-none print:m-0 print:p-0 print:overflow-visible">
        {/* Header - Screen only */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 print:hidden">
          <div className="flex items-center gap-2 text-[#0b1f3a] font-bold text-lg">
            <FileText className="h-5 w-5 text-[#0b1f3a]" />
            Booking Receipt
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <Printer className="h-4 w-4" />
              Print Receipt
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Receipt Printable Content */}
        <div className="p-6 md:p-8 space-y-6">
          {/* Brand Header & Confirmation */}
          <div className="flex justify-between items-start border-b border-slate-200 pb-6">
            <div>
              <div className="flex items-center gap-2 text-2xl font-extrabold text-[#0b1f3a] tracking-tight">
                <span className="bg-[#0b1f3a] text-white p-1 rounded-md">
                  <Hotel className="h-5 w-5" />
                </span>
                Helpkey
              </div>
              <p className="text-xs text-slate-500 mt-1">Official Booking & Payment Receipt</p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                <CheckCircle className="h-3.5 w-3.5" />
                {booking.paymentStatus === "paid" ? "Paid in Full" : booking.bookingStatus.toUpperCase()}
              </span>
              <p className="text-xs text-slate-500 mt-2 font-mono">
                Code: <span className="font-bold text-slate-800">{booking.confirmationCode}</span>
              </p>
              {booking.createdAt && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Booked on {new Date(booking.createdAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          {/* Property Info */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <h3 className="font-bold text-lg text-[#0b1f3a]">{booking.propertyName}</h3>
            {locationText && (
              <p className="flex items-center gap-1.5 text-sm text-slate-600 mt-1">
                <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                {locationText}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600 pt-2 border-t border-slate-200/60">
              <div>
                <span className="text-slate-400">Room:</span>{" "}
                <span className="font-semibold text-slate-800">{booking.roomName}</span>
              </div>
              <div>
                <span className="text-slate-400">Rate Plan:</span>{" "}
                <span className="font-semibold text-slate-800">{booking.ratePlanName}</span>
              </div>
            </div>
          </div>

          {/* Stay Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-2">
            <div className="border-l-2 border-[#0b1f3a] pl-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Check-In</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{formatDate(booking.checkIn)}</p>
              <p className="text-xs text-slate-500">{booking.checkInTime || "3:00 PM"}</p>
            </div>
            <div className="border-l-2 border-[#0b1f3a] pl-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Check-Out</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{formatDate(booking.checkOut)}</p>
              <p className="text-xs text-slate-500">{booking.checkOutTime || "11:00 AM"}</p>
            </div>
            <div className="border-l-2 border-[#0b1f3a] pl-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Duration</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">
                {booking.nights} Night{booking.nights > 1 ? "s" : ""}
              </p>
            </div>
            <div className="border-l-2 border-[#0b1f3a] pl-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Guests</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">
                {booking.adults} Adult{booking.adults > 1 ? "s" : ""}
                {booking.children ? `, ${booking.children} Child` : ""}
              </p>
            </div>
          </div>

          {/* Guest Details */}
          {booking.leadGuest && (
            <div className="border-t border-slate-100 pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Guest Information</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs bg-slate-50 p-3 rounded-lg">
                <div>
                  <span className="text-slate-400">Lead Guest:</span>{" "}
                  <span className="font-semibold text-slate-800">{booking.leadGuest.name}</span>
                </div>
                <div>
                  <span className="text-slate-400">Email:</span>{" "}
                  <span className="font-semibold text-slate-800">{booking.leadGuest.email}</span>
                </div>
                <div>
                  <span className="text-slate-400">Phone:</span>{" "}
                  <span className="font-semibold text-slate-800">{booking.leadGuest.phone}</span>
                </div>
              </div>
            </div>
          )}

          {/* Payment Summary Table */}
          <div className="border-t border-slate-200 pt-4 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Payment Summary</h4>
            {booking.subtotalPaise !== undefined && booking.subtotalPaise > 0 && (
              <div className="flex justify-between text-xs text-slate-600">
                <span>Room Charges ({booking.nights} night{booking.nights > 1 ? "s" : ""})</span>
                <span>{formatMoney(booking.subtotalPaise, booking.currency)}</span>
              </div>
            )}
            {booking.taxPaise !== undefined && booking.taxPaise > 0 && (
              <div className="flex justify-between text-xs text-slate-600">
                <span>Taxes & Service Fees</span>
                <span>{formatMoney(booking.taxPaise, booking.currency)}</span>
              </div>
            )}
            {booking.customerFeePaise !== undefined && booking.customerFeePaise > 0 && (
              <div className="flex justify-between text-xs text-slate-600">
                <span>Convenience Fee</span>
                <span>{formatMoney(booking.customerFeePaise, booking.currency)}</span>
              </div>
            )}

            <div className="flex justify-between text-base font-bold text-[#0b1f3a] pt-3 border-t border-slate-200">
              <span>Total Amount</span>
              <span>{formatMoney(booking.totalPaise, booking.currency)}</span>
            </div>

            <div className="flex justify-between text-xs text-slate-600 pt-1">
              <span>Amount Paid</span>
              <span className="font-semibold text-emerald-700">{formatMoney(booking.paidPaise, booking.currency)}</span>
            </div>

            {booking.paymentMethod && (
              <p className="text-[11px] text-slate-400 pt-2 italic">
                Payment Method: {booking.paymentMethod === "pay_at_property" ? "Pay at Property" : "Online Payment (Razorpay)"}
              </p>
            )}
          </div>

          {/* Footer Note */}
          <div className="border-t border-slate-100 pt-4 text-center text-xs text-slate-400">
            <p>Thank you for choosing Helpkey! Need help with your stay? Contact Helpkey Support.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
