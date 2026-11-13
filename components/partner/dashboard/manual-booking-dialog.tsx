"use client";
import { useHotelCapabilities } from "./hotel-capabilities";

import { PartnerDatePicker } from "./partner-date-picker";
import { eligiblePricing, type DurationPrice } from "@/lib/booking/duration-pricing";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  BedDouble,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Loader2,
  Moon,
  ArrowRight,
  User2,
  X,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type ManualBookingForm = {
  bookingMode: "overnight" | "hourly";
  arrivalTime: string;
  durationMinutes: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  roomTypeId: string;
  ratePlanId: string;
  negotiatedPriceReason: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  nightlyRateRupees: number;
  paymentMethod: string;
  collectionMethod: string;
  collectionReference: string;
  specialRequest: string;
};

const EMPTY: ManualBookingForm = {
  bookingMode: "overnight",
  arrivalTime: "10:00",
  durationMinutes: 180,
  guestName: "",
  guestEmail: "",
  guestPhone: "",
  roomTypeId: "",
  ratePlanId: "",
  negotiatedPriceReason: "",
  checkIn: "",
  checkOut: "",
  adults: 1,
  children: 0,
  nightlyRateRupees: 0,
  paymentMethod: "pay_at_property",
  collectionMethod: "cash",
  collectionReference: "",
  specialRequest: "",
};

const fmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
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

/* ─── Shared UI Helpers ─────────────────────────────────────────────────── */

