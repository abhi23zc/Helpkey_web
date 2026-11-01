"use client";
import { ResponseControls } from "./response-controls";
import { resolveResponse, responseLimit, replaceSelection, requiredResponseError } from "@/lib/stay/response";
/* eslint-disable @next/next/no-img-element */
import { includedOffering } from "@/lib/stay/inclusions";
import { GuestInputFields } from "./guest-input-fields";
import { recommendedOfferings } from "@/lib/stay/recommendations";

import { useEffect, useState } from "react";
import {
  BedDouble,
  Plug,
  Coffee,
  Bath,
  Shirt,
  Compass,
  PartyPopper,
  DoorOpen,
  Gift,
  Search,
  Plus,
  Check,
  ChevronDown,
  Clock,
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

const categoryIcons: Record<string, typeof Gift> = {
  comfort: BedDouble,
  bathroom: Bath,
  technology: Plug,
  family: Gift,
  business: Coffee,
  housekeeping: Shirt,
  transport: Gift,
  wellness: Gift,
  experiences: Compass,
  groups: Gift,
  pets: Gift,
  room_essentials: BedDouble,
  devices: Plug,
  food_drinks: Coffee,
  celebrations: PartyPopper,
  room_preferences: DoorOpen,
  other: Gift,
};
const filters: { value: ExtrasFilter; label: string }[] = [
  { value: "all", label: "All options" },
  { value: "free", label: "Free options" },
  { value: "paid", label: "Paid extras" },
  { value: "selected", label: "Selected" },
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
  const [filter, setFilter] = useState<ExtrasFilter>("all");
  const [variantFocus, setVariantFocus] = useState<
    Record<string, string | null>
  >({});
  const [expanded, setExpanded] = useState<string[]>([]);
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
  const filtered = sorted.filter((o) =>
    matchesExtras(o, search, category, filter, selectedIds),
  );
  const shortlist = recommendedOfferings(
    sorted.filter((o) => !unavailableMessage(o)),
    preferences,
  );
  const visible =
    !browse && !search.trim() && category === "all" && filter === "all"
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
    if (quantity > 0 && missing) { setInputError(missing); return; }
    setInputError("");
    onChange(replaceSelection(selections, o, variantId, quantity, inputs));
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-[var(--hk-navy)]">
            {!browse && !search && category === "all" && filter === "all"
              ? "Recommended for your stay"
              : "Browse stay extras"}
          </h3>
          <p className="mt-1 text-xs text-[var(--hk-muted)]">
            Optional touches from your hotel. Choose any, or continue without
            extras.
          </p>
        </div>
        <button
          type="button"
          className="hk-extra-chip"
          onClick={() => {
            setBrowse(!browse);
            setSearch("");
            setCategory("all");
            setFilter("all");
          }}
        >
          {browse ? "Recommendations" : "Browse all"}
        </button>
      </div>
      {selectedIds.size > 0 && (
        <div
          aria-label="Selected extras"
          className="flex flex-wrap gap-2 rounded-xl bg-white p-3"
        >
          {[...selectedIds].map((id) => (
            <button
              type="button"
              key={id}
              disabled={disabled}
              onClick={() =>
                onChange(selections.filter((s) => s.offeringId !== id))
              }
              className="hk-extra-chip"
            >
              {offerings.find((o) => o.id === id)?.name ?? "Selected extra"} ·
              Remove ×
            </button>
          ))}
        </div>
      )}
      {inputError && (
        <p role="alert" className="text-sm text-red-700">
          {inputError}
        </p>
      )}

      {selections.length >= 30 && (
        <p role="status" className="text-xs text-[var(--hk-muted)]">
          You can select up to 30 different choices per booking. Remove a choice
          to add another.
        </p>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-[var(--hk-muted)]" />
        <input
          aria-label="Search stay options"
          placeholder="Search pillows, chargers, celebrations…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (e.target.value) setBrowse(true);
          }}
          className="h-12 w-full rounded-xl border border-[var(--hk-border)] bg-white pl-12 pr-4 text-sm outline-none focus:border-[var(--hk-navy)] focus:ring-2 focus:ring-[var(--hk-navy)]/10"
        />
      </div>
      <label className="flex items-center gap-3 text-xs font-semibold text-[var(--hk-muted)]">
        Category
        <select
          aria-label="Extra categories"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setBrowse(true);
          }}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--hk-border)] bg-white px-3 text-sm text-[var(--hk-navy)]"
        >
          <option value="all">All categories</option>
          {offeringCategories
            .filter((c) => offerings.some((o) => offeringCategory(o) === c))
            .map((c) => (
              <option key={c} value={c}>
                {offeringCategoryLabels[c]}
              </option>
            ))}
        </select>
      </label>
      <div
        className="flex flex-wrap items-center gap-1 border-b border-[var(--hk-border)] pb-3"
        aria-label="Extra price filters"
      >
        {filters.map((f) => (
          <button
            type="button"
            key={f.value}
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`min-h-11 rounded-lg px-3 text-xs font-semibold transition ${filter === f.value ? "bg-[var(--hk-surface-soft)] text-[var(--hk-navy)]" : "text-[var(--hk-muted)] hover:bg-white"}`}
          >
            {f.label}
            {f.value === "selected" && selectedIds.size > 0
              ? ` (${selectedIds.size})`
              : ""}
          </button>
        ))}
        <span role="status" className="ml-auto text-xs text-[var(--hk-muted)]">
          {available.length} available
          {unavailable.length > 0 ? ` · ${unavailable.length} unavailable` : ""}
        </span>
      </div>
      {!visible.length && (
        <div className="rounded-2xl border border-dashed border-[var(--hk-border)] bg-white px-6 py-10 text-center">
          <Gift className="mx-auto mb-3 h-7 w-7 text-[var(--hk-muted)]" />
          <p className="font-semibold text-[var(--hk-navy)]">
            {offerings.length
              ? "No matching options"
              : "Your stay is ready as it is"}
          </p>
          <p className="mt-2 text-sm text-[var(--hk-muted)]">
            {offerings.length
              ? "Try another category or search, or continue to review."
              : "There are no additional options for this stay. Continue whenever you’re ready."}
          </p>
          {offerings.length > 0 && (
            <button
              type="button"
              className="mt-3 min-h-11 text-sm font-semibold underline"
              onClick={() => {
                setSearch("");
                setCategory("all");
                setFilter("all");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      <div
        className="grid items-start gap-3"
        style={{
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
        }}
      >
        {available.map((o) => {
          const count = selections
            .filter((s) => s.offeringId === o.id)
            .reduce((sum, s) => sum + s.quantity, 0);
          const deadline = Date.parse(startAt) - o.advanceNoticeMinutes * 60000;
          const expired = now >= deadline || o.status !== "active";
          const open = expanded.includes(o.id) || count > 0;
          const Icon = categoryIcons[offeringCategory(o)] ?? Gift;
          const needsDetails = Boolean(
            o.variants.length ||
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
          const matchingVariants = variants.filter((v) =>
            matchesExtrasPrice(variantPrice(o, v.id), filter),
          );
          const shownOffering = o.variants.length
            ? {
                ...o,
                variants: o.variants.filter((v) =>
                  matchesExtrasPrice(variantPrice(o, v.id), filter),
                ),
              }
            : o;
          return (
            <article
              id={`extra-${o.id}`}
              key={o.id}
              className={`scroll-mt-28 rounded-2xl border bg-white p-4 transition sm:p-5 ${count ? "border-[var(--hk-navy)]/30 shadow-sm" : "border-[var(--hk-border)]"}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${count ? "bg-[var(--hk-navy)] text-white" : "bg-[var(--hk-surface-soft)] text-[var(--hk-navy)]"}`}
                >
                  {o.imageId ? (
                    <img
                      src={`/api/stay-images/${encodeURIComponent(o.propertyId)}/${o.imageId}`}
                      alt="Illustrative image; actual item may vary"
                      className="h-10 w-10 rounded-xl object-cover"
                    />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold leading-5 text-[var(--hk-navy)]">
                    {o.name}
                  </h3>
                  <p className="mt-1 text-xs font-semibold text-[var(--hk-navy)]">
                    {o.formType === "custom"
                      ? "Price after hotel review"
                      : offeringPriceLabel(shownOffering, currency)}
                    <span className="font-normal text-[var(--hk-muted)]">
                      {o.formType === "custom"
                        ? " · Request only"
                        : matchingVariants.some(
                              (v) => variantPrice(o, v.id) > 0,
                            )
                          ? ` · ${pricingUnitLabel(o.pricingUnit)}`
                          : " · No extra charge"}
                    </span>
                  </p>
                </div>
                {count > 0 && (
                  <span
                    aria-label={`${count} selected`}
                    className="flex items-center gap-1 text-xs font-semibold text-[var(--hk-navy)]"
                  >
                    <Check className="h-4 w-4" />
                    {count}
                  </span>
                )}
              </div>
              {o.imageId && (
                <p className="mt-2 text-[10px] text-[var(--hk-muted)]">
                  Illustrative image · Actual item may vary
                </p>
              )}
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--hk-muted)]">
                {o.description}
              </p>
              {o.confirmation === "approval" && (
                <p className="mt-2 text-xs text-[var(--hk-muted)]">
                  Hotel approval required · Not charged at checkout
                </p>
              )}
              {expired && (
                <p
                  role="status"
                  className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-800"
                >
                  <Clock className="h-3.5 w-3.5" />
                  Request deadline passed
                </p>
              )}
              {!open && (
                <button
                  type="button"
                  disabled={disabled || expired || selections.length >= 30}
                  onClick={() => {
                    if (needsDetails) setExpanded((old) => [...old, o.id]);
                    else change(o, null, 1);
                  }}
                  className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--hk-border)] text-sm font-semibold text-[var(--hk-navy)] transition hover:border-[var(--hk-navy)] hover:bg-[var(--hk-surface-soft)] disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {needsDetails
                    ? "Choose options"
                    : o.confirmation === "approval"
                      ? "Request"
                      : "Add"}
                </button>
              )}
              {open && (
                <div className="mt-4 space-y-3 border-t border-[var(--hk-border)] pt-4">
                  <p className="text-xs text-[var(--hk-muted)]">
                    {!resolveResponse(o).quantityEnabled && resolveResponse(o).responseType !== "multiple"
                      ? "One request per booking"
                      : `Maximum ${o.maxQuantity} per booking`}
                    {o.variants.length ? " · Shared across choices" : ""}
                  </p>
                  {matchingVariants.map((v) => {
                    const hasGuestInputs = Boolean(
                      o.noteLabel ||
                        o.noteRequired ||
                        o.peopleRequired ||
                        o.timeRequired ||
                        o.formType === "scheduled" ||
                        resolveResponse(o).responseType === "text" ||
                        o.formType === "custom" ||
                        o.pricingUnit === "person" ||
                        o.pricingUnit === "hour" ||
                        o.choiceGroups?.length,
                    );
                    const quantity =
                      selections.find(
                        (s) => s.offeringId === o.id && s.variantId === v.id,
                      )?.quantity ?? 0;
                    const showInputs =
                      quantity > 0 ||
                      (Object.hasOwn(variantFocus, o.id)
                        ? variantFocus[o.id]
                        : matchingVariants[0]?.id) === v.id;
                    return (
                      <div
                        key={v.id ?? "quantity"}
                        className="space-y-3 rounded-xl border border-[var(--hk-border)] p-3"
                      >
                        {showInputs && (
                          <GuestInputFields
                            offering={o}
                            timezone={timezone}
                            disabled={disabled}
                            value={
                              inputDrafts[JSON.stringify([o.id, v.id])] ??
                              selections.find(
                                (s) =>
                                  s.offeringId === o.id && s.variantId === v.id,
                              )?.inputs
                            }
                            onChange={(inputs) => {
                              setInputDrafts((old) => ({
                                ...old,
                                [JSON.stringify([o.id, v.id])]: inputs,
                              }));
                              if (quantity)
                                onChange(
                                  selections.map((s) =>
                                    s.offeringId === o.id &&
                                    s.variantId === v.id
                                      ? { ...s, inputs }
                                      : s,
                                  ),
                                );
                            }}
                          />
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm">
                            <p className="font-medium text-[var(--hk-navy)]">
                              {!o.variants.length
                                ? "Request this"
                                : v.name}
                            </p>
                            {"inclusions" in v && v.inclusions && (
                              <p className="mt-1 text-xs text-[var(--hk-muted)]">
                                {v.inclusions}
                              </p>
                            )}
                            <p className="text-xs text-[var(--hk-muted)]">
                              {priceText(variantPrice(o, v.id), currency)}
                            </p>
                          </div>
                          {hasGuestInputs && !showInputs ? (
                            <button
                              type="button"
                              disabled={disabled || (resolveResponse(o).responseType !== "single" && count >= responseLimit(o))}
                              onClick={() =>
                                setVariantFocus((old) => ({
                                  ...old,
                                  [o.id]: v.id,
                                }))
                              }
                              className="hk-extra-chip"
                            >
                              Choose {v.name}
                            </button>
                          ) : <ResponseControls offering={o} optionName={v.name} quantity={quantity} count={count} disabled={disabled} blockIncrease={expired || (selections.length >= 30 && quantity === 0 && !(resolveResponse(o).responseType === "single" && count > 0))} onChange={n => change(o, v.id, n)} />}

                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <details className="mt-3 text-xs text-[var(--hk-muted)]">
                <summary className="flex min-h-8 cursor-pointer items-center gap-1 font-medium">
                  Details <ChevronDown className="h-3 w-3" />
                </summary>
                <div className="mt-2 space-y-2 leading-5">
                  <p>{o.description}</p>
                  <p>
                    Choose before{" "}
                    {new Date(deadline).toLocaleString("en-IN", {
                      timeZone: timezone,
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    ({timezone}).
                  </p>
                  <p>
                    {o.confirmation === "approval"
                      ? "The hotel will confirm whether it can fulfil your request."
                      : "Confirmed with your booking."}{" "}
                    Maximum {o.maxQuantity} per booking.
                  </p>
                </div>
              </details>
            </article>
          );
        })}
      </div>
      {unavailable.length > 0 && (
        <details
          key={`${search.trim() ? "search" : "browse"}-${category}-${filter}`}
          open={Boolean(search.trim())}
          className="rounded-2xl border border-[var(--hk-border)] bg-white"
        >
          <summary className="min-h-12 cursor-pointer px-5 py-4 text-sm font-semibold text-[var(--hk-muted)]">
            Unavailable for this stay ({unavailable.length})
          </summary>
          <div className="divide-y divide-[var(--hk-border)] border-t border-[var(--hk-border)] px-5">
            {unavailable.map((o) => {
              const reason = unavailableMessage(o);
              const visibleVariants = o.variants.filter((v) =>
                matchesExtrasPrice(variantPrice(o, v.id), filter),
              );
              return (
                <article key={o.id} className="py-4" aria-label={o.name}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-[var(--hk-navy)]">
                        {o.name}
                      </h3>
                      <p className="mt-1 text-xs text-[var(--hk-muted)]">
                        {offeringPriceLabel(
                          o.variants.length
                            ? { ...o, variants: visibleVariants }
                            : o,
                          currency,
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled
                      className="min-h-11 shrink-0 rounded-lg bg-[var(--hk-surface-soft)] px-3 text-xs font-medium text-[var(--hk-muted)]"
                    >
                      Unavailable
                    </button>
                  </div>
                  <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-[var(--hk-muted)]">
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {reason}
                  </p>
                  <details className="mt-2 text-xs text-[var(--hk-muted)]">
                    <summary className="min-h-8 cursor-pointer py-2 font-medium">
                      Details
                    </summary>
                    <p className="mt-1 leading-5">{o.description}</p>
                    {visibleVariants.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {visibleVariants.map((v) => (
                          <li key={v.id}>
                            {v.name} ·{" "}
                            {priceText(variantPrice(o, v.id), currency)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                  {selections.some(
                    (selection) => selection.offeringId === o.id,
                  ) && (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        onChange(
                          selections.filter(
                            (selection) => selection.offeringId !== o.id,
                          ),
                        )
                      }
                      className="mt-2 min-h-11 text-xs font-semibold underline"
                    >
                      Remove selected {o.name}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
