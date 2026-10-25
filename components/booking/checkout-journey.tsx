"use client";
import { Check, Pencil, ShieldCheck, BedDouble } from "lucide-react";
import type { StayRequest } from "@/lib/stay/contracts";
import { formatMoney } from "@/lib/customer/offer";

export const checkoutSteps = ["details", "extras", "review"] as const;
export type CheckoutStep = (typeof checkoutSteps)[number];
export const checkoutStepLabels = {
  details: "Guest details",
  extras: "Personalize your stay",
  review: "Review & pay",
};
export function CheckoutProgress({
  step,
  locked,
  onChange,
  furthestStep,
}: {
  furthestStep: number;
  step: CheckoutStep;
  locked: boolean;
  onChange: (step: CheckoutStep) => void;
}) {
  const index = checkoutSteps.indexOf(step);
  return (
    <nav
      aria-label="Checkout progress"
      className="mt-6 grid grid-cols-3 gap-2 sm:gap-4"
    >
      {checkoutSteps.map((value, i) => (
        <button
          type="button"
          key={value}
          aria-current={step === value ? "step" : undefined}
          disabled={locked || i > furthestStep}
          onClick={() => onChange(value)}
          className={`flex min-h-14 items-center gap-2 rounded-xl border px-2 py-3 text-left transition sm:gap-3 sm:px-4 ${i === index ? "border-[var(--hk-navy)] bg-[var(--hk-navy)] text-white shadow-sm" : "border-[var(--hk-border)] bg-white text-[var(--hk-muted)] hover:border-[var(--hk-navy)]/40"}`}
        >
          <span
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold sm:h-8 sm:w-8 ${i === index ? "bg-white/15" : "bg-[var(--hk-surface-soft)] text-[var(--hk-navy)]"}`}
          >
            {i < index ? <Check className="h-4 w-4" /> : i + 1}
          </span>
          <span className="text-[11px] font-semibold leading-4 sm:text-sm">
            <span className="hidden sm:inline">
              {checkoutStepLabels[value]}
            </span>
            <span className="sm:hidden">
              {value === "details"
                ? "Details"
                : value === "extras"
                  ? "Extras"
                  : "Review"}
            </span>
            {value === "extras" && (
              <span
                className={`block text-[10px] font-normal ${i === index ? "text-white/75" : "text-[var(--hk-muted)]"}`}
              >
                <span className="hidden sm:inline">Optional additions</span>
                <span className="sm:hidden">Optional</span>
              </span>
            )}
          </span>
        </button>
      ))}
    </nav>
  );
}

export function CheckoutReview({
  names,
  email,
  phone,
  contactName,
  requests,
  currency,
  notes,
  billing,
  onEdit,
  locked,
  propertyName,
  roomName,
  stayLabel,
  amenities,
  cancellation,
  rules,
}: {
  contactName: string | null;
  names: string[];
  email: string;
  phone: string;
  requests: StayRequest[];
  currency: string;
  notes: string;
  billing: string | null;
  onEdit: (step: CheckoutStep) => void;
  locked: boolean;
  propertyName: string;
  roomName: string;
  stayLabel: string;
  amenities: string[];
  cancellation: string;
  rules: React.ReactNode;
}) {
  const edit = (step: CheckoutStep, label: string) => (
    <button
      type="button"
      disabled={locked}
      onClick={() => onEdit(step)}
      aria-label={`Edit ${label}`}
      className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-[var(--hk-navy)] underline"
    >
      <Pencil className="h-3.5 w-3.5" />
      Edit
    </button>
  );
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[var(--hk-border)] bg-white p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <BedDouble className="h-5 w-5 text-[var(--hk-gold)]" />
          <h2 className="font-bold text-[var(--hk-navy)]">Your stay</h2>
        </div>
        <p className="font-semibold text-[var(--hk-navy)]">{propertyName}</p>
        <p className="mt-1 text-sm text-[var(--hk-muted)]">{roomName}</p>
        <p className="mt-2 text-sm text-[var(--hk-muted)]">{stayLabel}</p>
        {amenities.length > 0 && (
          <details className="mt-3 text-sm text-[var(--hk-muted)]">
            <summary className="min-h-11 cursor-pointer py-3 font-medium text-[var(--hk-navy)]">
              Included with your room
            </summary>
            <p className="leading-6">{amenities.join(" · ")}</p>
          </details>
        )}
      </section>
      <section className="rounded-2xl border border-[var(--hk-border)] bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-[var(--hk-navy)]">Guests & contact</h2>
          {edit("details", "guest details")}
        </div>
        <p className="mt-1 text-sm leading-6 text-[var(--hk-navy)]">
          {names.join(", ")}
        </p>
        {contactName && (
          <p className="mt-2 text-sm text-[var(--hk-muted)]">
            Booking contact: {contactName}
          </p>
        )}
        <p className="mt-2 break-all text-sm text-[var(--hk-muted)]">{email}</p>
        <p className="mt-1 text-sm text-[var(--hk-muted)]">{phone}</p>
        {billing && (
          <p className="mt-3 text-sm text-[var(--hk-muted)]">
            Business invoice: {billing}
          </p>
        )}
      </section>
      <section className="rounded-2xl border border-[var(--hk-border)] bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-[var(--hk-navy)]">
            Your stay additions
          </h2>
          {edit("extras", "stay additions")}
        </div>
        {!requests.length && (
          <p className="mt-2 text-sm text-[var(--hk-muted)]">
            No extras added · ₹0 additional charges
          </p>
        )}
        <div className="divide-y divide-[var(--hk-border)]">
          {requests.map((r) => (
            <div
              key={r.id}
              className="flex items-start justify-between gap-3 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-[var(--hk-navy)]">
                  {r.name}
                  {r.variantName ? ` · ${r.variantName}` : ""} × {r.quantity}
                </p>
                <p className="mt-1 text-xs text-[var(--hk-muted)]">
                  {r.confirmation === "approval"
                    ? "Hotel approval required"
                    : "Confirmed with booking"}
                </p>
              </div>
              <span className="shrink-0 font-semibold text-[var(--hk-navy)]">
                {r.totalPaise ? formatMoney(r.totalPaise, currency) : "Free"}
              </span>
            </div>
          ))}
        </div>
        {notes && (
          <div className="mt-3 border-t border-[var(--hk-border)] pt-3">
            <p className="text-xs font-semibold text-[var(--hk-navy)]">
              Note for the hotel
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--hk-muted)]">
              {notes}
            </p>
            <p className="mt-2 text-xs text-[var(--hk-muted)]">
              Requests are subject to availability.
            </p>
          </div>
        )}
        {requests.some((r) => r.unitPricePaise > 0) && (
          <p className="mt-4 rounded-xl bg-[var(--hk-surface-soft)] p-3 text-xs leading-5 text-[var(--hk-muted)]">
            Prices include all charges. Paid extras are collected in full with
            online payment, including deposit bookings. If the hotel declines a
            paid request, its full price is refunded. New paid extras cannot be
            added after booking. Extra charges follow the room’s cancellation
            policy.
          </p>
        )}
      </section>
      <section className="rounded-2xl border border-[var(--hk-border)] bg-white p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-bold text-[var(--hk-navy)]">
          <ShieldCheck className="h-5 w-5 text-[var(--hk-gold)]" />
          Before you confirm
        </h2>
        <p className="mt-3 text-sm leading-6 text-[var(--hk-muted)]">
          {cancellation}
        </p>
        <div className="mt-4 border-t border-[var(--hk-border)] pt-4 text-sm">
          {rules}
        </div>
      </section>
    </div>
  );
}
