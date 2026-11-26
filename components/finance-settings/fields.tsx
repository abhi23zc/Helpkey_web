"use client";
import {
  offeringCategories,
  offeringCategoryLabels,
} from "@/lib/stay/contracts";
import { type Field, type Policy } from "@/lib/finance-settings/domain";

export const labels: Record<Field, string> = {
  commissionBasisPoints: "Marketplace commission (%)",
  commissionBasis: "Commission categories",
  eligibleExtraCategories: "Eligible extra categories",
  marketplaceCommission: "Commission on marketplace bookings",
  directCommission: "Commission on hotel-created direct reservations",
  walkInCommission: "Commission on walk-ins",
  guestPaymentOptions: "Permitted guest payment options",
  advance: "Partial advance requirement",
  payoutDelayDays: "Days after checkout before payout eligibility",
  payoutCycle: "Payout cycle",
  payoutWeekday: "Weekly payout day",
  minimumPayoutPaise: "Minimum payout (₹)",
  duesLimit: "Hotel dues limit",
  duesWarningPaise: "Dues warning threshold (₹)",
  duesGraceDays: "Dues grace period (days)",
};
export const choices: Partial<Record<Field, Record<string, string>>> = {
  commissionBasis: {
    rooms: "Room charges only, before guest taxes",
    rooms_and_extras: "Room charges and selected extras, before guest taxes",
  },
  payoutCycle: { daily: "Daily", weekly: "Weekly" },
  payoutWeekday: Object.fromEntries(
    [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ].map((d) => [d, d[0].toUpperCase() + d.slice(1)]),
  ),
  guestPaymentOptions: {
    full_online: "Full online payment",
    partial_advance: "Partial advance; balance at hotel",
    at_hotel: "Full payment at hotel",
  },
  eligibleExtraCategories: Object.fromEntries(
    offeringCategories.map((c) => [c, offeringCategoryLabels[c]]),
  ),
};
const input =
  "min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100 disabled:bg-slate-50";
export function initialValue(key: Field): unknown {
  if (key === "directCommission" || key === "walkInCommission") return false;
  if (key === "marketplaceCommission") return true;
  if (key === "guestPaymentOptions" || key === "eligibleExtraCategories")
    return [];
  if (key === "advance") return { type: "percentage" };
  return undefined;
}
export function activeField(key: Field, values: Policy): boolean {
  if (key === "advance")
    return values.guestPaymentOptions?.includes("partial_advance") === true;
  if (key === "payoutWeekday") return values.payoutCycle === "weekly";
  if (key === "eligibleExtraCategories")
    return values.commissionBasis === "rooms_and_extras";
  return true;
}
export function displayValue(key: Field, value: unknown): string {
  if (value === undefined) return "Not configured";
  if (typeof value === "boolean") return value ? "Applies" : "Does not apply";
  if (Array.isArray(value))
    return value.length
      ? value.map((v) => choices[key]?.[v] ?? v).join(", ")
      : "None selected";
  if (key === "advance") {
    const a = value as NonNullable<Policy["advance"]>;
    if (
      a.type === "fixed"
        ? !Number.isFinite(a.amountPaise)
        : a.type !== "percentage" || !Number.isFinite(a.basisPoints)
    )
      return "Enter a value";
    return a.type === "fixed"
      ? `₹${(a.amountPaise / 100).toLocaleString("en-IN")} (capped at amount owed)`
      : `${a.basisPoints / 100}%`;
  }
  if (key === "duesLimit") {
    const d = value as NonNullable<Policy["duesLimit"]>;
    if (d.type !== "unlimited" && !Number.isFinite(d.amountPaise))
      return "Enter a value";
    return d.type === "unlimited"
      ? "No dues limit configured (explicit agreement)"
      : `₹${(d.amountPaise / 100).toLocaleString("en-IN")}`;
  }
  if (key === "commissionBasisPoints") return `${Number(value) / 100}%`;
  if (key.endsWith("Paise"))
    return `₹${(Number(value) / 100).toLocaleString("en-IN")}`;
  return choices[key]?.[String(value)] ?? String(value);
}
function NumberInput({
  value,
  onChange,
  scale = 1,
  min = 0,
  max,
  label,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  scale?: number;
  min?: number;
  max: number;
  label: string;
}) {
  return (
    <input
      aria-label={label}
      className={input}
      type="number"
      min={min}
      max={max}
      step={1 / scale}
      value={typeof value === "number" ? value / scale : ""}
      onChange={(e) =>
        onChange(
          e.target.value === ""
            ? undefined
            : Number((Number(e.target.value) * scale).toFixed(6)),
        )
      }
    />
  );
}
export function FieldEditor({
  name,
  value,
  onChange,
}: {
  name: Field;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = labels[name];
  if (
    ["marketplaceCommission", "directCommission", "walkInCommission"].includes(
      name,
    )
  )
    return (
      <select
        aria-label={label}
        className={input}
        value={value === undefined ? "" : String(value)}
        onChange={(e) =>
          onChange(
            e.target.value === "" ? undefined : e.target.value === "true",
          )
        }
      >
        <option value="">Select applicability</option>
        <option value="true">Applies</option>
        <option value="false">Does not apply</option>
      </select>
    );
  if (name === "guestPaymentOptions" || name === "eligibleExtraCategories")
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(choices[name]!).map(([v, text]) => (
          <label
            key={v}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm leading-5 has-[:checked]:border-amber-300 has-[:checked]:bg-amber-50/60"
          >
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-[#0b2038]"
              checked={Array.isArray(value) && value.includes(v)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...(Array.isArray(value) ? value : []), v]
                    : (Array.isArray(value) ? value : []).filter(
                        (x) => x !== v,
                      ),
                )
              }
            />
            {text}
          </label>
        ))}
      </div>
    );
  if (name === "advance" || name === "duesLimit") {
    const item = (value ?? {}) as {
      type?: string;
      amountPaise?: number;
      basisPoints?: number;
    };
    const types =
      name === "advance"
        ? { fixed: "Fixed rupee amount", percentage: "Percentage" }
        : {
            limited: "Rupee limit (zero is allowed)",
            unlimited: "No dues limit",
          };
    return (
      <div className="space-y-2">
        <select
          aria-label={`${label} type`}
          className={input}
          value={item.type ?? ""}
          onChange={(e) =>
            onChange(e.target.value ? { type: e.target.value } : undefined)
          }
        >
          <option value="">Select type</option>
          {Object.entries(types).map(([v, text]) => (
            <option key={v} value={v}>
              {text}
            </option>
          ))}
        </select>
        {item.type && item.type !== "unlimited" && (
          <NumberInput
            label={`${label} value`}
            value={
              item.type === "percentage" ? item.basisPoints : item.amountPaise
            }
            scale={100}
            min={
              name === "advance" ? (item.type === "percentage" ? 1 : 0.01) : 0
            }
            max={item.type === "percentage" ? 100 : 10_000_000}
            onChange={(v) =>
              onChange({
                type: item.type,
                [item.type === "percentage" ? "basisPoints" : "amountPaise"]: v,
              })
            }
          />
        )}
      </div>
    );
  }
  if (choices[name])
    return (
      <select
        aria-label={label}
        className={input}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">Select value</option>
        {Object.entries(choices[name]!).map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    );
  const percentage = name === "commissionBasisPoints",
    money = name.endsWith("Paise");
  return (
    <NumberInput
      label={label}
      value={value}
      onChange={onChange}
      scale={percentage || money ? 100 : 1}
      max={percentage ? 100 : money ? 10_000_000 : 365}
    />
  );
}
