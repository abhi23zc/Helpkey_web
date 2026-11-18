"use client";

import { useState } from "react";
import {
  Baby,
  ChevronDown,
  ChevronUp,
  Cigarette,
  PawPrint,
  ScrollText,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";
import type { GuestPolicies } from "@/lib/partner/guest-policies";

type PolicyKey =
  | "childrenPolicy"
  | "petPolicy"
  | "smokingPolicy"
  | "identityRequirements";

type PolicyItemConfig = {
  key: PolicyKey;
  field: string;
  title: string;
  icon: React.ReactNode;
  yesLabel: string;
  noLabel: string;
};

const POLICY_ITEMS: PolicyItemConfig[] = [
  {
    key: "childrenPolicy",
    field: "allowed",
    title: "Children welcome",
    icon: <Baby className="h-5 w-5" />,
    yesLabel: "Allowed (Yes)",
    noLabel: "No Children",
  },
  {
    key: "petPolicy",
    field: "allowed",
    title: "Pets welcome",
    icon: <PawPrint className="h-5 w-5" />,
    yesLabel: "Allowed (Yes)",
    noLabel: "No Pets",
  },
  {
    key: "smokingPolicy",
    field: "allowed",
    title: "Smoking permitted",
    icon: <Cigarette className="h-5 w-5" />,
    yesLabel: "Allowed (Yes)",
    noLabel: "Non-Smoking",
  },
  {
    key: "identityRequirements",
    field: "governmentIdRequired",
    title: "Government ID required at check-in",
    icon: <ShieldCheck className="h-5 w-5" />,
    yesLabel: "Required (Yes)",
    noLabel: "Optional",
  },
];

const COMMON_RULES = [
  "Quiet hours from 10:00 PM to 7:00 AM.",
  "Parties or large group events are strictly prohibited.",
  "Non-registered visitors are not allowed in rooms after 9:00 PM.",
  "Swimming pool open from 7:00 AM to 8:00 PM.",
  "Free on-site parking available for registered guests only.",
];

export function GuestPolicyFields({
  value,
  onChange,
  disabled = false,
}: {
  value: GuestPolicies;
  onChange: (value: GuestPolicies) => void;
  disabled?: boolean;
}) {
  const [showHouseRules, setShowHouseRules] = useState(false);
  const hasRules = Boolean(value.additionalHouseRules?.trim());

  const handleToggle = (
    key: PolicyKey,
    field: string,
    nextVal: boolean | null,
  ) => {
    onChange({
      ...value,
      [key]: { [field]: nextVal },
    });
  };

  return (
    <div className="space-y-4">
      {/* 4 Boolean Policies as Segmented Cards */}
      <div className="space-y-3">
        {POLICY_ITEMS.map((item) => {
          const currentObj = value[item.key] as
            | Record<string, boolean | null | undefined>
            | undefined;
          const currentVal =
            typeof currentObj?.[item.field] === "boolean"
              ? currentObj[item.field]
              : null;

          return (
            <div
              key={item.key}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 p-4 sm:p-5 rounded-2xl border border-slate-200/90 bg-white hover:border-slate-300 transition-colors shadow-2xs"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-[#061224] border border-slate-200/60">
                  {item.icon}
                </div>
                <p className="text-sm sm:text-base font-bold text-[#061224] leading-snug">
                  {item.title}
                </p>
              </div>

              {/* Segmented Buttons */}
              <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200/80 text-xs sm:text-sm shrink-0 self-start sm:self-center">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleToggle(item.key, item.field, true)}
                  className={`rounded-lg px-3.5 sm:px-4 py-2 transition-all font-bold ${
                    currentVal === true
                      ? "bg-[#061224] text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {item.yesLabel}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleToggle(item.key, item.field, false)}
                  className={`rounded-lg px-3.5 sm:px-4 py-2 transition-all font-bold ${
                    currentVal === false
                      ? "bg-[#061224] text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {item.noLabel}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleToggle(item.key, item.field, null)}
                  className={`rounded-lg px-3 sm:px-3.5 py-2 transition-all font-semibold ${
                    currentVal === null
                      ? "bg-white text-slate-800 shadow-xs"
                      : "text-slate-400 hover:text-slate-700"
                  }`}
                >
                  Unspecified
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Minimum Check-in Age Card */}
      <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/90 bg-white space-y-3.5 shadow-2xs">
        <div className="flex items-center gap-3.5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-[#061224] border border-slate-200/60">
            <UserCheck className="h-5 w-5" />
          </div>
          <p className="text-sm sm:text-base font-bold text-[#061224] leading-snug">
            Minimum check-in age (optional)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          {[
            { label: "18 years (Standard)", value: 18 },
            { label: "21 years", value: 21 },
            { label: "None / Default", value: null },
          ].map((preset) => {
            const active = (value.minimumCheckInAge ?? null) === preset.value;
            return (
              <button
                key={preset.label}
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange({ ...value, minimumCheckInAge: preset.value })
                }
                className={`rounded-xl px-4 py-2 text-xs sm:text-sm font-bold border transition-all ${
                  active
                    ? "border-[#c89b3c] bg-[#c89b3c]/10 text-[#9a6b18] shadow-2xs"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {preset.label}
              </button>
            );
          })}

          {/* Custom Age Box */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs sm:text-sm">
            <span className="text-slate-600 font-semibold">Custom:</span>
            <input
              type="number"
              min={18}
              max={100}
              disabled={disabled}
              placeholder="e.g. 25"
              value={value.minimumCheckInAge ?? ""}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : null;
                onChange({ ...value, minimumCheckInAge: val });
              }}
              className="w-16 text-center font-bold text-slate-900 outline-none"
            />
            <span className="text-slate-400 font-medium">yrs</span>
          </div>
        </div>
      </div>

      {/* Additional House Rules (Accordion / Collapsible - Collapsed by default) */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => setShowHouseRules((prev) => !prev)}
          className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-slate-50/60 transition-colors"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-[#061224] border border-slate-200/60">
              <ScrollText className="h-5 w-5" />
            </div>
            <p className="text-sm sm:text-base font-bold text-[#061224] leading-snug">
              Additional house rules (optional)
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 ml-3">
            {hasRules ? (
              <span className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold px-2.5 py-1">
                Rules Added
              </span>
            ) : (
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                None added
              </span>
            )}
            <div className="grid h-8 w-8 place-items-center rounded-lg text-slate-400">
              {showHouseRules ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </button>

        {showHouseRules && (
          <div className="p-4 sm:p-5 pt-0 border-t border-slate-100 space-y-3.5">
            <div className="flex items-center justify-between pt-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[#c89b3c]" /> Quick-add common rules:
              </p>
              <span className="text-xs sm:text-sm font-semibold text-slate-400">
                {value.additionalHouseRules?.length ?? 0} / 2,000
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {COMMON_RULES.map((rule) => (
                <button
                  key={rule}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    const current = value.additionalHouseRules
                      ? value.additionalHouseRules.trim()
                      : "";
                    if (current.includes(rule)) return;
                    const next = current ? `${current}\n• ${rule}` : `• ${rule}`;
                    onChange({
                      ...value,
                      additionalHouseRules: next.slice(0, 2000),
                    });
                  }}
                  className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 hover:border-[#c89b3c] hover:bg-amber-50/60 transition-colors"
                >
                  + {rule.split(".")[0]}
                </button>
              ))}
            </div>

            <textarea
              disabled={disabled}
              rows={4}
              maxLength={2000}
              value={value.additionalHouseRules ?? ""}
              placeholder="Enter quiet hours, visitor policy, pool rules, parking instructions, or any special terms..."
              onChange={(e) =>
                onChange({ ...value, additionalHouseRules: e.target.value })
              }
              className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#c89b3c] focus:ring-1 focus:ring-[#c89b3c] transition-all resize-y"
            />
          </div>
        )}
      </div>
    </div>
  );
}
