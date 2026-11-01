"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { Overview } from "@/lib/partner/dashboard/domain";
import {
  chartLabelIndices,
  hasFinancialActivity,
} from "@/lib/partner/dashboard/ux";
import { formatPaise } from "@/lib/currency";
const money = (value: number) => formatPaise(value, { withFractions: true });
const date = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00Z`));
const fullDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00Z`));
const dateRange = (start: string, end: string, full = true) => {
  const format = full ? fullDate : date;
  return start === end ? format(start) : `${format(start)} – ${format(end)}`;
};
const names = ["Booking value", "Payments received", "Refunds issued"];
const colors = ["#061224", "#059669", "#d97706"];
export function OverviewFinancialChart({
  data,
  loading,
  period,
  onLastSeven,
}: {
  data?: Overview["series"];
  loading: boolean;
  period: string;
  onLastSeven: () => void;
}) {
  const [mode, setMode] = useState<"chart" | "table">("chart");
  const [selected, setSelected] = useState<{
    key: string;
    source: "pointer" | "keyboard" | "touch";
    data: Overview["series"] | undefined;
  } | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const tooltipId = useId();
  const chart = useRef<HTMLDivElement>(null);
  const pointerFocus = useRef(false);
  const pointerType = useRef("mouse");
  const suppressHover = useRef(false);
  const [width, setWidth] = useState(600);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(240, entry.contentRect.width)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!chart.current?.contains(event.target as Node)) setSelected(null);
    };
    const escape = (event: KeyboardEvent) => {
      pointerFocus.current = false;
      if (event.key === "Escape") {
        suppressHover.current = true;
        setSelected(null);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const points = data ?? [];
  const max = Math.max(
    1,
    ...points.flatMap((p) => [p.bookedPaise, p.paidPaise, p.refundedPaise]),
  );
  const left = 56,
    right = 12,
    top = 12,
    bottom = 40,
    height = 240,
    plot = width - left - right,
    plotHeight = height - top - bottom;
  const slot = plot / Math.max(1, points.length),
    bar = Math.min(18, slot / 5);
  const ticks = chartLabelIndices(points.length, plot);
  const selectedIndex =
    selected?.data === data && !loading
      ? points.findIndex((p) => p.key === selected?.key)
      : -1;
  const current = points[selectedIndex];
  const focusedIndex = Math.max(
    0,
    points.findIndex((p) => p.key === focusKey),
  );
  const tooltipWidth = Math.min(256, width - 32);
  const tooltipX = left + slot * (selectedIndex + 0.5);
  const select = (key: string, source: "pointer" | "keyboard" | "touch") =>
    setSelected((previous) =>
      previous?.key === key &&
      previous.source === source &&
      previous.data === data
        ? previous
        : { key, source, data },
    );
  return (
    <div ref={container} className="mt-4 min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {names.map((name, i) => (
            <span key={name} className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: colors[i] }}
              />
              {name}
            </span>
          ))}
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          {(["chart", "table"] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
                setSelected(null);
              }}
              className={`min-h-11 rounded-lg px-3 text-xs font-semibold capitalize ${mode === value ? "bg-white text-[#061224] shadow-xs" : "text-slate-500"}`}
            >
              {value === "chart" ? "Chart" : "Table"}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div
          role="status"
          aria-label="Loading financial report"
          className="h-56 animate-pulse rounded-2xl bg-slate-100"
        />
      ) : !data ? (
        <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
          Financial report unavailable. Retry the dashboard update.
        </p>
      ) : mode === "table" ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Financial report for {period}</caption>
            <thead className="border-b bg-slate-50">
              <tr>
                {[
                  "Period",
                  ...names,
                  "Net collections",
                  "Room utilization",
                ].map((h) => (
                  <th key={h} className="whitespace-nowrap p-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {points.map((p) => (
                <tr key={p.key}>
                  <th scope="row" className="whitespace-nowrap p-3 font-medium">
                    {dateRange(p.start, p.end, false)}
                  </th>
                  {[
                    p.bookedPaise,
                    p.paidPaise,
                    p.refundedPaise,
                    p.netPaise,
                  ].map((v, i) => (
                    <td className="whitespace-nowrap p-3" key={i}>
                      {money(v)}
                    </td>
                  ))}
                  <td className="p-3">{p.occupancy}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !hasFinancialActivity(points) ? (
        <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
          <h3 className="font-semibold text-[#061224]">
            No financial activity
          </h3>
          <p className="max-w-md text-sm text-slate-500">
            No booking value, payments or refunds recorded for {period}.
          </p>
          <button
            type="button"
            onClick={onLastSeven}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold"
          >
            View last 7 days
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-2">
            <div
              ref={chart}
              className="relative"
              onPointerLeave={() =>
                setSelected((previous) =>
                  previous?.source === "pointer" ? null : previous,
                )
              }
              onBlurCapture={(event) => {
                if (
                  !event.currentTarget.contains(
                    event.relatedTarget as Node | null,
                  )
                )
                  setSelected((previous) =>
                    previous?.source === "keyboard" ? null : previous,
                  );
              }}
            >
              <svg
                role="group"
                aria-label="Booking value, payments received and refunds issued chart"
                viewBox={`0 0 ${width} ${height}`}
                className="block w-full overflow-visible"
              >
                {[0, 0.5, 1].map((ratio) => (
                  <g key={ratio}>
                    <line
                      x1={left}
                      x2={width - right}
                      y1={top + plotHeight * (1 - ratio)}
                      y2={top + plotHeight * (1 - ratio)}
                      stroke="#e2e8f0"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={left - 6}
                      y={top + plotHeight * (1 - ratio) + 4}
                      textAnchor="end"
                      fill="#64748b"
                      fontSize="10"
                    >
                      {new Intl.NumberFormat("en-IN", {
                        style: "currency",
                        currency: "INR",
                        notation: "compact",
                        maximumFractionDigits: 1,
                      }).format((max * ratio) / 100)}
                    </text>
                  </g>
                ))}
                {points.map((point, i) => {
                  const x = left + slot * (i + 0.5),
                    values = [
                      point.bookedPaise,
                      point.paidPaise,
                      point.refundedPaise,
                    ];
                  return (
                    <g
                      key={point.key}
                      role="button"
                      tabIndex={i === focusedIndex ? 0 : -1}
                      aria-label={`${dateRange(point.start, point.end)}: ${values.every((value) => value === 0) ? "No financial activity" : names.map((n, j) => `${n} ${money(values[j])}`).join(", ")}`}
                      aria-describedby={
                        current?.key === point.key ? tooltipId : undefined
                      }
                      onPointerEnter={(event) => {
                        if (
                          event.pointerType !== "touch" &&
                          !suppressHover.current
                        )
                          select(point.key, "pointer");
                      }}
                      onPointerMove={(event) => {
                        if (
                          event.pointerType !== "touch" &&
                          (event.movementX !== 0 || event.movementY !== 0)
                        ) {
                          suppressHover.current = false;
                          select(point.key, "pointer");
                        }
                      }}
                      onPointerDown={(event) => {
                        pointerFocus.current = true;
                        pointerType.current = event.pointerType;
                      }}
                      onPointerUp={() => {
                        pointerFocus.current = false;
                      }}
                      onPointerCancel={() => {
                        pointerFocus.current = false;
                      }}
                      onFocus={() => {
                        setFocusKey(point.key);
                        if (!pointerFocus.current)
                          select(point.key, "keyboard");
                      }}
                      onClick={(event) => {
                        if (event.detail === 0) select(point.key, "keyboard");
                        else if (pointerType.current === "touch")
                          setSelected((previous) =>
                            previous?.key === point.key &&
                            previous.source === "touch"
                              ? null
                              : { key: point.key, source: "touch", data },
                          );
                        else select(point.key, "pointer");
                      }}
                      onKeyDown={(event) => {
                        if (["Enter", " "].includes(event.key)) {
                          event.preventDefault();
                          select(point.key, "keyboard");
                        }
                        if (
                          ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                            event.key,
                          )
                        ) {
                          event.preventDefault();
                          const siblings =
                            event.currentTarget.parentElement?.querySelectorAll<SVGGElement>(
                              '[role="button"]',
                            );
                          siblings?.[
                            event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? points.length - 1
                                : (i +
                                    (event.key === "ArrowRight" ? 1 : -1) +
                                    points.length) %
                                  points.length
                          ]?.focus();
                        }
                      }}
                      className="group cursor-pointer outline-none"
                    >
                      <rect
                        x={left + slot * i + 1}
                        y={top}
                        width={Math.max(1, slot - 2)}
                        height={plotHeight}
                        fill="transparent"
                        rx="3"
                      />
                      {current?.key === point.key && (
                        <line
                          aria-hidden="true"
                          x1={x}
                          x2={x}
                          y1={top}
                          y2={top + plotHeight}
                          stroke="#94a3b8"
                          strokeWidth="1"
                          strokeDasharray="3 4"
                          pointerEvents="none"
                        />
                      )}
                      <line
                        aria-hidden="true"
                        className="opacity-0 group-focus-visible:opacity-100"
                        x1={x - Math.min(16, slot * 0.4)}
                        x2={x + Math.min(16, slot * 0.4)}
                        y1={height - 8}
                        y2={height - 8}
                        stroke="#334155"
                        strokeWidth="2"
                        pointerEvents="none"
                      />
                      {values.map((value, j) => (
                        <rect
                          key={j}
                          x={x + (j - 1) * bar - bar * 0.4}
                          y={top + plotHeight - (value / max) * plotHeight}
                          width={bar * 0.8}
                          height={Math.max(0, (value / max) * plotHeight)}
                          rx="2"
                          fill={colors[j]}
                        />
                      ))}
                      {ticks.has(i) && (
                        <text
                          x={
                            points.length === 1
                              ? x
                              : i === 0
                                ? left
                                : i === points.length - 1
                                  ? width - right
                                  : x
                          }
                          y={height - 14}
                          textAnchor={
                            points.length === 1
                              ? "middle"
                              : i === 0
                                ? "start"
                                : i === points.length - 1
                                  ? "end"
                                  : "middle"
                          }
                          fontSize="11"
                          fill="#475569"
                        >
                          {date(point.start)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
              {current && (
                <div
                  id={tooltipId}
                  role="tooltip"
                  className="absolute top-3 z-10 max-w-[calc(100%-1rem)] rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-lg"
                  style={{
                    width: tooltipWidth,
                    left: `clamp(8px, ${((tooltipX + 14) / width) * 100}%, calc(100% - ${tooltipWidth}px - 8px))`,
                  }}
                >
                  <p className="font-semibold text-slate-900">
                    {dateRange(current.start, current.end)}
                  </p>
                  {[
                    current.bookedPaise,
                    current.paidPaise,
                    current.refundedPaise,
                  ].every((value) => value === 0) ? (
                    <p className="mt-2">No financial activity</p>
                  ) : (
                    <dl className="mt-3 space-y-2.5">
                      {[
                        current.bookedPaise,
                        current.paidPaise,
                        current.refundedPaise,
                      ].map((value, i) => (
                        <div
                          key={names[i]}
                          className="flex items-center justify-between gap-4"
                        >
                          <dt className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: colors[i] }}
                            />
                            {names[i]}
                          </dt>
                          <dd className="font-medium tabular-nums text-slate-900">
                            {money(value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
