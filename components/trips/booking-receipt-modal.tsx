"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  CheckCircle2,
  FileText,
  Hotel,
  MapPin,
  Printer,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { StayRequest } from "@/lib/stay/contracts";
import { supplementalFinancials } from "@/lib/stay/agreements";

type Amenity = { code: string; label: string };
export type BookingReceiptData = {
  customizations?: StayRequest[];
  stayPaymentReceipts?: import("@/lib/stay/contracts").StayPaymentReceipt[];
  id: string;
  confirmationCode: string;
  propertyName: string;
  propertyAddress?: string | null;
  propertyCity?: string | null;
  propertyState?: string | null;
  propertyPublicPhone?: string | null;
  propertyPublicEmail?: string | null;
  roomName: string;
  ratePlanName: string;
  checkIn: string;
  checkOut: string;
  checkInTime?: string;
  checkOutTime?: string;
  nights: number;
  adults: number;
  children: number;
  infants?: number;
  bookingMode?: "overnight" | "hourly";
  durationMinutes?: number;
  leadGuest?: { name: string; email: string; phone: string } | null;
  bookingContact?: { name: string; email: string; phone: string } | null;
  billing?: {
    legalName: string;
    gstin: string;
    address: { line1: string; city: string; state: string; postalCode: string };
  } | null;
  amenitySnapshot?: {
    version: 1;
    roomAmenities: Amenity[];
    propertyAmenities: Amenity[];
    rateInclusions: Amenity[];
  } | null;
  startAt?: string | null;
  endAt?: string | null;
  timezone?: string;
  netPaidPaise?: number;
  extrasTotalPaise?: number;
  customizationCreditPaise?: number;
  effectiveTotalPaise?: number;
  subtotalPaise?: number;
  taxPaise?: number;
  customerFeePaise?: number;
  totalPaise: number;
  paidPaise: number;
  balanceDuePaise?: number;
  refundDuePaise?: number;
  refundedPaise?: number;
  currency: string;
  bookingStatus: string;
  paymentStatus: string;
  paymentMethod?: string | null;
  cancellationPolicy?: {
    name: string;
    description: string;
    refundableUntilHours: number;
    cancellationFeePercent: number;
  } | null;
  createdAt?: string | null;
};

type Props = { booking: BookingReceiptData | null; onClose: () => void };
const money = (paise = 0, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
const human = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const date = (value: string) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(`${value}T12:00:00`))
    : "Not available";
const time = (value?: string) => {
  if (!value) return "";
  if (/am|pm/i.test(value)) return value;
  const [hours, minutes = "00"] = value.split(":"),
    hour = Number(hours);
  return Number.isFinite(hour)
    ? `${hour % 12 || 12}:${minutes.slice(0, 2)} ${hour >= 12 ? "PM" : "AM"}`
    : value;
};
function stayDate(
  instant: string | null | undefined,
  fallbackDate: string,
  fallbackTime: string | undefined,
  timezone: string,
) {
  if (!instant || !Number.isFinite(Date.parse(instant)))
    return { day: date(fallbackDate), time: time(fallbackTime) };
  return {
    day: new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: timezone,
    }).format(new Date(instant)),
    time: new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: timezone,
    }).format(new Date(instant)),
  };
}
const paymentLabels: Record<string, string> = {
  paid: "Paid",
  paid_at_property: "Paid",
  partially_paid: "Partially paid",
  pay_at_property: "Pay at property",
  pending_payment: "Payment pending",
  pending: "Payment pending",
  failed: "Payment failed",
  payment_failed: "Payment failed",
  refund_pending: "Refund pending",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
};
const paymentMethods: Record<string, string> = {
  online: "Online payment",
  razorpay: "Online payment",
  pay_at_property: "At the property",
  paid: "At the property",
  cash: "Cash",
  upi: "UPI",
  card_terminal: "Card at the property",
};

