import { Minus, Plus } from "lucide-react";

/** Plus/minus stepper shared by the hotel booking card and the checkout guest selector. */
export function GuestCounterRow({
  label,
  note,
  value,
  min,
  max,
  onChange,
  disabled = false,
  limitNote,
  large = false,
}: {
  label: string;
  note: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Locks both buttons (for example while a payment hold is active). */
  disabled?: boolean;
  /** Shown instead of `note` once the maximum has been reached. */
  limitNote?: string;
  /** Larger tap targets for touch screens. */
  large?: boolean;
}) {
  const atLimit = value >= max;
  const button = `flex ${large ? "h-9 w-9" : "h-7 w-7"} items-center justify-center rounded-full border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition`;
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <div>
        <b className="block text-xs font-bold text-[var(--hk-navy)]">{label}</b>
        <span
          className={`text-[11px] ${atLimit && limitNote ? "font-semibold text-amber-700" : "text-slate-400"}`}
        >
          {atLimit && limitNote ? limitNote : note}
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={disabled || value <= min}
          onClick={() => onChange(value - 1)}
          className={button}
        >
          <Minus className="h-3 w-3" />
        </button>
        <span
          className="w-4 text-center font-bold text-xs text-[var(--hk-navy)]"
          aria-label={`${value} ${label}`}
        >
          {value}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={disabled || atLimit}
          onClick={() => onChange(value + 1)}
          className={button}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
