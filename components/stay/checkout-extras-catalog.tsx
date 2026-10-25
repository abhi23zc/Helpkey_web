"use client";

import { useEffect, useState } from "react";
import {
  BedDouble,
  Plug,
  Coffee,
  Sparkles,
  DoorOpen,
  Gift,
  Search,
  Plus,
  Minus,
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
import { offeringPriceLabel, variantPrice } from "@/lib/stay/pricing";
import { formatMoney } from "@/lib/customer/offer";
import { TravelerChips } from "./personalization-picker";

const categoryIcons = {
  room_essentials: BedDouble,
  devices: Plug,
  food_drinks: Coffee,
  celebrations: Sparkles,
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
  onPreferences,
  startAt,
  timezone,
  currency,
  disabled,
  roomTypeId,
  bookingMode,
}: {
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
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [filter, setFilter] = useState<ExtrasFilter>("all");
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
    unavailableExtraMessage(o, roomTypeId, bookingMode, startAt, timezone, now);
  const visible = sorted.filter((o) =>
    matchesExtras(o, search, category, filter, selectedIds),
  );
  const available = visible.filter((o) => !unavailableMessage(o));
  const unavailable = visible.filter((o) => unavailableMessage(o));
  const suggestions = sorted
    .filter(
      (o) =>
        !unavailableMessage(o) &&
        o.travelerCategories.some((t) => preferences.includes(t)),
    )
    .slice(0, 4);
  function change(o: Offering, variantId: string | null, quantity: number) {
    const rest = selections.filter(
      (s) => !(s.offeringId === o.id && s.variantId === variantId),
    );
    onChange(
      quantity > 0
        ? [...rest, { offeringId: o.id, variantId, quantity }]
        : rest,
    );
  }
  return (
    <div className="space-y-5">
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
          onChange={(e) => setSearch(e.target.value)}
          className="h-12 w-full rounded-xl border border-[var(--hk-border)] bg-white pl-12 pr-4 text-sm outline-none focus:border-[var(--hk-navy)] focus:ring-2 focus:ring-[var(--hk-navy)]/10"
        />
      </div>
      <div
        aria-label="Extra categories"
        className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible"
      >
        <button
          type="button"
          aria-pressed={category === "all"}
          onClick={() => setCategory("all")}
          className={`hk-extra-chip ${category === "all" ? "hk-extra-chip-active" : ""}`}
        >
          All categories
        </button>
        {offeringCategories
          .filter((c) => offerings.some((o) => offeringCategory(o) === c))
          .map((c) => {
            const Icon = categoryIcons[c];
            return (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
                className={`hk-extra-chip ${category === c ? "hk-extra-chip-active" : ""}`}
              >
                <Icon className="h-4 w-4" />
                {offeringCategoryLabels[c]}
              </button>
            );
          })}
      </div>
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
      <details className="rounded-xl border border-[var(--hk-border)] bg-white px-4 py-3">
        <summary className="min-h-6 cursor-pointer text-sm font-semibold text-[var(--hk-navy)]">
          Suggestions for your trip{" "}
          <span className="font-normal text-[var(--hk-muted)]">· Optional</span>
        </summary>
        <div className="mt-4">
          <TravelerChips
            value={preferences}
            onChange={onPreferences}
            disabled={disabled}
          />
        </div>
        {suggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((o) => (
              <button
                type="button"
                key={o.id}
                className="hk-extra-chip"
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                  setFilter("all");
                  setExpanded((old) => [...old, o.id]);
                  requestAnimationFrame(() =>
                    document.getElementById(`extra-${o.id}`)?.scrollIntoView({
                      block: "center",
                      behavior: window.matchMedia(
                        "(prefers-reduced-motion: reduce)",
                      ).matches
                        ? "instant"
                        : "smooth",
                    }),
                  );
                }}
              >
                <Sparkles className="h-3.5 w-3.5 text-[var(--hk-gold)]" />
                {o.name}
              </button>
            ))}
          </div>
        )}
      </details>
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
          const Icon = categoryIcons[offeringCategory(o)];
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
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold leading-5 text-[var(--hk-navy)]">
                    {o.name}
                  </h3>
                  <p className="mt-1 text-xs font-semibold text-[var(--hk-navy)]">
                    {offeringPriceLabel(shownOffering, currency)}
                    <span className="font-normal text-[var(--hk-muted)]">
                      {matchingVariants.some((v) => variantPrice(o, v.id) > 0)
                        ? " / item / stay"
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
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--hk-muted)]">
                {o.description}
              </p>
              {o.confirmation === "approval" && (
                <p className="mt-2 text-xs text-[var(--hk-muted)]">
                  Hotel approval required
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
                    if (o.variants.length) setExpanded((old) => [...old, o.id]);
                    else change(o, null, 1);
                  }}
                  className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--hk-border)] text-sm font-semibold text-[var(--hk-navy)] transition hover:border-[var(--hk-navy)] hover:bg-[var(--hk-surface-soft)] disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {o.variants.length ? "Choose options" : "Add"}
                </button>
              )}
              {open && (
                <div className="mt-4 space-y-3 border-t border-[var(--hk-border)] pt-4">
                  <p className="text-xs text-[var(--hk-muted)]">
                    Maximum {o.maxQuantity} per booking
                    {o.variants.length ? " · Shared across choices" : ""}
                  </p>
                  {matchingVariants.map((v) => {
                    const quantity =
                      selections.find(
                        (s) => s.offeringId === o.id && s.variantId === v.id,
                      )?.quantity ?? 0;
                    return (
                      <div
                        key={v.id ?? "quantity"}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <div className="text-sm">
                          <p className="font-medium text-[var(--hk-navy)]">
                            {v.name}
                          </p>
                          <p className="text-xs text-[var(--hk-muted)]">
                            {priceText(variantPrice(o, v.id), currency)}
                          </p>
                        </div>
                        <div
                          role="group"
                          aria-label={`${o.name} ${v.name}`}
                          className="flex items-center rounded-xl border border-[var(--hk-border)]"
                        >
                          <button
                            type="button"
                            aria-label={`Remove one ${o.name} ${v.name}`}
                            disabled={disabled || quantity === 0}
                            onClick={() => change(o, v.id, quantity - 1)}
                            className="grid h-11 w-11 place-items-center rounded-l-xl hover:bg-[var(--hk-surface-soft)] disabled:opacity-30"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <output
                            aria-label={`${o.name} ${v.name} quantity`}
                            className="min-w-6 text-center text-sm font-semibold"
                          >
                            {quantity}
                          </output>
                          <button
                            type="button"
                            aria-label={`Add one ${o.name} ${v.name}`}
                            disabled={
                              disabled ||
                              expired ||
                              count >= o.maxQuantity ||
                              (quantity === 0 && selections.length >= 30)
                            }
                            onClick={() => change(o, v.id, quantity + 1)}
                            className="grid h-11 w-11 place-items-center rounded-r-xl hover:bg-[var(--hk-surface-soft)] disabled:opacity-30"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
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
