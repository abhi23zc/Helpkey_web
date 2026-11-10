"use client";
import { requestPriceBreakdown } from "@/lib/stay/pricing";
import { getOfferingImageUrl } from "@/lib/stay/imagery";
import {
  Check,
  Pencil,
  ShieldCheck,
  BedDouble,
  Clock,
  MapPin,
  Users,
  CalendarDays,
  Info,
  AlertCircle,
} from "lucide-react";
import type { StayRequest } from "@/lib/stay/contracts";
import { formatMoney } from "@/lib/customer/offer";

// Luxury hotel lobby fallback — renders when the property hasn't uploaded a cover photo yet
const HOTEL_FALLBACK =
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80";

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

  const stepSubtitles: Partial<Record<CheckoutStep, string>> = {
    extras: "Optional additions",
  };

  return (
    <nav
      aria-label="Checkout progress"
      className="grid w-full grid-cols-3 gap-2.5 sm:gap-3"
    >
      {checkoutSteps.map((value, i) => {
        const isCurrent = i === index;
        const isCompleted = i < index;
        const isAccessible = !locked && i <= furthestStep;
        const subtitle = stepSubtitles[value];

        return (
          <button
            key={value}
            type="button"
            aria-current={isCurrent ? "step" : undefined}
            disabled={!isAccessible}
            onClick={() => onChange(value)}
            className={`group flex min-h-[58px] sm:min-h-[62px] w-full items-center gap-2.5 sm:gap-3 rounded-2xl border px-3 sm:px-4 py-2.5 text-left transition-all ${
              isCurrent
                ? "bg-[#0c1e36] text-white border-transparent shadow-xs"
                : isCompleted
                  ? "bg-white border-[#e5e5ea] hover:border-slate-300 hover:shadow-2xs cursor-pointer"
                  : "bg-white border-[#e5e5ea] opacity-85 cursor-default"
            }`}
          >
            {/* Number / Check Badge */}
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold transition ${
                isCurrent
                  ? "bg-[#1f314c] text-white"
                  : isCompleted
                    ? "bg-[#0c1e36] text-white"
                    : "bg-[#e8edfb] text-[#2c3e5a]"
              }`}
            >
              {isCompleted ? (
                <Check className="h-3.5 w-3.5 stroke-[2.5]" />
              ) : (
                i + 1
              )}
            </span>

            {/* Step Label & Subtitle */}
            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-xs font-semibold sm:text-sm leading-tight ${
                  isCurrent
                    ? "text-white"
                    : isCompleted
                      ? "text-[#141b2b] group-hover:text-[#b48a3c]"
                      : "text-[#141b2b]"
                }`}
              >
                <span className="sm:hidden">
                  {value === "details"
                    ? "Details"
                    : value === "extras"
                      ? "Personalize"
                      : "Review"}
                </span>
                <span className="hidden sm:inline">{checkoutStepLabels[value]}</span>
              </p>
              {subtitle && (
                <p
                  className={`mt-0.5 truncate text-[11px] leading-tight ${
                    isCurrent ? "text-slate-300" : "text-slate-400"
                  }`}
                >
                  {subtitle}
                </p>
              )}
            </div>
          </button>
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
  propertyCoverImageUrl,
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
  propertyCoverImageUrl?: string | null;
}) {
  const edit = (step: CheckoutStep, label: string) => (
    <button
      type="button"
      disabled={locked}
      onClick={() => onEdit(step)}
      aria-label={`Edit ${label}`}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-[#785d1c] bg-[#fbf6ee] hover:bg-[#f5ebd8] border border-[#e8d9b5] transition"
    >
      <Pencil className="h-3 w-3" />
      Edit
    </button>
  );

  // Parse stayLabel for structured display
  // "Wed, 11 Nov · 14:00 → Thu, 12 Nov · 11:00 · 2 guests"
  const confirmedExtras = requests.filter(
    (r) => r.settlement !== "pending_hotel" && !r.priceOnRequest,
  );
  const pendingExtras = requests.filter(
    (r) => r.settlement === "pending_hotel" || r.priceOnRequest,
  );

  return (
    <div className="space-y-4">
      {/* ── Card 1: Your Stay ─────────────────────────── */}
      <section className="overflow-hidden rounded-2xl border border-[#e5e1d8] bg-white shadow-xs">
        {/* Hotel visual header */}
        <div className="relative h-28 w-full bg-slate-200 overflow-hidden sm:h-36">
          <img
            src={propertyCoverImageUrl || HOTEL_FALLBACK}
            alt={propertyName}
            className="h-full w-full object-cover"
            onError={(e) => {
              const img = e.currentTarget;
              if (img.src !== HOTEL_FALLBACK) img.src = HOTEL_FALLBACK;
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">Your stay</p>
                <h2 className="text-base font-bold text-white leading-snug">{propertyName}</h2>
                <p className="text-xs text-white/80 mt-0.5">{roomName}</p>
              </div>
              <span className="shrink-0 rounded-full bg-white/20 backdrop-blur-md px-2.5 py-1 text-[10px] font-semibold text-white flex items-center gap-1 border border-white/25">
                <Check className="h-3 w-3 stroke-[2.5]" />
                Confirmed
              </span>
            </div>
          </div>
        </div>

        {/* Stay details */}
        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="flex items-start gap-2.5">
              <CalendarDays className="h-4 w-4 shrink-0 text-[#b48a3c] mt-0.5" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Dates</p>
                <p className="text-xs font-semibold text-[#141b2b] leading-snug mt-0.5">{stayLabel.split("·").slice(0, 2).join("→").trim()}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Users className="h-4 w-4 shrink-0 text-[#b48a3c] mt-0.5" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Guests</p>
                <p className="text-xs font-semibold text-[#141b2b] mt-0.5">
                  {stayLabel.split("·").pop()?.trim() ?? ""}
                </p>
              </div>
            </div>
          </div>

          {amenities.length > 0 && (
            <details className="mt-4 border-t border-[#e5e1d8] pt-3">
              <summary className="flex cursor-pointer items-center gap-1.5 py-1 text-xs font-semibold text-[#141b2b] hover:text-[#b48a3c] transition list-none">
                <Info className="h-3.5 w-3.5 text-[#b48a3c]" />
                What's included with your room
              </summary>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {amenities.map((a, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full border border-[#e5e1d8] bg-[#fbf7ee] px-2.5 py-0.5 text-[10px] font-medium text-[#785d1c]"
                  >
                    <Check className="h-2.5 w-2.5 stroke-[2.5] text-[#b48a3c]" />
                    {a}
                  </span>
                ))}
              </div>
            </details>
          )}
        </div>
      </section>

      {/* ── Card 2: Guests & Contact ───────────────────── */}
      <section className="rounded-2xl border border-[#e5e1d8] bg-white p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#fbf7ee] border border-[#e8d9b5]">
              <Users className="h-3.5 w-3.5 text-[#b48a3c]" />
            </div>
            <h2 className="text-sm font-bold text-[#141b2b]">Guests & contact</h2>
          </div>
          {edit("details", "guest details")}
        </div>

        <div className="mt-3 space-y-1.5 pl-9">
          <p className="text-sm font-semibold text-[#141b2b]">{names.join(", ")}</p>
          {contactName && (
            <p className="text-xs text-slate-500">Booking contact: {contactName}</p>
          )}
          <p className="text-xs text-slate-500 break-all">{email}</p>
          <p className="text-xs text-slate-500">{phone}</p>
          {billing && (
            <p className="mt-1 text-xs text-slate-500 rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5">
              🧾 GST Invoice: {billing}
            </p>
          )}
        </div>
      </section>

      {/* ── Card 3: Stay Additions ─────────────────────── */}
      <section className="rounded-2xl border border-[#e5e1d8] bg-white p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#fbf7ee] border border-[#e8d9b5]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#b48a3c]" />
            </div>
            <h2 className="text-sm font-bold text-[#141b2b]">Your stay additions</h2>
          </div>
          {edit("extras", "stay additions")}
        </div>

        {!requests.length ? (
          <div className="mt-3 pl-9 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">No extras added · ₹0 additional charges</p>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {confirmedExtras.length > 0 && (
              <div>
                <p className="mb-2 pl-1 text-[10px] font-bold uppercase tracking-wider text-[#141b2b]">
                  Confirmed with booking
                </p>
                <div className="space-y-2">
                  {confirmedExtras.map((r) => (
                    <ExtraReviewRow key={r.id} r={r} currency={currency} />
                  ))}
                </div>
              </div>
            )}

            {pendingExtras.length > 0 && (
              <div className={confirmedExtras.length > 0 ? "pt-2" : ""}>
                <p className="mb-2 pl-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                  Pending hotel approval
                </p>
                <div className="space-y-2">
                  {pendingExtras.map((r) => (
                    <ExtraReviewRow key={r.id} r={r} currency={currency} pending />
                  ))}
                </div>
                <div className="mt-2.5 flex items-start gap-1.5 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Pending requests are <strong>not charged at checkout</strong>. The hotel will review and confirm them separately.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {notes && (
          <div className="mt-3 border-t border-[#e5e1d8] pt-3 pl-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Note for the hotel</p>
            <p className="whitespace-pre-wrap break-words text-xs text-slate-600 leading-relaxed bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
              {notes}
            </p>
            <p className="mt-1.5 text-[10px] text-slate-400">Subject to availability.</p>
          </div>
        )}
      </section>

      {/* ── Card 4: Policies ──────────────────────────── */}
      <section className="rounded-2xl border border-[#e5e1d8] bg-white p-4 sm:p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-3">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#fbf7ee] border border-[#e8d9b5]">
            <ShieldCheck className="h-3.5 w-3.5 text-[#b48a3c]" />
          </div>
          <h2 className="text-sm font-bold text-[#141b2b]">Before you confirm</h2>
        </div>

        {/* Cancellation — compact pill summary */}
        <div className="rounded-xl border border-[#e5e1d8] bg-[#fbf7ee] p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#785d1c] mb-1">Cancellation policy</p>
          <p className="text-xs text-slate-700 leading-relaxed">{cancellation}</p>
        </div>

        {/* House rules */}
        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">House rules & check-in</p>
          <div className="text-xs text-slate-600 leading-relaxed [&_p]:mb-1 [&_li]:mb-1 [&_ul]:pl-4 [&_ul]:list-disc">
            {rules}
          </div>
        </div>
      </section>
    </div>
  );
}

/** Shared row component for each extra in the review panel */
function ExtraReviewRow({
  r,
  currency,
  pending = false,
}: {
  r: StayRequest;
  currency: string;
  pending?: boolean;
}) {
  const price =
    r.source === "unlisted" || r.priceOnRequest
      ? "Quote pending"
      : r.totalPaise
        ? formatMoney(r.totalPaise, currency)
        : "Free";

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-2.5 transition ${
        pending
          ? "border-[#e8d9b5] bg-[#fbf7ee]/60"
          : "border-[#e5e1d8] bg-white hover:border-slate-300"
      }`}
    >
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
        <img
          src={getOfferingImageUrl(r)}
          alt={r.name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-[#141b2b] leading-snug truncate">
          {r.name}
          {r.variantName ? ` · ${r.variantName}` : ""} × {r.quantity}
        </p>
        {r.inputs?.note && (
          <p className="text-[10px] text-slate-500 truncate">{r.inputs.note}</p>
        )}
        {r.inputs?.serviceAt && (
          <p className="text-[10px] text-slate-500">
            {new Date(r.inputs.serviceAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-bold text-[#141b2b]">{price}</p>
        {pending ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#785d1c] bg-[#fbf7ee] px-2 py-0.5 rounded-full border border-[#e8d9b5]">
            <Clock className="h-2.5 w-2.5" />
            Approval needed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#0b1f3a] bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
            <Check className="h-2.5 w-2.5 stroke-[2.5]" />
            Confirmed
          </span>
        )}
      </div>
    </div>
  );
}