const FIELD_LABEL_CLS = "block text-xs font-semibold text-[#4d5870] mb-1.5";
const INPUT_CLS =
  "w-full rounded-xl border border-[#e4ded2] bg-[#fdfdfc] px-3.5 py-2.5 text-sm font-semibold text-[#061224] transition placeholder:font-normal placeholder:text-[#adb5c8] focus:border-[#c89b3c] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#c89b3c]/15 disabled:bg-[#f6f5f2] disabled:text-[#8b96aa]";

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof User2;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#ede7dc] bg-white p-5 shadow-xs transition-shadow">
      <div className="mb-4 flex items-center gap-2.5 border-b border-[#f3efe8] pb-3">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#fbf5e8] text-[#c89b3c]">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.06em] text-[#061224]">
            {title}
          </h3>
          {subtitle && <p className="text-[11px] font-medium text-[#8b96aa]">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */

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
  onCreated: (bookingId?: string) => void;
}) {
  const permits = useHotelCapabilities();
  const [createdId, setCreatedId] = useState<string>();
  const dialogRef = useRef<HTMLDivElement>(null);
  const requestKey = useRef("");
  const lastRequest = useRef("");
  const [form, setForm] = useState<ManualBookingForm>(EMPTY);
  const [error, setError] = useState("");
  const [choices, setChoices] = useState<{
    rooms: { id: string; name: string }[];
    rates: {
      id: string;
      name: string;
      roomTypeId: string;
      bookingMode?: string;
      basePricePaise?: number;
      datePricingEnabled?: boolean;
      pricingModel?: string;
      taxBasisPoints?: number;
      customerFeePaise?: number;
      durationPrices?: DurationPrice[];
      status?: string;
    }[];
  }>({ rooms: [], rates: [] });

  useEffect(() => {
    if (!open || !propertyId) return;
    const controller = new AbortController();
    fetch(`/api/partner/properties/${encodeURIComponent(propertyId)}?view=rooms`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load rooms");
        return response.json();
      })
      .then((body) => setChoices({ rooms: body.roomTypes ?? [], rates: body.ratePlans ?? [] }))
      .catch((err) => {
        if (err.name !== "AbortError") setError("Unable to load room types and rates.");
      });
    return () => controller.abort();
  }, [open, propertyId]);

  const effectiveRate = choices.rates.find((r) => r.id === form.ratePlanId);
  const priceRequest = {
    roomTypeId: form.roomTypeId,
    ratePlanId: form.ratePlanId,
    bookingMode: form.bookingMode,
    checkIn: form.checkIn,
    ...(form.bookingMode === "hourly"
      ? { arrivalTime: form.arrivalTime, durationMinutes: form.durationMinutes }
      : { checkOut: form.checkOut }),
    adults: form.adults,
    children: form.children,
    infants: 0,
  };

  const dateQuote = useQuery<{
    subtotalPaise: number;
    totalPaise: number;
    requestedDurationPriced: boolean;
    durationPrices: DurationPrice[];
  }>({
    queryKey: ["partner", propertyId, "manual-date-price", priceRequest],
    enabled:
      open &&
      !!propertyId &&
      !!effectiveRate?.datePricingEnabled &&
      !!form.checkIn &&
      (form.bookingMode === "hourly" || !!form.checkOut),
    queryFn: async ({ signal }) => {
      const r = await fetch(`/api/partner/properties/${propertyId}/rooms-workspace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({ action: "price-quote", input: priceRequest }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || b.message || "Unable to quote date prices.");
      return b;
    },
  });

  const [submitting, setSubmitting] = useState(false);
  const [createdCode, setCreatedCode] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  // Reset when closed
  useEffect(() => {
    if (open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(EMPTY);
    setError("");
    setCreatedCode("");
    setSubmitting(false);
    setCreatedId(undefined);
    requestKey.current = "";
    lastRequest.current = "";
  }, [open]);

  const closeState = useRef({ onClose, submitting });
  useEffect(() => {
    closeState.current = { onClose, submitting };
  }, [onClose, submitting]);

  useEffect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
        ) ?? []),
      ].filter((el) => el.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => focusable()[1]?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !closeState.current.submitting) {
        event.preventDefault();
        closeState.current.onClose();
      }
      if (event.key === "Tab") {
        const nodes = focusable(),
          first = nodes[0],
          last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  const set = <K extends keyof ManualBookingForm>(k: K, v: ManualBookingForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const nights = calcNights(form.checkIn, form.checkOut);
  const selectedRate = choices.rates.find((rate) => rate.id === form.ratePlanId);
  const publishedPrice =
    form.bookingMode === "hourly"
      ? selectedRate?.durationPrices?.find((row) => row.hours * 60 === form.durationMinutes)
          ?.pricePaise
      : selectedRate?.basePricePaise;
  const negotiated = effectiveRate?.datePricingEnabled
    ? Boolean(form.negotiatedPriceReason.trim())
    : publishedPrice !== Math.round(form.nightlyRateRupees * 100);
  const offeredDurations =
    effectiveRate?.datePricingEnabled && dateQuote.data
      ? dateQuote.data.durationPrices
      : selectedRate?.durationPrices;
  const total = (form.bookingMode === "hourly" ? 1 : nights) * form.nightlyRateRupees;

  const subtotalPaise =
    !negotiated && effectiveRate?.datePricingEnabled && dateQuote.data
      ? dateQuote.data.subtotalPaise
      : Math.round(total * 100);
  const taxPaise = Number(
    (BigInt(Number.isSafeInteger(subtotalPaise) && subtotalPaise >= 0 ? subtotalPaise : 0) *
      BigInt(selectedRate?.taxBasisPoints ?? 0) +
      BigInt(5000)) /
      BigInt(10000)
  );
  const finalTotalPaise = subtotalPaise + taxPaise + (selectedRate?.customerFeePaise ?? 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      effectiveRate?.datePricingEnabled &&
      (!dateQuote.data || dateQuote.data.requestedDurationPriced === false)
    ) {
      setError("Wait for the date-specific price or correct the stay details.");
      return;
    }
    if (!propertyId) {
      setError("No property selected.");
      return;
    }
    if (form.bookingMode === "overnight" && nights <= 0) {
      setError("Check-out must be after check-in.");
      return;
    }
    if (!form.nightlyRateRupees || form.nightlyRateRupees <= 0) {
      setError("Please enter a room price.");
      return;
    }
    const requestBody = JSON.stringify({
      ...form,
      propertyId,
      expectedTotalPaise: finalTotalPaise,
      negotiatedSubtotalPaise: negotiated ? subtotalPaise : undefined,
      negotiatedPriceReason: negotiated ? form.negotiatedPriceReason : undefined,
      checkOut: form.bookingMode === "hourly" ? undefined : form.checkOut,
    });
    if (lastRequest.current !== requestBody) {
      lastRequest.current = requestBody;
      requestKey.current = crypto.randomUUID();
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/partner/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestKey.current || (requestKey.current = crypto.randomUUID()),
        },
        body: requestBody,
      });
      const body = (await res.json()) as {
        error?: string | { message?: string };
        confirmationCode?: string;
        bookingId?: string;
      };
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : body.error?.message ?? "Unable to create booking."
        );
      }
      setCreatedId(body.bookingId);
      setCreatedCode(body.confirmationCode ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create booking.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add Manual Booking"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={() => {
          if (!submitting) onClose();
        }}
        className="absolute inset-0 bg-[#061224]/60 backdrop-blur-xs transition-opacity"
      />

      {/* Modal Shell */}
      <div className="relative flex max-h-[92vh] w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border border-[#e4ded2] bg-[#fbfbf9] shadow-2xl shadow-[#061224]/20 animate-in fade-in zoom-in-95 duration-150">
        {/* ── Top Header ── */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#ede7dc] bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#061224] text-[#c89b3c] shadow-xs">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#061224]">Add Manual Booking</h2>
                <span className="rounded-md bg-[#fbf5e8] px-2 py-0.5 text-[10px] font-bold text-[#8a7044]">
                  Walk-in / Offline
                </span>
              </div>
              <p className="mt-0.5 text-xs font-medium text-[#68758c]">
                {propertyName || "Cosmozin Hotel"} · Instant room reservation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!submitting) onClose();
            }}
            aria-label="Close dialog"
            className="grid h-8 w-8 place-items-center rounded-xl text-[#8b96aa] hover:bg-[#f0ece6] hover:text-[#061224] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {createdCode ? (
            /* ── Success State ── */
            <div className="flex flex-col items-center justify-center gap-5 py-10 text-center">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/60 shadow-sm">
                <CheckCircle2 className="h-10 w-10" strokeWidth={1.75} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#061224]">Booking Confirmed!</h3>
                <p className="mt-1 text-sm font-medium text-[#68758c]">
                  The manual reservation has been recorded and confirmed.
                </p>
              </div>

              <div className="w-full max-w-sm rounded-2xl border border-[#e4ded2] bg-white p-5 text-center shadow-xs">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8b96aa]">
                  Confirmation Code
                </p>
                <p className="mt-2 font-mono text-2xl font-black tracking-[0.14em] text-[#061224]">
                  {createdCode}
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-[#f3efe8] pt-3 text-xs text-[#68758c]">
                  <span>Guest: <strong className="text-[#061224]">{form.guestName}</strong></span>
                  <span>Total: <strong className="text-[#061224]">{fmt.format(finalTotalPaise / 100)}</strong></span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onCreated(createdId)}
                className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#061224] px-7 py-3 text-xs font-bold text-white shadow-sm hover:bg-[#0c1f3b] transition-all"
              >
                <span>View Reservation in Dashboard</span>
                <ArrowRight className="h-3.5 w-3.5 text-[#c89b3c]" />
              </button>
            </div>
          ) : (
            /* ── Booking Form ── */
            <form id="mbf" onSubmit={handleSubmit} noValidate className="space-y-4">
              {/* Segmented Booking Mode Toggle */}
              <div className="rounded-2xl border border-[#ede7dc] bg-white p-2 shadow-xs">
                <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#f4f2ee] p-1">
                  <button
                    type="button"
                    onClick={() => {
                      set("bookingMode", "overnight");
                      set("ratePlanId", "");
                    }}
                    className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition-all ${
                      form.bookingMode === "overnight"
                        ? "bg-[#061224] text-white shadow-xs"
                        : "text-[#68758c] hover:text-[#061224]"
                    }`}
                  >
                    <Moon className="h-3.5 w-3.5" />
                    <span>Overnight Stay</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      set("bookingMode", "hourly");
                      set("ratePlanId", "");
                    }}
                    className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition-all ${
                      form.bookingMode === "hourly"
                        ? "bg-[#061224] text-white shadow-xs"
                        : "text-[#68758c] hover:text-[#061224]"
                    }`}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    <span>Hourly / Day Use</span>
                  </button>
                </div>
              </div>

              {/* 1. Guest Information */}
              <SectionCard
                icon={User2}
                title="Guest Information"
                subtitle="Primary contact details for this booking"
              >
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div className="sm:col-span-1">
                    <label className={FIELD_LABEL_CLS}>
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      required
                      autoFocus
                      placeholder="e.g. Priya Sharma"
                      aria-label="Guest name"
                      value={form.guestName}
                      onChange={(e) => set("guestName", e.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label className={FIELD_LABEL_CLS}>Phone Number</label>
                    <input
                      type="tel"
                      placeholder="+91 98765 43210"
                      aria-label="Phone number"
                      value={form.guestPhone}
                      onChange={(e) => set("guestPhone", e.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={FIELD_LABEL_CLS}>Email Address</label>
                    <input
                      type="email"
                      placeholder="guest@email.com"
                      aria-label="Email address"
                      value={form.guestEmail}
                      onChange={(e) => set("guestEmail", e.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>
                </div>
              </SectionCard>

              {/* 2. Stay & Timing Details */}
              <SectionCard
                icon={CalendarDays}
                title="Stay & Timing"
                subtitle={
                  form.bookingMode === "hourly"
                    ? "Specify arrival time and duration"
                    : "Select check-in and check-out dates"
                }
              >
                <div className="grid gap-3.5 sm:grid-cols-2">
                  {/* Check-in Date */}
                  <div className="sm:col-span-1">
                    <label className={FIELD_LABEL_CLS}>
                      {form.bookingMode === "hourly" ? "Date of Stay" : "Check-in Date"}{" "}
                      <span className="text-rose-500">*</span>
                    </label>
                    <PartnerDatePicker
                      required
                      min={today}
                      aria-label="Check-in date"
                      value={form.checkIn}
                      onChange={(e) => set("checkIn", e.target.value)}
                      className="!min-h-[42px] !border-[#e4ded2] !bg-[#fdfdfc] hover:!border-[#c89b3c] focus-visible:!ring-2 focus-visible:!ring-[#c89b3c]/15 focus-visible:!border-[#c89b3c]"
                    />
                  </div>

                  {/* Check-out Date (Overnight) */}
                  {form.bookingMode === "overnight" ? (
                    <div className="sm:col-span-1">
                      <label className={FIELD_LABEL_CLS}>
                        Check-out Date <span className="text-rose-500">*</span>
                      </label>
                      <PartnerDatePicker
                        required
                        min={form.checkIn || today}
                        aria-label="Check-out date"
                        value={form.checkOut}
                        onChange={(e) => set("checkOut", e.target.value)}
                        className="!min-h-[42px] !border-[#e4ded2] !bg-[#fdfdfc] hover:!border-[#c89b3c] focus-visible:!ring-2 focus-visible:!ring-[#c89b3c]/15 focus-visible:!border-[#c89b3c]"
                      />
                    </div>
                  ) : (
                    /* Hourly Timing Controls */
                    <>
                      <div className="sm:col-span-1">
                        <label className={FIELD_LABEL_CLS}>
                          Arrival Time <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="time"
                          step={900}
                          required
                          value={form.arrivalTime}
                          onChange={(e) => set("arrivalTime", e.target.value)}
                          className={INPUT_CLS}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={FIELD_LABEL_CLS}>
                          Stay Duration <span className="text-rose-500">*</span>
                        </label>
                        <select
                          required
                          value={
                            offeredDurations?.some((row) => row.hours * 60 === form.durationMinutes)
                              ? form.durationMinutes
                              : ""
                          }
                          onChange={(e) => {
                            const minutes = Number(e.target.value);
                            set("durationMinutes", minutes);
                            set(
                              "nightlyRateRupees",
                              (offeredDurations?.find((row) => row.hours * 60 === minutes)
                                ?.pricePaise ?? 0) / 100
                            );
                          }}
                          className={INPUT_CLS}
                        >
                          <option value="">Choose a priced duration</option>
                          {offeredDurations?.map((row) => (
                            <option key={row.hours} value={row.hours * 60}>
                              {row.hours} hours · {fmt.format(row.pricePaise / 100)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  {/* Nights summary badge */}
                  {form.bookingMode === "overnight" && nights > 0 && (
                    <div className="sm:col-span-2 flex items-center justify-between rounded-xl border border-[#e4ded2] bg-[#fbfbf9] px-3.5 py-2.5 text-xs">
                      <span className="font-medium text-[#68758c]">Stay Length</span>
                      <span className="rounded-md bg-[#061224] px-2.5 py-1 font-bold text-white shadow-xs">
                        {nights} night{nights !== 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* 3. Room & Rate Plan */}
              <SectionCard
                icon={BedDouble}
                title="Room & Rate Plan"
                subtitle="Select room category, rate plan, and occupancy"
              >
                <div className="grid gap-3.5 sm:grid-cols-2">
                  {/* Room Category */}
                  <div className="sm:col-span-1">
                    <label className={FIELD_LABEL_CLS}>
                      Room Category <span className="text-rose-500">*</span>
                    </label>
                    <select
                      aria-label="Room category"
                      required
                      value={form.roomTypeId}
                      onChange={(e) => {
                        set("roomTypeId", e.target.value);
                        set("ratePlanId", "");
                      }}
                      className={INPUT_CLS}
                    >
                      <option value="">Choose room type</option>
                      {choices.rooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Published Rate */}
                  <div className="sm:col-span-1">
                    <label className={FIELD_LABEL_CLS}>
                      Published Rate <span className="text-rose-500">*</span>
                    </label>
                    <select
                      aria-label="Published rate"
                      required
                      value={form.ratePlanId}
                      disabled={!form.roomTypeId}
                      onChange={(e) => {
                        set("ratePlanId", e.target.value);
                        const rate = choices.rates.find((r) => r.id === e.target.value);
                        if (form.bookingMode === "hourly") {
                          set("durationMinutes", 0);
                          set("nightlyRateRupees", 0);
                        } else if (rate?.basePricePaise) {
                          set("nightlyRateRupees", rate.basePricePaise / 100);
                        }
                      }}
                      className={INPUT_CLS}
                    >
                      <option value="">
                        {form.roomTypeId ? "Choose a published rate" : "Select room first"}
                      </option>
                      {choices.rates
                        .filter(
                          (rate) =>
                            rate.roomTypeId === form.roomTypeId &&
                            (rate.bookingMode ?? "overnight") === form.bookingMode &&
                            rate.status === "active" &&
                            eligiblePricing(rate)
                        )
                        .map((rate) => (
                          <option key={rate.id} value={rate.id}>
                            {rate.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Occupancy: Adults & Children */}
                  <div className="sm:col-span-1">
                    <label className={FIELD_LABEL_CLS}>Adults (Age 13+)</label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      aria-label="Adults"
                      value={form.adults}
                      onChange={(e) => set("adults", Number(e.target.value))}
                      className={INPUT_CLS}
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label className={FIELD_LABEL_CLS}>Children (Age 0-12)</label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      aria-label="Children"
                      value={form.children}
                      onChange={(e) => set("children", Number(e.target.value))}
                      className={INPUT_CLS}
                    />
                  </div>
                </div>
              </SectionCard>

              {/* 4. Pricing & Payment Collection */}
              <SectionCard
                icon={CreditCard}
                title="Pricing & Payment"
                subtitle="Review rates, negotiated prices, and collection status"
              >
                <div className="grid gap-3.5 sm:grid-cols-2">
                  {/* Published Date Price Notice */}
                  {effectiveRate?.datePricingEnabled && (
                    <div className="sm:col-span-2 rounded-xl border border-amber-200/80 bg-[#fefcf8] p-3 text-xs">
                      {dateQuote.isFetching ? (
                        <div className="flex items-center gap-2 text-[#8a7044]">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Fetching published date prices…</span>
                        </div>
                      ) : dateQuote.error ? (
                        <span className="font-semibold text-rose-600">
                          {dateQuote.error.message}
                        </span>
                      ) : dateQuote.data ? (
                        <div className="text-[#68758c]">
                          Published room subtotal:{" "}
                          <strong className="text-[#061224]">
                            {fmt.format(dateQuote.data.subtotalPaise / 100)}
                          </strong>
                          . The field below overrides this price for negotiated walk-ins.
                        </div>
                      ) : (
                        <span className="text-[#8b96aa]">
                          Select stay dates to load live published prices.
                        </span>
                      )}
                    </div>
                  )}

                  {/* Base Nightly / Stay Rate */}
                  <div className="sm:col-span-1">
                    <label className={FIELD_LABEL_CLS}>
                      {form.bookingMode === "hourly"
                        ? "Base Stay Price before Tax (₹)"
                        : "Base Nightly Price before Tax (₹)"}{" "}
                      <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-[#8b96aa]">
                        ₹
                      </span>
                      <input
                        type="number"
                        required
                        min={1}
                        step={1}
                        placeholder="5000"
                        disabled={!permits("rates.manage")}
                        value={form.nightlyRateRupees || ""}
                        onChange={(e) => set("nightlyRateRupees", Number(e.target.value))}
                        className={`${INPUT_CLS} pl-8`}
                      />
                    </div>
                  </div>

                  {/* Payment Status */}
                  <div className="sm:col-span-1">
                    <label className={FIELD_LABEL_CLS}>Payment Status</label>
                    <select
                      aria-label="Payment status"
                      disabled={!permits("payment.collect")}
                      title={!permits("payment.collect") ? "Ask a cashier to record payment after creating the reservation." : undefined}
                      value={form.paymentMethod}
                      onChange={(e) => set("paymentMethod", e.target.value)}
                      className={INPUT_CLS}
                    >
                      <option value="pay_at_property">Pay at Property (Unpaid)</option>
                      <option value="paid">Already Paid (Cash / UPI / Card)</option>
                    </select>
                  </div>

                  {/* Negotiated Price Reason */}
                  {permits("rates.manage") && (negotiated || effectiveRate?.datePricingEnabled) && (
                    <div className="sm:col-span-2">
                      <label className={FIELD_LABEL_CLS}>
                        Negotiated Price Reason{" "}
                        {negotiated && <span className="text-rose-500">*</span>}
                        <span className="text-[11px] font-normal text-[#8b96aa]">
                          (leave empty to use published date prices)
                        </span>
                      </label>
                      <input
                        required={negotiated}
                        minLength={3}
                        placeholder="e.g. Corporate discount, repeat guest agreement"
                        value={form.negotiatedPriceReason}
                        onChange={(e) => set("negotiatedPriceReason", e.target.value)}
                        className={INPUT_CLS}
                      />
                    </div>
                  )}

                  {/* Already Paid Details */}
                  {form.paymentMethod === "paid" && (
                    <>
                      <div className="sm:col-span-1">
                        <label className={FIELD_LABEL_CLS}>Payment Method</label>
                        <select
                          className={INPUT_CLS}
                          value={form.collectionMethod}
                          onChange={(e) => set("collectionMethod", e.target.value)}
                        >
                          <option value="cash">Cash</option>
                          <option value="upi">UPI</option>
                          <option value="card_terminal">Card Terminal (POS)</option>
                        </select>
                      </div>
                      <div className="sm:col-span-1">
                        <label className={FIELD_LABEL_CLS}>
                          Payment Reference{" "}
                          {form.collectionMethod !== "cash" && (
                            <span className="text-rose-500">*</span>
                          )}
                        </label>
                        <input
                          className={INPUT_CLS}
                          placeholder={
                            form.collectionMethod === "cash"
                              ? "Optional receipt note"
                              : "e.g. UPI Ref / Card Txn ID"
                          }
                          required={form.collectionMethod !== "cash"}
                          value={form.collectionReference}
                          onChange={(e) => set("collectionReference", e.target.value)}
                          maxLength={180}
                        />
                      </div>
                    </>
                  )}

                  {/* Live Price Summary Box */}
                  {form.nightlyRateRupees > 0 && (
                    <div className="sm:col-span-2 rounded-2xl border border-[#e6dbc8] bg-gradient-to-br from-[#fbf8f0] to-[#f6efe0] p-4 text-[#061224] shadow-xs">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-bold text-[#8a7044]">
                            {effectiveRate?.datePricingEnabled && !negotiated
                              ? `Published room subtotal ${fmt.format(subtotalPaise / 100)}`
                              : form.bookingMode === "hourly"
                                ? `${form.durationMinutes / 60} hours · ${fmt.format(total)}`
                                : `${nights} nights × ${fmt.format(form.nightlyRateRupees)}`}
                          </p>
                          <p className="mt-1 text-xs font-medium text-[#705e40]">
                            {form.paymentMethod === "paid" ? "Collected in full" : "Collect at property"} ·{" "}
                            <span>Tax {fmt.format(taxPaise / 100)}</span> · Fees{" "}
                            {fmt.format((selectedRate?.customerFeePaise ?? 0) / 100)}
                          </p>
                        </div>
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8a7044]">
                            Total Amount
                          </span>
                          <p className="text-2xl font-black text-[#061224]">
                            {fmt.format(finalTotalPaise / 100)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* 5. Special Requests & Notes */}
              <SectionCard
                icon={FileText}
                title="Special Requests & Notes"
                subtitle="Optional guest remarks or internal instructions"
              >
                <div>
                  <textarea
                    rows={2}
                    placeholder="Late arrival, extra towels, high floor, quiet room, etc."
                    value={form.specialRequest}
                    onChange={(e) => set("specialRequest", e.target.value)}
                    className={`${INPUT_CLS} resize-none`}
                  />
                </div>
              </SectionCard>

              {/* Error Banner */}
              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700 animate-in fade-in">
                  {error}
                </div>
              )}
            </form>
          )}
        </div>

        {/* ── Footer ── */}
        {!createdCode && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#ede7dc] bg-white px-6 py-4">
            <p className="hidden text-xs font-medium text-[#8b96aa] sm:block">
              Booking is confirmed immediately upon submission.
            </p>
            <div className="flex w-full items-center justify-end gap-2.5 sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  if (!submitting) onClose();
                }}
                className="rounded-xl border border-[#e4ded2] bg-white px-5 py-2.5 text-xs font-bold text-[#4d5870] hover:border-[#c89b3c] hover:bg-[#fbf5e8] hover:text-[#061224] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="mbf"
                disabled={submitting || !propertyId}
                className="inline-flex items-center gap-2 rounded-xl bg-[#061224] px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#0c1f3b] disabled:opacity-50 transition-colors"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{submitting ? "Creating…" : "Create Booking"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
