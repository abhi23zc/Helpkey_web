import { type ReactNode } from "react";
import { ChevronRight, CircleAlert, Info, UsersRound } from "lucide-react";

export function DashboardCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-2xl border border-slate-200/80 bg-[#ffffffba] shadow-[0_4px_16px_rgba(0,0,0,0.03)] ${className}`}
    >
      {children}
    </section>
  );
}

const ACCENT_STYLES = {
  blue: {
    icon: "bg-blue-50 text-blue-600 border-blue-100/60",
  },
  purple: {
    icon: "bg-purple-50 text-purple-600 border-purple-100/60",
  },
  teal: {
    icon: "bg-teal-50 text-teal-600 border-teal-100/60",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-600 border-emerald-100/60",
  },
  rose: {
    icon: "bg-rose-50 text-rose-600 border-rose-200/60",
  },
  amber: {
    icon: "bg-amber-50 text-amber-700 border-amber-200/60",
  },
  gold: {
    icon: "bg-[#fbf5e8] text-[#c89b3c] border-[#f5ebda]",
  },
};

export function MetricCard({
  icon: Icon,
  title,
  value,
  trend,
  trendType = "neutral",
  tooltip,
  isActive,
  accent = "gold",
  loading = false,
}: {
  loading?: boolean;
  icon: typeof UsersRound;
  title: string;
  value: string;
  trend: string;
  trendType?: "up" | "down" | "attention" | "neutral";
  tooltip?: string;
  isActive?: boolean;
  accent?: "blue" | "purple" | "teal" | "emerald" | "rose" | "amber" | "gold";
}) {
  const currentAccent = ACCENT_STYLES[accent] ?? ACCENT_STYLES.gold;

  return (
    <div
      aria-busy={loading}
      className={`group relative h-full min-w-0 rounded-2xl border transition-all duration-200 p-4.5 bg-white ${
        isActive
          ? "border-[#c89b3c] ring-2 ring-[#c89b3c]/20 shadow-xs bg-gradient-to-b from-[#fdfbf7]/60 to-white"
          : "border-slate-200/80 hover:border-slate-300 hover:shadow-xs"
      }`}
    >
      {/* Top Row: Title on Left, Subtle Icon on Right */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500 tracking-tight">
          {title}
          {tooltip && (
            <span
              tabIndex={0}
              role="img"
              aria-label={tooltip}
              onClick={(event) => {
                event.stopPropagation();
                event.currentTarget.focus();
              }}
              onKeyDown={(event) => {
                if (["Enter", " ", "Escape"].includes(event.key)) {
                  event.stopPropagation();
                  event.preventDefault();
                  if (event.key === "Escape")
                    event.currentTarget
                      .closest<HTMLElement>("button,a")
                      ?.focus();
                }
              }}
              className="group/help ml-1 inline-flex align-middle outline-none focus-visible:ring-2 focus-visible:ring-[#b78929]"
            >
              <Info className="h-3.5 w-3.5" />
              <span
                role="tooltip"
                className="pointer-events-none absolute inset-x-0 top-full z-30 mt-2 hidden rounded-xl bg-[#061224] p-3 text-left text-xs font-normal leading-5 text-white shadow-lg group-hover/help:block group-focus/help:block"
              >
                {tooltip}
              </span>
            </span>
          )}
        </span>
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl border text-xs transition-transform duration-200 group-hover:scale-105 ${currentAccent.icon}`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>

      {/* Middle: Prominent Hero Value */}
      <p className="mt-2 break-words text-2xl font-black tracking-tight text-[#061224] [overflow-wrap:anywhere]">
        {loading ? (
          <span
            aria-label="Loading metric"
            className="inline-block h-7 w-20 animate-pulse rounded bg-slate-100"
          />
        ) : (
          value
        )}
      </p>

      {/* Bottom: Clean Subtitle Microcopy */}
      <div className="mt-2 flex min-w-0 items-start leading-5">
        {loading ? (
          <span className="inline-block h-4 w-32 animate-pulse rounded bg-slate-100" />
        ) : trendType === "attention" ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500 animate-pulse" />
            <span>{trend}</span>
          </span>
        ) : trendType === "up" ? (
          <span className="text-xs font-semibold text-emerald-600">
            {trend}
          </span>
        ) : trendType === "down" ? (
          <span className="text-xs font-semibold text-rose-600">{trend}</span>
        ) : (
          <span className="text-xs font-normal text-slate-500">{trend}</span>
        )}
      </div>
    </div>
  );
}

export function RevenueOccupancyDualChart() {
  const dates = [
    "May 18",
    "May 19",
    "May 20",
    "May 21",
    "May 22",
    "May 23",
    "May 24",
  ];
  const revenueHeights = [115, 142, 112, 120, 110, 105, 138]; // in SVG pixels
  const linePoints = [
    { x: 50, y: 70 }, // 64%
    { x: 110, y: 55 }, // 75%
    { x: 170, y: 68 }, // 68%
    { x: 230, y: 62 }, // 70%
    { x: 290, y: 80 }, // 55%
    { x: 350, y: 75 }, // 60%
    { x: 410, y: 48 }, // 82%
  ];

  const pathD = `M ${linePoints.map((p) => `${p.x} ${p.y}`).join(" L ")}`;

  return (
    <div className="h-64 w-full rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-[#fcfbf9] p-4 relative">
      <svg
        viewBox="0 0 460 210"
        className="h-full w-full"
        preserveAspectRatio="none"
      >
        {/* Horizontal grid lines & Y-axis labels */}
        {[30, 70, 110, 150, 190].map((y, index) => {
          const revLabels = ["₹50K", "₹40K", "₹30K", "₹20K", "₹10K"];
          const occLabels = ["100%", "75%", "50%", "25%", "0%"];
          return (
            <g key={y}>
              <text
                x="5"
                y={y + 4}
                className="text-[9px] fill-slate-400 font-medium"
              >
                {revLabels[index]}
              </text>
              <line
                x1="38"
                y1={y}
                x2="422"
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray="3 3"
                strokeWidth="0.8"
              />
              <text
                x="428"
                y={y + 4}
                className="text-[9px] fill-slate-400 font-medium"
              >
                {occLabels[index]}
              </text>
            </g>
          );
        })}

        {/* Revenue Bars */}
        {revenueHeights.map((h, index) => {
          const x = 38 + index * 60;
          return (
            <rect
              key={index}
              x={x}
              y={190 - h}
              width="24"
              height={h}
              rx="3"
              fill="#061224"
            />
          );
        })}

        {/* Occupancy Line & Nodes */}
        <path d={pathD} fill="none" stroke="#c89b3c" strokeWidth="2.5" />
        {linePoints.map((pt, index) => (
          <circle
            key={index}
            cx={pt.x}
            cy={pt.y}
            r="4.5"
            fill="#c89b3c"
            stroke="#ffffff"
            strokeWidth="2"
          />
        ))}

        {/* X Axis Date Labels */}
        {dates.map((date, index) => (
          <text
            key={date}
            x={50 + index * 60}
            y="206"
            textAnchor="middle"
            className="text-[9px] fill-slate-500 font-bold"
          >
            {date}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function OperationItem({
  icon: Icon,
  title,
  detail,
  tone,
}: {
  icon: typeof UsersRound;
  title: string;
  detail: string;
  tone: "blue" | "gold" | "green" | "red";
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    gold: "bg-[#fbf5e8] text-[#c89b3c] border-[#f5ebda]",
    green: "bg-emerald-50 text-emerald-600 border-emerald-100",
    red: "bg-red-50 text-red-500 border-red-100",
  };

  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200/80 p-2.5 text-left hover:bg-[#fcfbf9] transition-colors"
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${colors[tone]}`}
      >
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-xs font-bold text-[#061224]">{title}</b>
        <small className="text-[11px] font-semibold text-slate-500">
          {detail}
        </small>
      </span>
      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
    </button>
  );
}

export function ActionRow({
  icon: Icon,
  title,
  detail,
  tone,
}: {
  icon: typeof CircleAlert;
  title: string;
  detail: string;
  tone: "warning" | "info" | "gold" | "purple";
}) {
  const colors = {
    warning: "bg-amber-50 text-amber-600 border-amber-100",
    info: "bg-blue-50 text-blue-600 border-blue-100",
    gold: "bg-[#fbf5e8] text-[#c89b3c] border-[#f5ebda]",
    purple: "bg-purple-50 text-purple-600 border-purple-100",
  };

  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200/80 p-2.5 text-left hover:bg-[#fcfbf9] transition-colors"
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${colors[tone]}`}
      >
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-xs font-bold text-[#061224]">{title}</b>
        <small className="text-[11px] font-medium text-slate-500 truncate block">
          {detail}
        </small>
      </span>
      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
    </button>
  );
}

export function StatusChip({
  label: itemLabel,
  tone,
}: {
  label: string;
  tone: "green" | "amber" | "blue" | "neutral";
}) {
  const colors = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    neutral: "bg-slate-100 text-slate-600 border-slate-200",
  };

  return (
    <span
      className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold ${colors[tone]}`}
    >
      {itemLabel}
    </span>
  );
}

export function PayoutLine({
  label: itemLabel,
  value,
  positive,
  icon,
}: {
  label: string;
  value: string;
  positive?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-slate-600 font-medium">{itemLabel}</span>
      <b
        className={
          positive ? "text-emerald-600 font-bold" : "text-[#061224] font-bold"
        }
      >
        {value}
        {icon}
      </b>
    </div>
  );
}
