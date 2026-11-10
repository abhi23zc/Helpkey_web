"use client";
import { ResponseControls } from "./response-controls";
import { replaceSelection, resolveResponse, requiredResponseError } from "@/lib/stay/response";
import { GuestInputFields } from "./guest-input-fields";
import { offeringPriceLabel, variantPrice } from "@/lib/stay/pricing";
import { useEffect, useState } from "react";
import type {
  Offering,
  Selection,
  TravelerCategory,
} from "@/lib/stay/contracts";
import { travelerCategories, travelerLabels } from "@/lib/stay/contracts";
import { formatMoney } from "@/lib/customer/offer";
export function TravelerChips({
  value,
  onChange,
  disabled = false,
  single = false,
}: {
  single?: boolean;
  value: TravelerCategory[];
  onChange: (v: TravelerCategory[]) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-xs text-slate-500">
        {single
          ? "Trip type (optional) · Helps us suggest relevant extras"
          : "Trip preferences · Choose target travelers, or leave blank to show to everyone."}
      </p>
      <div className="flex flex-wrap gap-2">
        {travelerCategories.map((t) => {
          const isSelected = value.includes(t);
          return (
            <button
              key={t}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              onClick={() =>
                onChange(
                  isSelected
                    ? value.filter((v) => v !== t)
                    : single
                      ? [t]
                      : [...value, t],
                )
              }
              className={`h-8 inline-flex items-center justify-center rounded-lg border px-3 text-xs font-semibold transition-all disabled:opacity-50 ${
                isSelected
                  ? "border-[#061224] bg-[#061224] text-white shadow-2xs"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300"
              }`}
            >
              <span>{travelerLabels[t] ?? t}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
export function PersonalizationPicker({
  offerings,
  selections,
  onChange,
  preferences,
  startAt,
  timezone,
  currency = "INR",
  disabled = false,
  retainedQuantities = {},
  freeOnly = false,
}: {
  retainedQuantities?: Record<string, number>;
  freeOnly?: boolean;
  offerings: Offering[];
  selections: Selection[];
  onChange: (v: Selection[]) => void;
  preferences: TravelerCategory[];
  startAt: string;
  timezone: string;
  currency?: string;
  disabled?: boolean;
}) {
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Selection["inputs"]>>({});
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const upcoming = offerings
      .map((o) => Date.parse(startAt) - o.advanceNoticeMinutes * 60000)
      .filter((deadline) => deadline > now);
    const delay = Math.max(
      1,
      Math.min(15000, ...upcoming.map((deadline) => deadline - now)),
    );
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [offerings, startAt, now]);
  const sorted = [...offerings].sort(
    (a, b) =>
      Number(b.travelerCategories.some((t) => preferences.includes(t))) -
        Number(a.travelerCategories.some((t) => preferences.includes(t))) ||
      a.name.localeCompare(b.name),
  );
  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!sorted.length && (
        <p className="text-sm text-slate-500">
          No additional options are available for this stay. You can still leave
          a special request.
        </p>
      )}
      {sorted.map((o) => {
        const count =
          (retainedQuantities[o.id] ?? 0) +
          selections
            .filter((s) => s.offeringId === o.id)
            .reduce((sum, s) => sum + s.quantity, 0);
        const deadline = new Date(
          Date.parse(startAt) - o.advanceNoticeMinutes * 60000,
        );
        const expired = now >= deadline.getTime();
        return (
          <div
            key={o.id}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <h4 className="font-semibold text-[#061224]">{o.name}</h4>
              <span className="text-sm font-semibold">
                {offeringPriceLabel(o, currency)}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{o.description}</p>
            <p className="mt-2 text-xs text-slate-500">
              {o.kind === "item"
                ? "Hotel-provided item"
                : o.kind === "service"
                  ? "Preparation service"
                  : "Room preference"}{" "}
              ·{" "}
              {o.confirmation === "approval"
                ? "Awaiting hotel confirmation if selected"
                : "Confirmed with your booking"}{" "}
              · Maximum {o.maxQuantity} per booking
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {expired ? "Request deadline passed" : "Choose before"}{" "}
              {deadline.toLocaleString("en-IN", {
                timeZone: timezone,
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              ({timezone})
            </p>
            {o.travelerCategories.some((t) => preferences.includes(t)) && (
              <p className="mt-1 text-xs font-medium text-[#87671e]">
                Suggested for your stay
              </p>
            )}
            {(o.variants.length
              ? o.variants
              : [{ id: null, name: "Quantity" }]
            ).map((v) => {
              const selected = selections.find(
                (s) => s.offeringId === o.id && s.variantId === v.id,
              );
              const quantity = selected?.quantity ?? 0;
              return (
                <div key={v.id ?? "default"} className="mt-3 space-y-2">
                  <GuestInputFields
                    offering={o}
                    timezone={timezone}
                    disabled={disabled}
                    value={
                      drafts[JSON.stringify([o.id, v.id])] ?? selected?.inputs
                    }
                    onChange={(inputs) => {
                      setDrafts((old) => ({
                        ...old,
                        [JSON.stringify([o.id, v.id])]: inputs,
                      }));
                      if (selected)
                        onChange(
                          selections.map((s) =>
                            s === selected ? { ...s, inputs } : s,
                          ),
                        );
                    }}
                  />
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      {!o.variants.length ? "Request this" : v.name} ·{" "}
                      {variantPrice(o, v.id) === 0
                        ? "Free"
                        : formatMoney(variantPrice(o, v.id), currency)}
                    </span>
                    <ResponseControls offering={o} optionName={v.name} quantity={quantity} count={count} disabled={disabled} legacySelect blockIncrease={expired || (freeOnly && variantPrice(o, v.id) > 0) || (resolveResponse(o).responseType === "single" && (retainedQuantities[o.id] ?? 0) > 0)} onChange={n => {
                      const inputs = drafts[JSON.stringify([o.id, v.id])] ?? selected?.inputs;
                      const missing = requiredResponseError(o, inputs);
                      if (n > 0 && missing) { setError(missing); return; }
                      setError(""); onChange(replaceSelection(selections, o, v.id, n, inputs));
                    }} />

                  </div>
                </div>
              );
            })}
            {count > 0 && (
              <p className="mt-2 text-right text-sm font-semibold">
                {formatMoney(
                  selections
                    .filter((s) => s.offeringId === o.id)
                    .reduce(
                      (sum, s) =>
                        sum + s.quantity * variantPrice(o, s.variantId),
                      0,
                    ),
                  currency,
                )}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
