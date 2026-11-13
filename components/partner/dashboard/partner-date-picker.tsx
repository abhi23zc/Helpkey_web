"use client";
import { useEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import { DayPicker, type DateRange } from "react-day-picker";
import { CalendarDays, X } from "lucide-react";
import "react-day-picker/style.css";
import { validDate } from "@/lib/booking/domain";
const parse = (s?: string) =>
  s && validDate(s) ? new Date(`${s}T12:00:00`) : undefined;
const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
type Props = {
  displayLabel?: string;
  description?: string;
  value: string;
  endValue?: string;
  range?: boolean;
  onChange: (event: { target: { value: string } }) => void;
  onRangeChange?: (from: string, to: string) => void;
  maxDays?: number;
  min?: string;
  max?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  timezone?: string;
  "aria-label"?: string;
};
export function PartnerDatePicker(props: Props) {
  const [open, setOpen] = useState(false),
    [selectingEnd, setSelectingEnd] = useState(false),
    [draft, setDraft] = useState<DateRange>(),
    [month, setMonth] = useState<Date>(),
    [calendarToday, setCalendarToday] = useState<Date>(),
    [mobile, setMobile] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const media = matchMedia("(max-width: 639px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() =>
      panel.current?.querySelector<HTMLElement>("button")?.focus(),
    );
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
      }
      if (e.key === "Tab") {
        const items = Array.from(
          panel.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), [tabindex='0']",
          ) || [],
        ).filter((el) => el.getClientRects().length);
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
        e.stopImmediatePropagation();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", handler, true);
    };
  }, [open]);
  const hotelToday = () => {
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: props.timezone || "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    return parse(date)!;
  };
  const today = () => {
    const d = hotelToday();
    setDraft({ from: d, to: d });
    setMonth(d);
  };
  const label =
    props["aria-label"] || (props.range ? "Choose date range" : "Choose date");
  const display = (s: string) =>
    parse(s)?.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) || "Select date";
  const count =
    draft?.from && draft.to
      ? Math.round(
          (Date.UTC(
            draft.to.getFullYear(),
            draft.to.getMonth(),
            draft.to.getDate(),
          ) -
            Date.UTC(
              draft.from.getFullYear(),
              draft.from.getMonth(),
              draft.from.getDate(),
            )) /
            86400000,
        ) + 1
      : 1;
  const invalid =
    !draft?.from ||
    (props.range && !draft.to) ||
    (!!props.maxDays && count > props.maxDays) ||
    (!!props.min && key(draft.from!) < props.min) ||
    (!!props.max && key(draft?.to || draft?.from || new Date()) > props.max);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        disabled={props.disabled}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-[#061224] shadow-xs transition hover:border-[#c89b3c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c] disabled:opacity-50 ${props.className || ""}`}
        onClick={() => {
          setDraft({
            from: parse(props.value),
            to: parse(props.endValue || props.value),
          });
          setCalendarToday(hotelToday());
          setMonth(parse(props.value) || hotelToday());
          setSelectingEnd(false);
          setOpen(true);
        }}
      >
        <span>
          {props.displayLabel || display(props.value)}
          {!props.displayLabel && props.range && props.endValue
            ? ` – ${display(props.endValue)}`
            : ""}
        </span>
        <CalendarDays size={16} className="shrink-0 text-slate-400" />
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[150] flex items-center justify-center bg-[#061224]/30 p-3 backdrop-blur-[2px]"
            onClick={(e) => {
              e.stopPropagation();
              if (e.target === e.currentTarget) close();
            }}
          >
            <div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="partner-calendar max-h-[92dvh] w-fit max-w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-[#061224] shadow-2xl sm:p-6"
            >
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <h2 id={titleId} className="text-lg font-bold">
                    {label}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {props.range
                      ? `Select a start and end date${props.maxDays ? ` · Up to ${props.maxDays} days` : ""}`
                      : props.description || "Select the reporting date"}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close date picker"
                  onClick={close}
                  className="rounded-lg p-2 hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>
              {props.range ? (
                <DayPicker
                  today={calendarToday}
                  mode="range"
                  selected={draft}
                  onSelect={(_selection, day) => {
                    if (!selectingEnd || !draft?.from) {
                      setDraft({ from: day, to: undefined });
                      setSelectingEnd(true);
                    } else {
                      setDraft(
                        day < draft.from
                          ? { from: day, to: draft.from }
                          : { from: draft.from, to: day },
                      );
                      setSelectingEnd(false);
                    }
                  }}
                  month={month}
                  onMonthChange={setMonth}
                  numberOfMonths={mobile ? 1 : 2}
                  disabled={[
                    ...(props.min ? [{ before: parse(props.min)! }] : []),
                    ...(props.max ? [{ after: parse(props.max)! }] : []),
                  ]}
                />
              ) : (
                <DayPicker
                  today={calendarToday}
                  mode="single"
                  selected={draft?.from}
                  onSelect={(d) => setDraft(d ? { from: d, to: d } : undefined)}
                  month={month}
                  onMonthChange={setMonth}
                  numberOfMonths={mobile ? 1 : 2}
                  disabled={[
                    ...(props.min ? [{ before: parse(props.min)! }] : []),
                    ...(props.max ? [{ after: parse(props.max)! }] : []),
                  ]}
                />
              )}
              {props.maxDays && count > props.maxDays && (
                <p role="alert" className="mt-2 text-sm text-rose-700">
                  Choose a range of up to {props.maxDays} days.
                </p>
              )}
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={today}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                >
                  Today
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-xl px-3 py-2 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={invalid}
                    className="rounded-xl bg-[#061224] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    onClick={() => {
                      if (!invalid && draft?.from) {
                        if (props.range)
                          props.onRangeChange?.(
                            key(draft.from),
                            key(draft.to!),
                          );
                        else
                          props.onChange({
                            target: { value: key(draft.from) },
                          });
                        close();
                      }
                    }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
