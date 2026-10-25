"use client";
import { offeringPriceLabel, variantPrice } from "@/lib/stay/pricing";
import { useEffect, useState } from "react";
import type {
  Offering,
  Selection,
  TravelerCategory,
} from "@/lib/stay/contracts";
import { travelerCategories } from "@/lib/stay/contracts";
import { formatMoney } from "@/lib/customer/offer";
export function TravelerChips({
  value,
  onChange,
  disabled = false,
}: {
  value: TravelerCategory[];
  onChange: (v: TravelerCategory[]) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-sm text-slate-600">
        What brings you here? Choose any, or skip.
      </p>
      <div className="flex flex-wrap gap-2">
        {travelerCategories.map((t) => (
          <button
            key={t}
            type="button"
            disabled={disabled}
            aria-pressed={value.includes(t)}
            onClick={() =>
              onChange(
                value.includes(t)
                  ? value.filter((v) => v !== t)
                  : [...value, t],
              )
            }
            className={`rounded-full border px-4 py-2 text-sm disabled:opacity-50 ${value.includes(t) ? "border-[#061224] bg-[#061224] text-white" : "border-slate-200 bg-white text-slate-700"}`}
          >
            {t}
          </button>
        ))}
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
      {!sorted.length && (
        <p className="text-sm text-slate-500">
          No additional options are available for this stay. You can still leave
          a special request.
        </p>
      )}
      {sorted.map((o) => {
        const count = (retainedQuantities[o.id] ?? 0) + selections
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
                <label
                  key={v.id ?? "default"}
                  className="mt-3 flex items-center justify-between gap-3 text-sm"
                >
                  <span>{v.name} · {variantPrice(o, v.id) === 0 ? "Free" : formatMoney(variantPrice(o, v.id), currency)}</span>
                  <select
                    aria-label={`${o.name} ${v.name}`}
                    disabled={disabled}
                    value={quantity}
                    onChange={(e) => {
                      const rest = selections.filter(
                        (s) => !(s.offeringId === o.id && s.variantId === v.id),
                      );
                      const n = Number(e.target.value);
                      onChange(
                        n
                          ? [
                              ...rest,
                              {
                                offeringId: o.id,
                                variantId: v.id,
                                quantity: n,
                              },
                            ]
                          : rest,
                      );
                    }}
                    className="rounded-lg border border-slate-200 bg-white p-2"
                  >
                    {Array.from(
                      {
                        length:
                          Math.max(o.maxQuantity - count + quantity, quantity) +
                          1,
                      },
                      (_, n) => (
                        <option
                          key={n}
                          value={n}
                          disabled={
                            n > 0 &&
                            (expired || freeOnly && variantPrice(o, v.id) > 0 || n > o.maxQuantity - count + quantity)
                          }
                        >
                          {n === 0 ? "Not selected" : n}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              );
            })}
            {count > 0 && (
              <p className="mt-2 text-right text-sm font-semibold">
                {formatMoney(selections.filter((s) => s.offeringId === o.id).reduce((sum, s) => sum + s.quantity * variantPrice(o, s.variantId), 0), currency)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
