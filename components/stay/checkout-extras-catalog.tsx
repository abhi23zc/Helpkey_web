"use client";

import { ResponseControls } from "./response-controls";
import {
  resolveResponse,
  responseLimit,
  replaceSelection,
  requiredResponseError,
} from "@/lib/stay/response";
import { includedOffering } from "@/lib/stay/inclusions";
import { GuestInputFields } from "./guest-input-fields";
import { recommendedOfferings } from "@/lib/stay/recommendations";
import { getOfferingImageUrl } from "@/lib/stay/imagery";

import { useEffect, useState } from "react";
import {
  BedDouble,
  Search,
  Check,
  ChevronDown,
  Clock,
  Info,
  UtensilsCrossed,
  Cake,
  Heart,
  MessageSquare,
  Gift,
  X,
  Trash2,
  SlidersHorizontal,
} from "lucide-react";
import {
  offeringCategories,
  offeringCategory,
  offeringCategoryLabels,
  type Offering,
  type Selection,
  type TravelerCategory,
} from "@/lib/stay/contracts";
import {
  matchesExtras,
  unavailableExtraMessage,
  matchesExtrasPrice,
  type ExtrasFilter,
} from "@/lib/stay/browsing";
import {
  offeringPriceLabel,
  variantPrice,
  pricingUnitLabel,
} from "@/lib/stay/pricing";
import { formatMoney } from "@/lib/customer/offer";

const mainCategoryTabs = [
  { id: "all", label: "All extras", icon: null },
  { id: "comfort", label: "Comfort", icon: BedDouble },
  { id: "food_drinks", label: "Food", icon: UtensilsCrossed },
  { id: "celebrations", label: "Celebrations", icon: Cake },
  { id: "room_preferences", label: "Romance", icon: Heart },
];

const priceFilters: { value: ExtrasFilter | "quote"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "free", label: "Free" },
  { value: "paid", label: "Paid" },
  { value: "quote", label: "Hotel quote" },
];

const priceText = (price: number, currency: string) =>
  price === 0 ? "Free" : formatMoney(price, currency);

