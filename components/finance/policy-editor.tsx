"use client";
import type { FinancePolicy, FinanceOverrides } from "@/lib/finance/domain";
import { policyKeys } from "@/lib/finance/domain";
export const fieldClass =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white p-2 text-sm text-slate-900";
export const buttonClass =
  "rounded-xl bg-[#061224] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const labels: Record<keyof FinancePolicy, string> = {
  roomCommissionBps: "Room commission",
  extrasCommissionBps: "Extras commission",
  directBookingCommissionBps: "Direct booking commission",
  paymentOptions: "Permitted payment options",
  advance: "Advance",
  providerCharges: "Provider charges paid by",
  payoutSchedule: "Payout schedule",
  payoutWaitHours: "Payout wait (hours)",
  minimumPayoutPaise: "Minimum payout (₹)",
  dues: "Dues limit and warning",
  priceEntry: "Price entry",
  approval: "Approval",
};
export function PolicyEditor({
  global,
  overrides,
  onChange,
  readOnly = false,
  hotel = false,
}: {
  global: FinancePolicy;
  overrides: FinanceOverrides;
  onChange: (v: FinanceOverrides) => void;
  readOnly?: boolean;
  hotel?: boolean;
}) {
  function set<K extends keyof FinancePolicy>(k: K, v: FinancePolicy[K]) {
    onChange({ ...overrides, [k]: v });
  }
  const numeric = (
    label: string,
    v: number,
    change: (v: number) => void,
    scale = 1,
  ) => (
    <label className="block text-sm">
      {label}
      <input
        className={fieldClass}
        type="number"
        min="0"
        step={scale === 1 ? "1" : "0.01"}
        value={v / scale}
        disabled={readOnly}
        onChange={(e) => change(Math.round(Number(e.target.value) * scale))}
      />
    </label>
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {policyKeys.map((k) => {
        const value = { ...global, ...overrides };
        const inherited = hotel && !Object.hasOwn(overrides, k);
        const disabled = readOnly || inherited;
        let control;
        if (
          [
            "roomCommissionBps",
            "extrasCommissionBps",
            "directBookingCommissionBps",
            "payoutWaitHours",
            "minimumPayoutPaise",
          ].includes(k)
        ) {
          const scale = k.endsWith("Bps") || k.endsWith("Paise") ? 100 : 1;
          control = (
            <input
              aria-label={labels[k]}
              className={fieldClass}
              type="number"
              min="0"
              max={k.endsWith("Bps") ? 100 : undefined}
              step={scale === 100 ? "0.01" : "1"}
              value={(value[k] as number) / scale}
              disabled={disabled}
              onChange={(e) =>
                set(k, Math.round(Number(e.target.value) * scale) as never)
              }
            />
          );
        } else if (k === "paymentOptions")
          control = (
            <div className="space-y-2">
              {(
                ["full_online", "advance_online", "pay_at_property"] as const
              ).map((o) => (
                <label key={o} className="block text-sm">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={value.paymentOptions.includes(o)}
                    onChange={(e) =>
                      set(
                        k,
                        e.target.checked
                          ? [...value.paymentOptions, o]
                          : value.paymentOptions.filter((p) => p !== o),
                      )
                    }
                  />{" "}
                  {o.replaceAll("_", " ")}
                </label>
              ))}
            </div>
          );
        else if (k === "advance")
          control = (
            <fieldset disabled={disabled}>
              <select
                aria-label="Advance type"
                className={fieldClass}
                value={value.advance.kind}
                onChange={(e) =>
                  set(
                    k,
                    e.target.value === "fixed"
                      ? { kind: "fixed", amountPaise: 0 }
                      : { kind: "percentage", basisPoints: 2500 },
                  )
                }
              >
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </select>
              {value.advance.kind === "percentage"
                ? numeric(
                    "Advance (%)",
                    value.advance.basisPoints,
                    (v) => set(k, { kind: "percentage", basisPoints: v }),
                    100,
                  )
                : numeric(
                    "Advance (₹)",
                    value.advance.amountPaise,
                    (v) => set(k, { kind: "fixed", amountPaise: v }),
                    100,
                  )}
            </fieldset>
          );
        else if (k === "dues")
          control = (
            <fieldset disabled={disabled}>
              {numeric(
                "Dues limit (₹)",
                value.dues.limitPaise,
                (v) => set(k, { ...value.dues, limitPaise: v }),
                100,
              )}
              {numeric(
                "Warning (%)",
                value.dues.warningBps,
                (v) => set(k, { ...value.dues, warningBps: v }),
                100,
              )}
            </fieldset>
          );
        else if (k === "payoutSchedule") {
          const s = value.payoutSchedule;
          control = (
            <fieldset disabled={disabled} className="space-y-2">
              <select
                aria-label="Schedule frequency"
                className={fieldClass}
                value={s.kind}
                onChange={(e) =>
                  set(
                    k,
                    e.target.value === "daily"
                      ? {
                          kind: "daily",
                          localTime: s.localTime,
                          timezone: s.timezone,
                        }
                      : e.target.value === "weekdays"
                        ? {
                            kind: "weekdays",
                            weekdays: [1],
                            localTime: s.localTime,
                            timezone: s.timezone,
                          }
                        : {
                            kind: "interval",
                            everyDays: 7,
                            anchorDate: "",
                            localTime: s.localTime,
                            timezone: s.timezone,
                          },
                  )
                }
              >
                <option value="daily">Daily</option>
                <option value="weekdays">Selected weekdays</option>
                <option value="interval">Every N days</option>
              </select>
              <label className="block text-sm">
                Local time
                <input
                  aria-label="Payout local time"
                  type="time"
                  className={fieldClass}
                  value={s.localTime}
                  onChange={(e) => set(k, { ...s, localTime: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Timezone
                <input
                  className={fieldClass}
                  value={s.timezone}
                  onChange={(e) => set(k, { ...s, timezone: e.target.value })}
                />
              </label>
              {s.kind === "weekdays" && (
                <div className="flex flex-wrap gap-2">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                    (d, i) => (
                      <label key={d} className="text-sm">
                        <input
                          type="checkbox"
                          checked={s.weekdays.includes(i)}
                          onChange={(e) =>
                            set(k, {
                              ...s,
                              weekdays: e.target.checked
                                ? [...s.weekdays, i]
                                : s.weekdays.filter((v) => v !== i),
                            })
                          }
                        />{" "}
                        {d}
                      </label>
                    ),
                  )}
                </div>
              )}
              {s.kind === "interval" && (
                <>
                  {numeric("Every N days", s.everyDays, (v) =>
                    set(k, { ...s, everyDays: v }),
                  )}
                  <label className="block text-sm">
                    Local anchor date
                    <input
                      className={fieldClass}
                      type="date"
                      value={s.anchorDate}
                      onChange={(e) =>
                        set(k, { ...s, anchorDate: e.target.value })
                      }
                    />
                  </label>
                </>
              )}
            </fieldset>
          );
        } else if (k === "approval")
          control = (
            <p className="text-sm">
              Founder approval required. Automatic approval is unavailable in
              Phase 1.
            </p>
          );
        else
          control = (
            <select
              aria-label={labels[k]}
              className={fieldClass}
              disabled={disabled}
              value={String(value[k])}
              onChange={(e) => set(k, e.target.value as never)}
            >
              {(k === "providerCharges"
                ? ["helpkey", "hotel"]
                : ["tax_exclusive", "tax_inclusive"]
              ).map((o) => (
                <option key={o} value={o}>
                  {o.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          );
        return (
          <section
            key={k}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <h3 className="font-semibold">
              {labels[k]}
              {k.endsWith("Bps") ? " (%)" : ""}
            </h3>
            {hotel && (
              <p className="my-2 text-xs text-slate-500">
                Source: {inherited ? "Global settings" : "Hotel override"}
              </p>
            )}
            {hotel && !readOnly && (
              <label className="mb-3 block text-sm">
                <input
                  type="checkbox"
                  checked={inherited}
                  onChange={(e) => {
                    const next = { ...overrides };
                    if (e.target.checked) delete next[k];
                    else Object.assign(next, { [k]: global[k] });
                    onChange(next);
                  }}
                />{" "}
                Use global settings
              </label>
            )}
            {control}
          </section>
        );
      })}
    </div>
  );
}
