"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  categories,
  categoryLabels,
  unknownDeductions,
  type Deductions,
} from "@/lib/payouts/deductions";
import {
  assessmentFromDraft,
  deductionDraft,
  draftDeductionTotal,
  type DeductionDraft,
} from "@/lib/payouts/assessment-input";

const explanations = {
  commissionTax: "Tax on Helpkey’s commission, if applicable to this booking.",
  statutory: "Any required withholding or other statutory deduction.",
  gatewayFees: "A verified payment-processing fee charged to this settlement.",
  other: "Another supported deduction. Explain what it covers.",
};
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    n / 100,
  );
const field =
  "mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100";
export function AssessmentEditor({
  position,
  busy,
  save,
}: {
  position: {
    grossPaise: number;
    assessment: { items: Deductions } | null;
    reservation?: { status?: string } | null;
  };
  busy: boolean;
  save: (items: Deductions) => void;
}) {
  const [draft, setDraft] = useState(() =>
    deductionDraft(position.assessment?.items ?? unknownDeductions()),
  );
  const [error, setError] = useState("");
  const total = draftDeductionTotal(draft),
    complete = categories.filter((k) => draft[k].choice !== "unknown").length;
  const disabled =
    busy ||
    !!(position.reservation && position.reservation.status !== "released");
  function update(
    k: (typeof categories)[number],
    patch: Partial<DeductionDraft[typeof k]>,
  ) {
    setDraft((old) => ({ ...old, [k]: { ...old[k], ...patch } }));
    setError("");
  }
  function submit() {
    try {
      const items = assessmentFromDraft(draft, position.grossPaise);
      setError("");
      save(items);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Review all deductions before saving.",
      );
    }
  }
  return (
    <details className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/40 p-4 sm:p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
        <span>Review deductions</span>{" "}
        <span className="ml-auto text-xs font-normal text-slate-500">
          {complete} of 4 reviewed
        </span>
        <ChevronDown className="size-4" />
      </summary>
      <p className="my-4 text-sm leading-6 text-slate-600">
        Confirm each category using the booking’s supporting records. Helpkey
        commission is already accounted for. Enter only additional deductions
        here.
      </p>
      <fieldset disabled={disabled}>
        <div className="grid gap-4 sm:grid-cols-2">
          {categories.map((k) => {
            const item = draft[k],
              label = categoryLabels[k];
            return (
              <fieldset
                key={k}
                className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4"
              >
                <legend className="px-1 text-sm font-semibold">{label}</legend>
                <p className="text-xs leading-5 text-slate-500">
                  {explanations[k]}
                </p>
                <label className="block text-sm text-slate-600">
                  Review choice
                  <select
                    className={field}
                    aria-label={`${label} status`}
                    value={item.choice}
                    onChange={(e) =>
                      update(k, {
                        choice: e.target.value as typeof item.choice,
                        amount: "",
                      })
                    }
                  >
                    <option value="unknown">Not reviewed</option>
                    <option value="amount">Enter amount</option>
                    <option value="zero">Confirmed ₹0</option>
                    <option value="not_applicable">Not applicable</option>
                  </select>
                </label>
                {item.choice === "amount" && (
                  <label className="block text-sm text-slate-600">
                    Amount (₹)
                    <input
                      className={field}
                      aria-label={`${label} amount in rupees`}
                      inputMode="decimal"
                      maxLength={24}
                      placeholder="Enter amount"
                      value={item.amount}
                      onChange={(e) => update(k, { amount: e.target.value })}
                    />
                  </label>
                )}
                {item.choice !== "unknown" && (
                  <label className="block text-sm text-slate-600">
                    Reason
                    <input
                      className={field}
                      aria-label={`${label} reason`}
                      placeholder="Explain this decision"
                      maxLength={500}
                      value={item.reason}
                      onChange={(e) => update(k, { reason: e.target.value })}
                    />
                  </label>
                )}
              </fieldset>
            );
          })}
        </div>
        <div
          className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm"
          aria-label="Deduction summary"
        >
          <div className="flex justify-between gap-4">
            <span className="text-slate-600">
              Hotel amount before deductions
            </span>
            <strong>{money(position.grossPaise)}</strong>
          </div>
          <div className="mt-2 flex justify-between gap-4">
            <span className="text-slate-600">Total deductions</span>
            <span>{total === null ? "Review incomplete" : money(total)}</span>
          </div>
          <div className="mt-3 flex justify-between gap-4 border-t border-slate-100 pt-3 font-semibold">
            <span>Final hotel payment</span>
            <span>
              {total === null
                ? "Not ready"
                : total >= position.grossPaise
                  ? "Must be greater than ₹0"
                  : money(position.grossPaise - total)}
            </span>
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="button"
          className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#0b2038] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          onClick={submit}
        >
          Save deduction review
        </button>
      </fieldset>
    </details>
  );
}
