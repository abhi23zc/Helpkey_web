"use client";

import { useEffect, useState } from "react";
import {
  BedDouble,
  Building2,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileText,
  Loader2,
  User2,
  X,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type ManualBookingForm = {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  roomDescription: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  nightlyRateRupees: number;
  paymentMethod: string;
  specialRequest: string;
};

const EMPTY: ManualBookingForm = {
  guestName: "",
  guestEmail: "",
  guestPhone: "",
  roomDescription: "",
  checkIn: "",
  checkOut: "",
  adults: 1,
  children: 0,
  nightlyRateRupees: 0,
  paymentMethod: "pay_at_property",
  specialRequest: "",
};

const fmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function calcNights(a: string, b: string) {
  if (!a || !b) return 0;
  return Math.max(
    0,
    Math.round(
      (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000
    )
  );
}

/* ─── Primitive design-system helpers ───────────────────────────────────── */

/** A bordered container that mirrors the existing SelectBox / FilterBox pattern */
const BOX =
  "rounded-xl border border-[#e4ded2] bg-white px-3 py-2.5 transition-colors focus-within:border-[#c89b3c] focus-within:ring-2 focus-within:ring-[#c89b3c]/10";

/** Floating label inside the box */
function BoxLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <p className="text-[11px] font-medium text-[#4d5870]">
      {text}
      {required && <span className="ml-0.5 text-red-400">*</span>}
    </p>
  );
}

/** Bare input that lives inside a BOX container */
const INPUT_CLS =
  "mt-1 block w-full bg-transparent text-sm font-semibold text-[#061224] outline-none placeholder:font-normal placeholder:text-[#adb5c8]";