export function BookingReceiptModal({ booking, onClose }: Props) {
  return booking ? <Receipt booking={booking} onClose={onClose} /> : null;
}
function Receipt({
  booking,
  onClose,
}: {
  booking: BookingReceiptData;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null),
    closeHandler = useRef(onClose);
  useEffect(() => {
    closeHandler.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() =>
      panel.current?.querySelector<HTMLElement>("button")?.focus(),
    );
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeHandler.current();
      }
      if (event.key !== "Tab") return;
      event.stopImmediatePropagation();
      const controls = [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href]",
        ) ?? []),
      ].filter((el) => el.getClientRects().length);
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", key, true);
      document.body.style.overflow = overflow;
      previousFocus?.focus();
    };
  }, []);
  const timezone = booking.timezone || "Asia/Kolkata";
  const arrival = stayDate(
    booking.startAt,
    booking.checkIn,
    booking.checkInTime,
    timezone,
  );
  const departure = stayDate(
    booking.endAt,
    booking.checkOut,
    booking.checkOutTime,
    timezone,
  );
  const total =
    booking.effectiveTotalPaise ??
    Math.max(0, booking.totalPaise - (booking.customizationCreditPaise ?? 0));
  const refunded = booking.refundedPaise ?? 0;
  const netPaid =
    booking.netPaidPaise ?? Math.max(0, booking.paidPaise - refunded);
  const balance = booking.balanceDuePaise ?? Math.max(0, total - netPaid);
  const status =
    (booking.refundDuePaise ?? 0) > 0
      ? "Refund pending"
      : refunded > 0
        ? refunded >= booking.paidPaise
          ? "Refunded"
          : "Partially refunded"
        : (paymentLabels[booking.paymentStatus] ??
          human(booking.paymentStatus));
  const fullyPaid =
    balance === 0 &&
    booking.paidPaise > 0 &&
    !refunded &&
    !(booking.refundDuePaise ?? 0);
  const address = [
    ...new Set(
      (
        booking.propertyAddress ||
        [booking.propertyCity, booking.propertyState].filter(Boolean).join(", ")
      )
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ].join(", ");
  const duration =
    booking.bookingMode === "hourly"
      ? `${(booking.durationMinutes ?? 0) / 60} ${(booking.durationMinutes ?? 0) === 60 ? "hour" : "hours"}`
      : `${booking.nights} ${booking.nights === 1 ? "night" : "nights"}`;
  const guests = [
    `${booking.adults} ${booking.adults === 1 ? "adult" : "adults"}`,
    booking.children
      ? `${booking.children} ${booking.children === 1 ? "child" : "children"}`
      : "",
    booking.infants
      ? `${booking.infants} ${booking.infants === 1 ? "infant" : "infants"}`
      : "",
  ]
    .filter(Boolean)
    .join(", ");
  const contact = booking.bookingContact;
  const differentContact =
    contact &&
    (!booking.leadGuest ||
      (["name", "email", "phone"] as const).some(
        (key) =>
          contact[key] &&
          booking.leadGuest?.[key] &&
          contact[key].trim().toLowerCase() !==
            booking.leadGuest[key].trim().toLowerCase(),
      ));
  const includedExtras = (booking.customizations ?? []).filter(
    (r) =>
      !r.quote &&
      r.totalPaise > 0 &&
      (r.agreementVersion !== 2 || r.settlement === "included"),
  );
  const supplemental = supplementalFinancials(
    booking.customizations ?? [],
    booking.stayPaymentReceipts,
  );
  const extraPayments = booking.stayPaymentReceipts?.length
    ? booking.stayPaymentReceipts.map((r) => ({
        reference: r.paymentId,
        title: r.scope,
        amount: r.amountPaise,
        status: r.status,
      }))
    : (booking.customizations ?? []).flatMap((r) =>
        r.quote?.paymentId
          ? [
              {
                reference: r.quote.paymentId,
                title: r.quote.scope,
                amount: r.quote.amountPaise,
                status: r.quote.paymentStatus ?? "paid",
              },
            ]
          : [],
      );
  const paymentMethod =
    paymentMethods[booking.paymentMethod ?? ""] ||
    (booking.paymentStatus === "paid_at_property" ? "At the property" : "");
  const bookedOn =
    booking.createdAt && Number.isFinite(Date.parse(booking.createdAt))
      ? new Intl.DateTimeFormat("en-IN", {
          dateStyle: "medium",
          timeZone: timezone,
        }).format(new Date(booking.createdAt))
      : null;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="booking-receipt-overlay fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Booking payment receipt"
        className="booking-receipt-print flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="booking-receipt-controls flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <span className="flex items-center gap-2 font-bold text-slate-800">
            <FileText size={17} strokeWidth={1.75} />
            Receipt
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0b1f3a] px-3 text-xs font-semibold text-white sm:px-4 sm:text-sm"
            >
              <Printer size={16} />
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close receipt"
              className="grid h-11 w-11 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"
            >
              <X size={19} />
            </button>
          </div>
        </div>
        <div className="booking-receipt-body min-h-0 overflow-y-auto">
          <article className="p-5 text-sm text-slate-700 sm:p-8">
            <header className="receipt-keep-together flex items-start justify-between gap-4 border-b-2 border-[#0b1f3a] pb-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-[#0b1f3a]">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#0b1f3a] text-white">
                    <Hotel size={16} />
                  </span>
                  Helpkey
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Booking payment receipt
                </p>
              </div>
              <div className="max-w-[50%] text-right text-[11px] leading-relaxed">
                <p className="font-semibold text-slate-500">
                  Booking reference
                </p>
                <p className="mt-0.5 break-all font-mono font-bold text-slate-900">
                  {booking.confirmationCode}
                </p>
                {bookedOn && (
                  <p className="mt-1 text-slate-500">Booked on {bookedOn}</p>
                )}
                <p
                  className={`mt-1 inline-flex flex-wrap items-center justify-end gap-1 font-semibold ${fullyPaid ? "text-emerald-700" : "text-slate-600"}`}
                >
                  {fullyPaid && <CheckCircle2 size={13} />}
                  <span>{status}</span>
                  <span>· {human(booking.bookingStatus)}</span>
                </p>
              </div>
            </header>
            <section
              aria-label="Hotel details"
              className="receipt-keep-together mt-4 grid items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-[1fr_auto]"
            >
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Your stay
                </p>
                <h2 className="mt-0.5 text-base font-extrabold text-slate-900">
                  {booking.propertyName}
                </h2>
                {address && (
                  <p className="mt-1 flex gap-1 text-xs leading-relaxed text-slate-600">
                    <MapPin
                      size={14}
                      className="mt-0.5 shrink-0 text-[#0b1f3a]"
                    />
                    {address}
                  </p>
                )}
                {(booking.propertyPublicPhone ||
                  booking.propertyPublicEmail) && (
                  <p className="mt-1.5 break-words text-xs leading-relaxed text-slate-500">
                    {[booking.propertyPublicPhone, booking.propertyPublicEmail]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 border-t border-slate-200 pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                <QRCodeSVG
                  value={booking.confirmationCode}
                  size={68}
                  level="M"
                  marginSize={4}
                  title="Booking reference QR code"
                />
                <p className="max-w-[4.5rem] text-[10px] font-bold uppercase leading-snug tracking-wide text-slate-500">
                  Present at check-in
                </p>
              </div>
            </section>
            <section
              aria-label="Stay details"
              className="receipt-keep-together mt-4 border-y border-slate-200 py-4"
            >
              <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
                <Detail
                  label="Room & rate"
                  value={`${booking.roomName}${booking.ratePlanName ? ` · ${booking.ratePlanName}` : ""}`}
                />
                <Detail
                  label="Check-in"
                  value={arrival.day}
                  extra={arrival.time}
                />
                <Detail
                  label="Check-out"
                  value={departure.day}
                  extra={departure.time}
                />
                <Detail label="Guests" value={guests} />
                <Detail
                  label="Guest name"
                  value={booking.leadGuest?.name || "Not available"}
                  extra={booking.leadGuest?.email}
                />
                <Detail label="Duration" value={duration} />
                {differentContact && (
                  <Detail
                    label="Booked by"
                    value={contact.name}
                    extra={contact.email}
                  />
                )}
              </dl>
            </section>
            {booking.amenitySnapshot &&
              booking.amenitySnapshot.roomAmenities.length +
                booking.amenitySnapshot.propertyAmenities.length +
                booking.amenitySnapshot.rateInclusions.length >
                0 && (
                <section className="mt-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Amenities & inclusions
                  </h3>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <AmenityGroup
                      title="In your room"
                      values={booking.amenitySnapshot.roomAmenities}
                    />
                    <AmenityGroup
                      title="Hotel facilities"
                      values={booking.amenitySnapshot.propertyAmenities}
                    />
                    <AmenityGroup
                      title="Rate inclusions"
                      values={booking.amenitySnapshot.rateInclusions}
                    />
                  </div>
                </section>
              )}
            <section aria-labelledby="receipt-payment-heading" className="mt-6">
              <h3
                id="receipt-payment-heading"
                className="text-xs font-bold uppercase tracking-wider text-slate-500"
              >
                Payment details
              </h3>
              <dl className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 px-4">
                {typeof booking.subtotalPaise === "number" && (
                  <Amount
                    label={`Room charges · ${duration}`}
                    value={money(booking.subtotalPaise, booking.currency)}
                  />
                )}
                {(booking.taxPaise ?? 0) > 0 && (
                  <Amount
                    label="Taxes"
                    value={money(booking.taxPaise, booking.currency)}
                  />
                )}
                {(booking.customerFeePaise ?? 0) > 0 && (
                  <Amount
                    label="Booking fee"
                    value={money(booking.customerFeePaise, booking.currency)}
                  />
                )}
                {(booking.extrasTotalPaise ?? 0) > 0 && (
                  <Amount
                    label="Extras"
                    description={includedExtras
                      .map(
                        (r) =>
                          `${r.name}${r.variantName ? ` · ${r.variantName}` : ""}${r.quantity > 1 ? ` × ${r.quantity}` : ""}`,
                      )
                      .join(", ")}
                    value={money(booking.extrasTotalPaise, booking.currency)}
                  />
                )}
                {(booking.customizationCreditPaise ?? 0) > 0 && (
                  <>
                    <Amount
                      label="Original booking amount"
                      value={money(booking.totalPaise, booking.currency)}
                    />
                    <Amount
                      label="Adjustment for cancelled extras"
                      value={`−${money(booking.customizationCreditPaise, booking.currency)}`}
                    />
                  </>
                )}
                <Amount
                  label="Total amount"
                  value={money(total, booking.currency)}
                  strong
                />
                <Amount
                  label="Amount paid"
                  value={money(booking.paidPaise, booking.currency)}
                />
                <Amount
                  label="Balance due"
                  value={money(balance, booking.currency)}
                  strong
                />
                {(booking.refundDuePaise ?? 0) > 0 && (
                  <Amount
                    label="Refund pending"
                    value={money(booking.refundDuePaise, booking.currency)}
                  />
                )}
                {refunded > 0 && (
                  <>
                    <Amount
                      label="Amount refunded"
                      value={money(refunded, booking.currency)}
                    />
                    <Amount
                      label="Net amount paid"
                      value={money(netPaid, booking.currency)}
                    />
                  </>
                )}
                {paymentMethod && (
                  <Amount label="Payment method" value={paymentMethod} />
                )}
              </dl>
              {balance > 0 &&
                ["confirmed", "checked_in"].includes(booking.bookingStatus) && (
                  <p className="mt-2 text-xs text-slate-500">
                    Pay the remaining balance at the property.
                  </p>
                )}
            </section>
            {extraPayments.length > 0 && (
              <section className="mt-5 rounded-xl border border-slate-200 p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Additional payments
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Extras paid separately from your booking.
                </p>
                {extraPayments.map((r) => (
                  <div key={r.reference} className="receipt-line-item mt-2">
                    <dl>
                      <Amount
                        label={r.title}
                        value={money(r.amount, booking.currency)}
                      />
                    </dl>
                    <p className="text-xs text-slate-500">
                      {r.status === "refund_pending"
                        ? "Refund pending"
                        : r.status === "refunded"
                          ? "Refunded"
                          : "Paid"}
                    </p>
                    <p className="mt-1 break-all text-[11px] text-slate-500">
                      Payment reference: {r.reference}
                    </p>
                  </div>
                ))}
                <dl>
                  {supplemental.refundDuePaise > 0 && (
                    <Amount
                      label="Additional refunds pending"
                      value={money(
                        supplemental.refundDuePaise,
                        booking.currency,
                      )}
                    />
                  )}
                  {supplemental.refundedPaise > 0 && (
                    <Amount
                      label="Additional amount refunded"
                      value={money(
                        supplemental.refundedPaise,
                        booking.currency,
                      )}
                    />
                  )}
                </dl>
              </section>
            )}
            {booking.billing && (
              <section
                aria-label="Billing details"
                className="receipt-keep-together mt-6 rounded-lg bg-slate-50 p-4"
              >
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Billing details
                </h3>
                <p className="mt-1 font-semibold text-slate-900">
                  {booking.billing.legalName}
                </p>
                <p className="text-xs">GSTIN: {booking.billing.gstin}</p>
                <p className="text-xs">
                  {[
                    booking.billing.address.line1,
                    booking.billing.address.city,
                    booking.billing.address.state,
                    booking.billing.address.postalCode,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </section>
            )}
            {booking.cancellationPolicy && (
              <section className="mt-6 text-xs">
                <h3 className="font-bold text-slate-700">
                  Cancellation policy: {booking.cancellationPolicy.name}
                </h3>
                <p className="mt-1 leading-relaxed">
                  {booking.cancellationPolicy.description ||
                    `Cancellation fee: ${booking.cancellationPolicy.cancellationFeePercent}%.`}
                </p>
              </section>
            )}
            <footer className="mt-6 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
              This payment receipt is not a tax invoice. Please contact the
              property for a tax invoice. Need help?{" "}
              <Link
                href="/help"
                className="font-semibold text-[#0b1f3a] underline"
              >
                Contact Helpkey support
              </Link>
              .
            </footer>
          </article>
        </div>
      </div>
    </div>,
    document.body,
  );
}
function Detail({
  label,
  value,
  extra,
}: {
  label: string;
  value: string;
  extra?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 break-words text-xs font-medium leading-relaxed text-slate-800">
        {value}
      </dd>
      {extra && (
        <dd className="mt-1 break-words text-xs text-slate-500">{extra}</dd>
      )}
    </div>
  );
}
function Amount({
  label,
  value,
  description,
  strong = false,
}: {
  label: ReactNode;
  value: string;
  description?: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`receipt-line-item flex items-start justify-between gap-4 py-2 text-xs ${strong ? "font-bold text-slate-900" : ""}`}
    >
      <dt className="min-w-0">
        {label}
        {description && (
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            {description}
          </span>
        )}
      </dt>
      <dd className="shrink-0 text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function AmenityGroup({ title, values }: { title: string; values: Amenity[] }) {
  return values.length ? (
    <div className="rounded-lg bg-slate-50 p-3 text-xs">
      <p className="font-semibold text-slate-700">{title}</p>
      <p className="mt-1 leading-relaxed">
        {values.map((value) => value.label).join(" · ")}
      </p>
    </div>
  ) : null;
}