export function CheckoutExtrasCatalog({
  offerings,
  selections,
  onChange,
  preferences,
  startAt,
  timezone,
  currency,
  disabled,
  roomTypeId,
  bookingMode,
  includedCodes = [],
}: {
  includedCodes?: string[];
  offerings: Offering[];
  selections: Selection[];
  onChange: (value: Selection[]) => void;
  preferences: TravelerCategory[];
  onPreferences: (value: TravelerCategory[]) => void;
  startAt: string;
  timezone: string;
  currency: string;
  disabled: boolean;
  roomTypeId: string;
  bookingMode: string;
}) {
  const [browse, setBrowse] = useState(false);
  const [inputDrafts, setInputDrafts] = useState<
    Record<string, Selection["inputs"]>
  >({});
  const [inputError, setInputError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [priceFilter, setPriceFilter] = useState<ExtrasFilter | "quote">("all");
  const [showMoreCategories, setShowMoreCategories] = useState(false);
  const [selectedModalOffering, setSelectedModalOffering] = useState<Offering | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const selectedIds = new Set(selections.map((s) => s.offeringId));
  const sorted = offerings
    .filter((o) => o.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name));

  const unavailableMessage = (o: Offering) =>
    includedOffering(o, includedCodes)
      ? "Already included in your room or rate · No need to add again."
      : o.pricingUnit === "night" && bookingMode === "hourly"
        ? "Available for overnight stays only (priced per night)."
        : unavailableExtraMessage(
            o,
            roomTypeId,
            bookingMode,
            startAt,
            timezone,
            now,
          );

  const effectiveFilter: ExtrasFilter =
    priceFilter === "quote" ? "all" : priceFilter;

  const filtered = sorted.filter((o) => {
    if (priceFilter === "quote") {
      const isQuote =
        o.formType === "custom" || o.confirmation === "approval";
      if (!isQuote) return false;
    }
    return matchesExtras(o, search, category, effectiveFilter, selectedIds);
  });

  const shortlist = recommendedOfferings(
    sorted.filter((o) => !unavailableMessage(o)),
    preferences,
  );

  const visible =
    !browse && !search.trim() && category === "all" && priceFilter === "all"
      ? shortlist
      : filtered;

  const available = visible.filter((o) => !unavailableMessage(o));
  const unavailable = visible.filter((o) => unavailableMessage(o));

  function change(o: Offering, variantId: string | null, quantity: number) {
    const key = JSON.stringify([o.id, variantId]);
    const inputs =
      inputDrafts[key] ??
      selections.find((s) => s.offeringId === o.id && s.variantId === variantId)
        ?.inputs ??
      {};
    const missing = requiredResponseError(o, inputs);
    if (quantity > 0 && missing) {
      setInputError(missing);
      return;
    }
    setInputError("");
    onChange(replaceSelection(selections, o, variantId, quantity, inputs));
  }

  return (
    <div className="space-y-4">
      {/* 1. Header with View Mode Toggle */}
      <div className="flex items-center justify-between gap-3 pt-0.5">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#141b2b]">
            {!browse && !search && category === "all" && priceFilter === "all"
              ? "Recommended for your stay"
              : "Browse all stay extras"}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Thoughtful touches from your hotel. Add anything you like, or continue.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setBrowse(!browse);
            setSearch("");
            setCategory("all");
            setPriceFilter("all");
          }}
          className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-[#b48a3c] hover:underline transition shrink-0"
        >
          {browse ? "← View recommendations" : "Browse all →"}
        </button>
      </div>

      {inputError && (
        <p role="alert" className="text-xs sm:text-sm font-medium text-rose-700">
          {inputError}
        </p>
      )}

      {/* 2. Full-Width Search Input */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-slate-400" />
        <input
          aria-label="Search stay options"
          placeholder="Search extras (e.g. cake, room setup, snacks)"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (e.target.value) setBrowse(true);
          }}
          className="h-10 sm:h-11 w-full rounded-xl border border-[#e5e1d8] bg-white pl-11 pr-4 text-xs sm:text-sm text-[#141b2b] placeholder:text-slate-400 outline-none transition focus:border-[#0b1f3a] focus:ring-2 focus:ring-[#0b1f3a]/10"
        />
      </div>

      {/* 3. Category Tabs + Price Filter Segment */}
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between border-b border-[#e5e1d8] pb-3">
        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {mainCategoryTabs.map(({ id, label, icon: Icon }) => {
            const isActive = category === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setCategory(id);
                  setBrowse(true);
                }}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-[#0b1f3a] text-white shadow-2xs border border-[#0b1f3a]"
                    : "bg-white border border-[#e5e1d8] text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {Icon && <Icon className="h-3 w-3" />}
                <span>{label}</span>
              </button>
            );
          })}

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMoreCategories(!showMoreCategories)}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold border transition-all ${
                !mainCategoryTabs.some((t) => t.id === category) && category !== "all"
                  ? "bg-[#0b1f3a] text-white border-[#0b1f3a]"
                  : "bg-white border-[#e5e1d8] text-slate-700 hover:border-slate-300"
              }`}
            >
              <span>
                {!mainCategoryTabs.some((t) => t.id === category) && category !== "all"
                  ? offeringCategoryLabels[category] ?? "More"
                  : "More"}
              </span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>

            {showMoreCategories && (
              <div className="absolute left-0 top-full z-30 mt-1.5 w-56 rounded-2xl border border-[#e5e1d8] bg-white p-2 shadow-xl">
                {offeringCategories
                  .filter((c) => !mainCategoryTabs.some((t) => t.id === c))
                  .map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCategory(c);
                        setBrowse(true);
                        setShowMoreCategories(false);
                      }}
                      className="w-full text-left rounded-xl px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                    >
                      {offeringCategoryLabels[c] ?? c}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Price / Quote Segments */}
        <div className="flex items-center rounded-xl border border-[#e5e1d8] bg-[#fbf7ee] p-0.5 self-start lg:self-auto">
          {priceFilters.map((f) => {
            const isSelected = priceFilter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setPriceFilter(f.value)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  isSelected
                    ? "bg-white text-[#141b2b] shadow-2xs font-bold"
                    : "text-slate-600 hover:text-[#141b2b]"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Zero-State */}
      {!visible.length && (
        <div className="rounded-2xl border border-dashed border-[#e5e1d8] bg-white px-6 py-12 text-center">
          <Gift className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <p className="font-bold text-[#141b2b]">
            {offerings.length
              ? "No matching options"
              : "Your stay is ready as it is"}
          </p>
          <p className="mt-2 text-xs sm:text-sm text-slate-500">
            {offerings.length
              ? "Try another category or search, or continue to review."
              : "There are no additional options for this stay. Continue whenever you’re ready."}
          </p>
          {offerings.length > 0 && (
            <button
              type="button"
              className="mt-3 text-xs font-semibold text-[#b48a3c] underline"
              onClick={() => {
                setSearch("");
                setCategory("all");
                setPriceFilter("all");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* 5. 3-Column Responsive Product Cards Grid (Uniform Fixed Proportions) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {available.map((o) => {
          const count = selections
            .filter((s) => s.offeringId === o.id)
            .reduce((sum, s) => sum + s.quantity, 0);
          const deadline = Date.parse(startAt) - o.advanceNoticeMinutes * 60000;
          const expired = now >= deadline || o.status !== "active";

          const needsDetails = Boolean(
            o.variants.length > 1 ||
              o.formType === "scheduled" ||
              resolveResponse(o).responseType === "text" ||
              o.formType === "custom" ||
              o.noteLabel ||
              o.choiceGroups?.length ||
              o.pricingUnit === "person" ||
              o.pricingUnit === "hour",
          );

          const variants = o.variants.length
            ? o.variants
            : [{ id: null, name: "Quantity" }];

          const lowestPrice = Math.min(...variants.map((v) => variantPrice(o, v.id)));
          const isComplimentary = lowestPrice === 0 && o.variants.length <= 1;

          let displayPrice = "";
          let priceUnitSuffix = "";

          if (o.formType === "custom") {
            displayPrice = "Price on request";
          } else if (isComplimentary) {
            displayPrice = "Complimentary";
          } else if (o.variants.length > 1) {
            displayPrice = `From ${priceText(lowestPrice, currency)}`;
            priceUnitSuffix = pricingUnitLabel(o.pricingUnit);
          } else {
            displayPrice = priceText(o.unitPricePaise, currency);
            priceUnitSuffix = pricingUnitLabel(o.pricingUnit);
          }

          return (
            <article
              id={`extra-${o.id}`}
              key={o.id}
              className={`group flex flex-col justify-between overflow-hidden rounded-2xl border bg-white transition-all duration-200 h-full ${
                count
                  ? "border-[#b48a3c] ring-1 ring-[#b48a3c]/30 shadow-md"
                  : "border-[#e5e1d8] hover:border-slate-300 hover:shadow-xs"
              }`}
            >
              {/* Product Cover Photography (Proportional 4:3) */}
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100 shrink-0">
                <img
                  src={getOfferingImageUrl(o)}
                  alt={o.name}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                {count > 0 && (
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-full bg-[#0b1f3a] px-2.5 py-0.5 text-xs font-bold text-white shadow-md">
                    <Check className="h-3 w-3 stroke-[2.5]" />
                    <span>{count}</span>
                  </div>
                )}
              </div>

              {/* Card Body (Uniform Spacing & Fixed Alignment) */}
              <div className="flex flex-1 flex-col justify-between p-3.5 sm:p-4">
                <div>
                  <h3
                    className="text-sm font-bold text-[#141b2b] leading-tight truncate"
                    title={o.name}
                  >
                    {o.name}
                  </h3>

                  <div className="mt-1 flex items-baseline gap-1">
                    <span
                      className={`text-xs sm:text-sm font-extrabold ${
                        isComplimentary ? "text-[#785d1c]" : "text-[#141b2b]"
                      }`}
                    >
                      {displayPrice}
                    </span>
                    {priceUnitSuffix && !isComplimentary && (
                      <span className="text-[11px] text-slate-500 font-normal">
                        / {priceUnitSuffix}
                      </span>
                    )}
                  </div>

                  <p className="mt-1.5 text-xs text-slate-500 line-clamp-2 leading-relaxed h-8">
                    {o.description}
                  </p>

                  {/* Trust / Confirmation Badge (Fixed Height) */}
                  <div className="mt-2.5 h-5 flex items-center">
                    {count > 0 && o.confirmation === "approval" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                        <Clock className="h-2.5 w-2.5 text-amber-600 shrink-0" />
                        Awaiting hotel confirmation
                      </span>
                    ) : o.confirmation === "approval" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        <Info className="h-2.5 w-2.5 text-slate-500 shrink-0" />
                        Hotel approval required
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                        <Check className="h-2.5 w-2.5 text-emerald-600 shrink-0" />
                        Instant confirmation
                      </span>
                    )}
                  </div>

                  {expired && (
                    <p
                      role="status"
                      className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-800"
                    >
                      <Clock className="h-3 w-3" />
                      Request deadline passed
                    </p>
                  )}
                </div>

                {/* Card Action Button (Fixed h-10 Container) */}
                <div className="mt-3.5 pt-1 h-10">
                  {needsDetails ? (
                    count > 0 ? (
                      <button
                        type="button"
                        onClick={() => setSelectedModalOffering(o)}
                        className={`w-full h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                          o.confirmation === "approval"
                            ? "border border-[#d4af37] bg-[#fbf6ee] text-[#785d1c] hover:bg-[#f5ebd8]"
                            : "border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                        <span>
                          {o.confirmation === "approval" ? "Requested" : "Added"} ({count}) · Edit
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={disabled || expired || selections.length >= 30}
                        onClick={() => setSelectedModalOffering(o)}
                        className="w-full h-10 rounded-xl bg-[#0b1f3a] text-white text-xs font-semibold hover:bg-[#14294d] active:scale-[0.99] transition flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        <span>Choose options</span>
                      </button>
                    )
                  ) : count === 0 ? (
                    <button
                      type="button"
                      disabled={disabled || expired || selections.length >= 30}
                      onClick={() => change(o, null, 1)}
                      className="w-full h-10 rounded-xl bg-[#0b1f3a] text-white text-xs font-semibold hover:bg-[#14294d] active:scale-[0.99] transition flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50"
                    >
                      {o.confirmation === "approval" ? "Request" : "Add"}
                    </button>
                  ) : o.maxQuantity === 1 || resolveResponse(o).responseType === "single" ? (
                    <div className="flex items-center gap-1.5 h-10">
                      <div
                        className={`flex-1 h-full rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${
                          o.confirmation === "approval"
                            ? "border border-[#d4af37] bg-[#fbf6ee] text-[#785d1c]"
                            : "border border-emerald-300 bg-emerald-50 text-emerald-800"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                        <span>{o.confirmation === "approval" ? "Requested" : "Added"}</span>
                      </div>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => change(o, null, 0)}
                        aria-label={`Remove ${o.name}`}
                        className="h-full px-2.5 rounded-xl border border-[#e5e1d8] bg-white text-slate-400 hover:text-rose-600 hover:border-rose-200 transition flex items-center justify-center text-xs"
                        title="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`w-full h-10 rounded-xl flex items-center justify-between px-2 text-xs font-semibold ${
                        o.confirmation === "approval"
                          ? "border border-[#d4af37] bg-[#fbf6ee] text-[#785d1c]"
                          : "border border-emerald-300 bg-emerald-50 text-emerald-800"
                      }`}
                    >
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => change(o, null, count - 1)}
                        aria-label={`Decrease ${o.name}`}
                        className="h-7 w-7 rounded-lg bg-white/80 hover:bg-white text-slate-700 flex items-center justify-center font-bold text-sm shadow-2xs transition active:scale-95"
                      >
                        –
                      </button>
                      <span className="text-xs font-bold">
                        {o.confirmation === "approval" ? "Requested" : "Added"}: {count}
                        {o.maxQuantity ? ` / ${o.maxQuantity}` : ""}
                      </span>
                      <button
                        type="button"
                        disabled={
                          disabled ||
                          (o.maxQuantity ? count >= o.maxQuantity : false) ||
                          selections.length >= 30
                        }
                        onClick={() => change(o, null, count + 1)}
                        aria-label={`Increase ${o.name}`}
                        className="h-7 w-7 rounded-lg bg-white/80 hover:bg-white text-slate-700 flex items-center justify-center font-bold text-sm shadow-2xs transition active:scale-95 disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* 6. Offering Options Modal Dialog (Replaces inline expansion) */}
      {selectedModalOffering && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-offering-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedModalOffering(null);
          }}
        >
          <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden rounded-3xl bg-white shadow-2xl border border-[#e5e1d8] animate-in zoom-in-95 duration-200">
            {/* Modal Image Header */}
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-100 shrink-0">
              <img
                src={getOfferingImageUrl(selectedModalOffering)}
                alt={selectedModalOffering.name}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
              <button
                type="button"
                onClick={() => setSelectedModalOffering(null)}
                aria-label="Close modal"
                className="absolute top-3.5 right-3.5 h-8 w-8 rounded-full bg-white/90 hover:bg-white text-slate-700 flex items-center justify-center shadow-md transition"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="absolute bottom-3.5 left-4 right-4 text-white">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white/20 backdrop-blur-md px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                    {offeringCategoryLabels[selectedModalOffering.category ?? "other"] ?? "Extra"}
                  </span>
                  {selectedModalOffering.confirmation === "approval" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/80 backdrop-blur-md px-2 py-0.5 text-[10px] font-medium text-white">
                      <Clock className="h-2.5 w-2.5" />
                      Hotel approval required
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/80 backdrop-blur-md px-2 py-0.5 text-[10px] font-medium text-white">
                      <Check className="h-2.5 w-2.5" />
                      Instant confirmation
                    </span>
                  )}
                </div>
                <h2 id="modal-offering-title" className="mt-1 text-lg font-bold leading-tight">
                  {selectedModalOffering.name}
                </h2>
              </div>
            </div>

            {/* Modal Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {selectedModalOffering.description}
              </p>

              <div className="rounded-xl border border-[#e5e1d8] bg-[#fbf7ee] p-3 text-xs text-[#785d1c] flex items-start gap-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#b48a3c]" />
                <div>
                  <p className="font-semibold">
                    {selectedModalOffering.confirmation === "approval"
                      ? "Request without upfront charge"
                      : "Instant confirmation"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#785d1c]/80">
                    {selectedModalOffering.confirmation === "approval"
                      ? "The hotel will review your request. It will only be added to your bill once confirmed."
                      : "This item will be confirmed immediately with your reservation."}
                  </p>
                </div>
              </div>

              {/* Variants / Choices */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>
                    {selectedModalOffering.variants.length > 1
                      ? "Choose option & quantity:"
                      : "Configure your request:"}
                  </span>
                  <span className="text-[11px] text-slate-500 font-normal">
                    {!resolveResponse(selectedModalOffering).quantityEnabled &&
                    resolveResponse(selectedModalOffering).responseType !== "multiple"
                      ? "1 per booking"
                      : `Max ${selectedModalOffering.maxQuantity} per stay`}
                  </span>
                </div>

                {(selectedModalOffering.variants.length
                  ? selectedModalOffering.variants
                  : [{ id: null, name: selectedModalOffering.name }]
                ).map((v) => {
                  const quantity =
                    selections.find(
                      (s) =>
                        s.offeringId === selectedModalOffering.id &&
                        s.variantId === v.id,
                    )?.quantity ?? 0;
                  const totalOfferingCount = selections
                    .filter((s) => s.offeringId === selectedModalOffering.id)
                    .reduce((sum, s) => sum + s.quantity, 0);
                  const price = variantPrice(selectedModalOffering, v.id);

                  return (
                    <div
                      key={v.id ?? "default"}
                      className={`rounded-2xl border p-3.5 transition-all ${
                        quantity > 0
                          ? "border-[#b48a3c] bg-[#fbf6ee]/40 ring-1 ring-[#b48a3c]/30"
                          : "border-[#e5e1d8] bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-xs sm:text-sm font-bold text-[#141b2b]">
                            {v.name}
                          </h4>
                          <p className="text-xs font-semibold text-[#b48a3c]">
                            {priceText(price, currency)}
                            {pricingUnitLabel(selectedModalOffering.pricingUnit) &&
                              price > 0 && (
                                <span className="text-[10px] text-slate-500 font-normal">
                                  {" "}
                                  / {pricingUnitLabel(selectedModalOffering.pricingUnit)}
                                </span>
                              )}
                          </p>
                        </div>

                        <ResponseControls
                          offering={selectedModalOffering}
                          optionName={v.name}
                          quantity={quantity}
                          count={totalOfferingCount}
                          disabled={disabled}
                          blockIncrease={
                            disabled ||
                            (selections.length >= 30 && quantity === 0)
                          }
                          onChange={(n) => change(selectedModalOffering, v.id, n)}
                        />
                      </div>

                      {/* Guest Inputs if this variant is active */}
                      {(quantity > 0 ||
                        selectedModalOffering.variants.length <= 1) && (
                        <div className="mt-3 pt-3 border-t border-[#e5e1d8]">
                          <GuestInputFields
                            offering={selectedModalOffering}
                            timezone={timezone}
                            disabled={disabled}
                            value={
                              inputDrafts[
                                JSON.stringify([selectedModalOffering.id, v.id])
                              ] ??
                              selections.find(
                                (s) =>
                                  s.offeringId === selectedModalOffering.id &&
                                  s.variantId === v.id,
                              )?.inputs
                            }
                            onChange={(inputs) => {
                              setInputDrafts((old) => ({
                                ...old,
                                [JSON.stringify([
                                  selectedModalOffering.id,
                                  v.id,
                                ])]: inputs,
                              }));
                              if (quantity) {
                                onChange(
                                  selections.map((s) =>
                                    s.offeringId === selectedModalOffering.id &&
                                    s.variantId === v.id
                                      ? { ...s, inputs }
                                      : s,
                                  ),
                                );
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Sticky Footer */}
            <div className="border-t border-[#e5e1d8] bg-slate-50 p-4 flex items-center justify-between gap-3 shrink-0">
              <div>
                {selections.some((s) => s.offeringId === selectedModalOffering.id) ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onChange(
                        selections.filter(
                          (s) => s.offeringId !== selectedModalOffering.id,
                        ),
                      );
                      setSelectedModalOffering(null);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove from stay</span>
                  </button>
                ) : (
                  <span className="text-xs text-slate-500">
                    All extras are optional
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedModalOffering(null)}
                className="rounded-xl bg-[#0b1f3a] px-5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-[#14294d] active:scale-[0.99] transition"
              >
                {selections.some((s) => s.offeringId === selectedModalOffering.id)
                  ? "Save changes"
                  : "Done"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Footer Prompt: Something else in mind? */}
      <div className="pt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            const el = document.getElementById("special-requests-section");
            if (el) {
              el.scrollIntoView({ behavior: "smooth" });
              const details = el.closest("details");
              if (details) details.open = true;
            }
          }}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#b48a3c] hover:underline transition"
        >
          <MessageSquare className="h-4 w-4" />
          <span>
            Something else in mind?{" "}
            <span className="underline">Send a request →</span>
          </span>
        </button>
      </div>

      {/* 7. Unavailable Items Collapsible */}
      {unavailable.length > 0 && (
        <details
          key={`${search.trim() ? "search" : "browse"}-${category}-${priceFilter}`}
          open={Boolean(search.trim())}
          className="rounded-2xl border border-[#e5e1d8] bg-white"
        >
          <summary className="min-h-11 cursor-pointer px-5 py-3 text-xs font-semibold text-slate-500">
            Unavailable for this stay ({unavailable.length})
          </summary>
          <div className="divide-y divide-[#e5e1d8] border-t border-[#e5e1d8] px-5">
            {unavailable.map((o) => {
              const reason = unavailableMessage(o);
              const visibleVariants = o.variants.filter((v) =>
                matchesExtrasPrice(variantPrice(o, v.id), effectiveFilter),
              );
              return (
                <article key={o.id} className="py-3" aria-label={o.name}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-xs sm:text-sm font-semibold text-[#141b2b]">
                        {o.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {offeringPriceLabel(
                          o.variants.length
                            ? { ...o, variants: visibleVariants }
                            : o,
                          currency,
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-400">
                      Unavailable
                    </span>
                  </div>
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500">
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{reason}</span>
                  </p>
                </article>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
