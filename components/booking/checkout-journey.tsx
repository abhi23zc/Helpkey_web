"use client";
import { requestPriceBreakdown } from "@/lib/stay/pricing";
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
      className="flex items-center justify-between gap-2 sm:gap-3 w-full"
    >
      {checkoutSteps.map((value, i) => {
        const isCurrent = i === index;
        const isCompleted = i < index;
        const isAccessible = !locked && i <= furthestStep;

        return (
          <div key={value} className="flex flex-1 items-center gap-2 sm:gap-3 last:flex-initial">
            <button
              type="button"
              aria-current={isCurrent ? "step" : undefined}
              disabled={!isAccessible}
              onClick={() => onChange(value)}
              className={`group flex items-center gap-2 text-left transition ${
                isAccessible ? "cursor-pointer" : "cursor-default opacity-60"
              }`}
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold transition sm:h-7 sm:w-7 ${
                  isCompleted
                    ? "bg-[#b48a3c] text-white shadow-xs"
                    : isCurrent
                      ? "bg-[#b48a3c] text-white ring-2 ring-[#b48a3c]/30 shadow-xs"
                      : "border border-slate-300 bg-white text-slate-500"
                }`}
              >
                {isCompleted ? <Check className="h-3.5 w-3.5 stroke-[2.5]" /> : i + 1}
              </span>
              <span
                className={`text-xs sm:text-sm font-semibold transition ${
                  isCurrent
                    ? "text-[#141b2b]"
                    : isCompleted
                      ? "text-[#141b2b] group-hover:text-[#b48a3c]"
                      : "text-slate-500"
                }`}
              >
                <span className="hidden sm:inline">{checkoutStepLabels[value]}</span>
                <span className="sm:hidden">
                  {value === "details"
                    ? "Details"
                    : value === "extras"
                      ? "Personalize"
                      : "Review"}
                </span>
              </span>
            </button>

            {i < checkoutSteps.length - 1 && (
              <div
                className={`h-0.5 flex-1 transition ${
                  i < index ? "bg-[#b48a3c]" : "bg-slate-200"
                }`}
              />
            )}
          </div>
        );
      })}
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
                  {r.agreementVersion === 2 && r.settlement === "pending_hotel"
                    ? "Pending hotel approval · Excluded from checkout payment"
                    : r.confirmation === "approval"
                      ? "Hotel approval required"
                      : "Confirmed with booking"}
                </p>
                {r.variantInclusions && (
                  <p className="mt-1 text-xs text-[var(--hk-muted)]">
                    Includes: {r.variantInclusions}
                  </p>
                )}
                {r.billableQuantity && r.unitPricePaise > 0 ? (
                  <p className="mt-1 text-xs text-[var(--hk-muted)]">
                    {requestPriceBreakdown(r, currency)} · per{" "}
                    {r.pricingUnit ?? "item"}
                  </p>
                ) : null}
                {r.inputs?.note && (
                  <p className="mt-1 text-xs text-[var(--hk-muted)]">
                    {r.inputs.note}
                  </p>
                )}
                {r.inputs?.serviceAt && (
                  <p className="mt-1 text-xs text-[var(--hk-muted)]">
                    Needed{" "}
                    {new Date(r.inputs.serviceAt).toLocaleString("en-IN")}
                  </p>
                )}
                {Object.values(r.inputs?.choices ?? {}).length > 0 && (
                  <p className="mt-1 text-xs text-[var(--hk-muted)]">
                    {Object.entries(r.inputs!.choices!)
                      .map(
                        ([key, value]) =>
                          `${r.choiceLabels?.[key] ? `${r.choiceLabels[key]}: ` : ""}${value}`,
                      )
                      .join(" · ")}
                  </p>
                )}
              </div>
              <span className="shrink-0 font-semibold text-[var(--hk-navy)]">
                {r.source === "unlisted" || r.priceOnRequest
                  ? "Awaiting quote"
                  : r.totalPaise
                    ? formatMoney(r.totalPaise, currency)
                    : "Free"}
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
