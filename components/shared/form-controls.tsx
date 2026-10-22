"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Clock, Info } from "lucide-react";

export function formatTimeDisplay(time24: string): string {
  if (!time24) return "Select time";
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr || "00";
  if (isNaN(h)) return time24;
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${String(displayH).padStart(2, "0")}:${m} ${period}`;
}

export function buildTimeOptions(intervalMinutes: number) {
  const options: Array<{ value: string; label: string }> = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += intervalMinutes) {
    const val = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    options.push({ value: val, label: formatTimeDisplay(val) });
  }
  return options;
}

const optionsByInterval = new Map<number, ReturnType<typeof buildTimeOptions>>();
function timeOptionsFor(intervalMinutes: number) {
  let options = optionsByInterval.get(intervalMinutes);
  if (!options) {
    options = buildTimeOptions(intervalMinutes);
    optionsByInterval.set(intervalMinutes, options);
  }
  return options;
}

// Small "i" button that explains a field in plain language. Click (or Enter /
// Space) toggles the tip; Escape or clicking elsewhere closes it.
export function InfoTip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const tipId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | TouchEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open]);

  return (
    <span ref={wrapperRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={`What is “${label}”?`}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className="grid h-4 w-4 place-items-center rounded-full text-slate-400 transition hover:text-[#092442] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#092442]/30"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          id={tipId}
          className="absolute left-0 top-full z-40 mt-2 w-60 max-w-[calc(100vw-4rem)] rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium normal-case leading-relaxed tracking-normal text-slate-600 shadow-xl"
        >
          {text}
        </span>
      )}
    </span>
  );
}

// Label row shared by inputs, selects and pickers: label text, optional
// "(optional)" hint and the info button.
export function FieldHeader({
  label,
  htmlFor,
  info,
  optional,
  className = "text-xs font-bold uppercase tracking-wider text-slate-600",
}: {
  label: string;
  htmlFor?: string;
  info?: string;
  optional?: boolean;
  className?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={htmlFor} className={className}>
        {label}
        {optional && (
          <span className="ml-1 font-semibold normal-case tracking-normal text-slate-400">
            (optional)
          </span>
        )}
      </label>
      {info && <InfoTip label={label} text={info} />}
    </div>
  );
}

// Themed replacement for <input type="time">. Clicking anywhere on the field
// opens a list of times. Works controlled (value + onChange) or uncontrolled
// (defaultValue + name, which renders a hidden input for form submission).
export function TimeSelect({
  label,
  info,
  name,
  value,
  defaultValue,
  onChange,
  intervalMinutes = 15,
  required = true,
  size = "compact",
  labelClassName,
}: {
  label: string;
  info?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  intervalMinutes?: 15 | 30;
  required?: boolean;
  size?: "compact" | "large";
  labelClassName?: string;
}) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const triggerId = useId();
  const options = timeOptionsFor(intervalMinutes);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open]);

  // Open the list already scrolled to the current choice.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const selected = listRef.current.querySelector<HTMLElement>(
      '[aria-selected="true"]',
    );
    if (selected) {
      listRef.current.scrollTop = Math.max(0, selected.offsetTop - 70);
    }
  }, [open]);

  const choose = (next: string) => {
    setInner(next);
    onChange?.(next);
    setOpen(false);
  };

  const large = size === "large";
  return (
    <div className="relative" ref={rootRef}>
      {name && <input type="hidden" name={name} value={current} required={required} />}
      <FieldHeader
        label={label}
        htmlFor={triggerId}
        info={info}
        className={
          labelClassName ??
          (large
            ? "text-xs font-bold uppercase tracking-wider text-slate-600"
            : "text-xs font-bold text-slate-700")
        }
      />
      <button
        id={triggerId}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((prev) => !prev)}
        className={`group flex w-full items-center justify-between border bg-white text-left transition-all ${
          large
            ? "mt-2.5 h-[52px] rounded-2xl px-4"
            : "mt-1 rounded-xl px-3 py-2 text-xs"
        } ${
          open
            ? "border-[#092442] ring-4 ring-[#092442]/10"
            : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            className={`grid shrink-0 place-items-center rounded-lg transition-colors ${
              large ? "h-8 w-8" : "h-6 w-6"
            } ${open ? "bg-[#092442] text-amber-300" : "bg-slate-100 text-slate-500 group-hover:bg-amber-50 group-hover:text-amber-700"}`}
          >
            <Clock className={large ? "h-4 w-4" : "h-3.5 w-3.5"} />
          </span>
          <span
            className={`truncate font-bold ${current ? "text-[#071633]" : "font-normal text-slate-400"} ${large ? "text-sm" : "text-xs"}`}
          >
            {current ? formatTimeDisplay(current) : "Choose a time"}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180 text-[#092442]" : ""}`}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          className="absolute left-0 right-0 z-30 mt-2 max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl focus:outline-none"
        >
          <div className="mb-1 border-b border-slate-100 px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            Standard {intervalMinutes}-min intervals
          </div>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {options.map((option) => {
              const selected = current === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => choose(option.value)}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                    selected
                      ? "bg-[#092442] text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span>{option.label}</span>
                  {selected && (
                    <Check className="h-3.5 w-3.5 stroke-[3] text-amber-300" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
