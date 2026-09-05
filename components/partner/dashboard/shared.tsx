import { type ReactNode } from "react";
import {
  ChevronRight,
  CircleAlert,
  UsersRound
} from "lucide-react";

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

export function MetricCard({
  icon: Icon,
  title,
  value,
  trend,
  trendType,
}: {
  icon: typeof UsersRound;
  title: string;
  value: string;
  trend: string;
  trendType: "up" | "down" | "attention" | "neutral";
}) {
  const trendClass =
    trendType === "up"
      ? "text-emerald-600"
      : trendType === "down"
        ? "text-red-500"
        : trendType === "attention"
          ? "text-[#c89b3c]"
          : "text-slate-500";

  return (
    <DashboardCard className="p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#fbf5e8] text-[#c89b3c]">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500 truncate">{title}</p>
          <p className="mt-0.5 text-2xl font-bold tracking-tight text-[#061224]">{value}</p>
          <p className={`mt-0.5 text-[11px] font-semibold ${trendClass}`}>{trend}</p>
        </div>
      </div>
    </DashboardCard>
  );
}

export function RevenueOccupancyDualChart() {
  const dates = ["May 18", "May 19", "May 20", "May 21", "May 22", "May 23", "May 24"];
  const revenueHeights = [115, 142, 112, 120, 110, 105, 138]; // in SVG pixels
  const linePoints = [
    { x: 50, y: 70 },   // 64%
    { x: 110, y: 55 },  // 75%
    { x: 170, y: 68 },  // 68%
    { x: 230, y: 62 },  // 70%
    { x: 290, y: 80 },  // 55%
    { x: 350, y: 75 },  // 60%
    { x: 410, y: 48 },  // 82%
  ];

  const pathD = `M ${linePoints.map((p) => `${p.x} ${p.y}`).join(" L ")}`;

  return (
    <div className="h-64 w-full rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-[#fcfbf9] p-4 relative">
      <svg viewBox="0 0 460 210" className="h-full w-full" preserveAspectRatio="none">
        {/* Horizontal grid lines & Y-axis labels */}
        {[30, 70, 110, 150, 190].map((y, index) => {
          const revLabels = ["₹50K", "₹40K", "₹30K", "₹20K", "₹10K"];
          const occLabels = ["100%", "75%", "50%", "25%", "0%"];
          return (
            <g key={y}>
              <text x="5" y={y + 4} className="text-[9px] fill-slate-400 font-medium">
                {revLabels[index]}
              </text>
              <line x1="38" y1={y} x2="422" y2={y} stroke="#e2e8f0" strokeDasharray="3 3" strokeWidth="0.8" />
              <text x="428" y={y + 4} className="text-[9px] fill-slate-400 font-medium">
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
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${colors[tone]}`}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-xs font-bold text-[#061224]">{title}</b>
        <small className="text-[11px] font-semibold text-slate-500">{detail}</small>
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
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${colors[tone]}`}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-xs font-bold text-[#061224]">{title}</b>
        <small className="text-[11px] font-medium text-slate-500 truncate block">{detail}</small>
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
    <span className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold ${colors[tone]}`}>
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
      <b className={positive ? "text-emerald-600 font-bold" : "text-[#061224] font-bold"}>
        {value}
        {icon}
      </b>
    </div>
  );
}