/** Section heading row with gold accent */
function SectionHead({ icon: Icon, label }: { icon: typeof User2; label: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#fbf5e8] text-[#c89b3c]">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#061224]">
        {label}
      </span>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */

export function ManualBookingDialog({
  open,
  propertyId,
  propertyName,
  onClose,
  onCreated,
}: {
  open: boolean;
  propertyId?: string;
  propertyName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<ManualBookingForm>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdCode, setCreatedCode] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  // Reset when closed
  useEffect(() => {
    if (open) return;
    setForm(EMPTY);
    setError("");
    setCreatedCode("");
    setSubmitting(false);
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const set = <K extends keyof ManualBookingForm>(k: K, v: ManualBookingForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const nights = calcNights(form.checkIn, form.checkOut);
  const total = nights * form.nightlyRateRupees;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId) { setError("No property selected."); return; }
    if (nights <= 0) { setError("Check-out must be after check-in."); return; }
    if (!form.nightlyRateRupees || form.nightlyRateRupees <= 0) {
      setError("Please enter a nightly rate.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/partner/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, propertyId }),
      });
      const body = (await res.json()) as { error?: string; confirmationCode?: string };
      if (!res.ok) throw new Error(body.error ?? "Unable to create booking.");
      setCreatedCode(body.confirmationCode ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create booking.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add Manual Booking"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-[#061224]/40 backdrop-blur-[2px]"
      />

      {/* Panel */}
      <div className="relative flex max-h-[94vh] w-full max-w-[588px] flex-col overflow-hidden rounded-2xl border border-[#e4ded2] bg-[#fafaf8] shadow-2xl shadow-[#061224]/15">

        {/* ── Header ── */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#ede7dc] bg-white px-6 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-[#061224]">Add Manual Booking</h2>
            <p className="mt-0.5 text-xs font-medium text-[#8b96aa]">
              {propertyName} · Walk-in / Offline reservation
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="grid h-8 w-8 place-items-center rounded-lg text-[#8b96aa] hover:bg-[#f0ece6] hover:text-[#061224] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {createdCode ? (
            /* ── Success state ── */
            <div className="flex flex-col items-center justify-center gap-5 px-8 py-12 text-center">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-emerald-50 text-emerald-500 ring-8 ring-emerald-50">
                <CheckCircle2 className="h-10 w-10" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#061224]">Booking Created!</h3>
                <p className="mt-1 text-sm font-medium text-[#8b96aa]">
                  The reservation has been saved and confirmed.
                </p>
              </div>
              <div className="rounded-2xl border border-[#e4ded2] bg-white px-8 py-4 text-center shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8b96aa]">
                  Confirmation Code
                </p>
                <p className="mt-1.5 font-mono text-2xl font-extrabold tracking-[0.12em] text-[#061224]">
                  {createdCode}
                </p>
              </div>
              <button
                type="button"
                onClick={onCreated}
                className="rounded-xl bg-[#061224] px-7 py-2.5 text-xs font-bold text-white hover:bg-[#0c1f3b] transition-colors"
              >
                View Reservation →
              </button>
            </div>
          ) : (
            /* ── Booking form ── */
            <form id="mbf" onSubmit={handleSubmit} noValidate>

              {/* § Guest information */}
              <div className="border-b border-[#ede7dc] bg-white px-6 py-5">
                <SectionHead icon={User2} label="Guest Information" />
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Full name */}
                  <div className={BOX}>
                    <BoxLabel text="Full Name" required />
                    <input
                      required
                      autoFocus
                      placeholder="e.g. Priya Sharma"
                      value={form.guestName}
                      onChange={(e) => set("guestName", e.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>
                  {/* Phone */}
                  <div className={BOX}>
                    <BoxLabel text="Phone Number" />
                    <input
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={form.guestPhone}
                      onChange={(e) => set("guestPhone", e.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>
                  {/* Email – full width */}
                  <div className={`sm:col-span-2 ${BOX}`}>
                    <BoxLabel text="Email Address" />
                    <input
                      type="email"
                      placeholder="guest@email.com"
                      value={form.guestEmail}
                      onChange={(e) => set("guestEmail", e.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>
                </div>
              </div>

              {/* § Stay details */}
              <div className="border-b border-[#ede7dc] bg-white px-6 py-5">
                <SectionHead icon={Building2} label="Stay Details" />
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Check-in */}
                  <div className={BOX}>
                    <BoxLabel text="Check-in Date" required />
                    <div className="mt-1 flex items-center gap-2">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#8b96aa]" />
                      <input
                        type="date"
                        required
                        min={today}
                        value={form.checkIn}
                        onChange={(e) => set("checkIn", e.target.value)}
                        className="block w-full cursor-pointer bg-transparent text-sm font-semibold text-[#061224] outline-none"
                      />
                    </div>
                  </div>
                  {/* Check-out */}
                  <div className={BOX}>
                    <BoxLabel text="Check-out Date" required />
                    <div className="mt-1 flex items-center gap-2">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#8b96aa]" />
                      <input
                        type="date"
                        required
                        min={form.checkIn || today}
                        value={form.checkOut}
                        onChange={(e) => set("checkOut", e.target.value)}
                        className="block w-full cursor-pointer bg-transparent text-sm font-semibold text-[#061224] outline-none"
                      />
                    </div>
                  </div>

                  {/* Room / category – full width */}
                  <div className={`sm:col-span-2 ${BOX}`}>
                    <BoxLabel text="Room / Category" required />
                    <div className="mt-1 flex items-center gap-2">
                      <BedDouble className="h-3.5 w-3.5 shrink-0 text-[#8b96aa]" />
                      <input
                        required
                        placeholder="e.g. Deluxe King Room, Standard Double"
                        value={form.roomDescription}
                        onChange={(e) => set("roomDescription", e.target.value)}
                        className="block w-full bg-transparent text-sm font-semibold text-[#061224] outline-none placeholder:font-normal placeholder:text-[#adb5c8]"
                      />
                    </div>
                  </div>

                  {/* Adults */}
                  <div className={BOX}>
                    <BoxLabel text="Adults" />
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={form.adults}
                      onChange={(e) => set("adults", Number(e.target.value))}
                      className={INPUT_CLS}
                    />
                  </div>
                  {/* Children */}
                  <div className={BOX}>
                    <BoxLabel text="Children" />
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={form.children}
                      onChange={(e) => set("children", Number(e.target.value))}
                      className={INPUT_CLS}
                    />
                  </div>

                  {/* Night count badge – shown when both dates are set */}
                  {nights > 0 && (
                    <div className="sm:col-span-2 flex items-center gap-2 rounded-xl border border-[#e4ded2] bg-[#fbfbff] px-3 py-2.5">
                      <CalendarDays className="h-4 w-4 text-[#c89b3c]" />
                      <span className="text-xs font-semibold text-[#4d5870]">
                        {nights} night{nights !== 1 ? "s" : ""} selected
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* § Pricing & Payment */}
              <div className="border-b border-[#ede7dc] bg-white px-6 py-5">
                <SectionHead icon={CreditCard} label="Pricing & Payment" />
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Nightly rate */}
                  <div className={BOX}>
                    <BoxLabel text="Nightly Rate (₹)" required />
                    <div className="mt-1 flex items-center gap-1">
                      <span className="text-sm font-semibold text-[#8b96aa]">₹</span>
                      <input
                        type="number"
                        required
                        min={1}
                        step={1}
                        placeholder="5000"
                        value={form.nightlyRateRupees || ""}
                        onChange={(e) => set("nightlyRateRupees", Number(e.target.value))}
                        className="block w-full bg-transparent text-sm font-semibold text-[#061224] outline-none placeholder:font-normal placeholder:text-[#adb5c8]"
                      />
                    </div>
                  </div>

                  {/* Payment method */}
                  <div className={BOX}>
                    <BoxLabel text="Payment Status" />
                    <select
                      value={form.paymentMethod}
                      onChange={(e) => set("paymentMethod", e.target.value)}
                      className="mt-1 w-full cursor-pointer bg-transparent text-sm font-semibold text-[#061224] outline-none"
                    >
                      <option value="pay_at_property">Pay at Property</option>
                      <option value="paid">Already Paid (Cash / UPI)</option>
                    </select>
                  </div>

                  {/* Total breakdown – shown when rate & nights are set */}
                  {nights > 0 && form.nightlyRateRupees > 0 && (
                    <div className="sm:col-span-2 flex items-center justify-between rounded-xl border border-[#e4ded2] bg-[#fbf5e8] px-4 py-3">
                      <div>
                        <p className="text-[11px] font-semibold text-[#8a7044]">
                          {nights} night{nights !== 1 ? "s" : ""} × {fmt.format(form.nightlyRateRupees)}
                        </p>
                        <p className="mt-0.5 text-[10px] font-medium text-[#b09060]">
                          {form.paymentMethod === "paid" ? "Marked as paid" : "Collect at property"}
                        </p>
                      </div>
                      <p className="text-xl font-extrabold text-[#061224]">{fmt.format(total)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* § Notes */}
              <div className="bg-white px-6 py-5">
                <SectionHead icon={FileText} label="Special Requests & Notes" />
                <div className={BOX}>
                  <BoxLabel text="Guest Notes / Internal Remarks" />
                  <textarea
                    rows={2}
                    placeholder="Late check-in, extra pillows, any internal note…"
                    value={form.specialRequest}
                    onChange={(e) => set("specialRequest", e.target.value)}
                    className="mt-1 block w-full resize-none bg-transparent text-sm font-medium text-[#061224] outline-none placeholder:font-normal placeholder:text-[#adb5c8]"
                  />
                </div>
              </div>

              {/* Error banner */}
              {error && (
                <div className="mx-6 mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700">
                  {error}
                </div>
              )}
            </form>
          )}
        </div>

        {/* ── Footer ── */}
        {!createdCode && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#ede7dc] bg-white px-6 py-4">
            <p className="text-[11px] font-medium text-[#8b96aa]">
              Booking is confirmed immediately.
            </p>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[#e4ded2] bg-white px-5 py-2.5 text-xs font-bold text-[#4d5870] hover:border-[#c89b3c] hover:bg-[#fbf5e8] hover:text-[#061224] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="mbf"
                disabled={submitting || !propertyId}
                className="inline-flex items-center gap-2 rounded-xl bg-[#061224] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#0c1f3b] disabled:opacity-50 transition-colors"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {submitting ? "Creating…" : "Create Booking"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
