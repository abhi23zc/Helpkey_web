import type { ButtonHTMLAttributes, ReactNode } from "react";
import { label } from "./types";

/* ---------- Buttons ---------- */

export type ButtonVariant = "primary" | "secondary" | "gold" | "success" | "danger";

const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-[10px] border px-3.5 py-2 text-[13px] font-semibold " +
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "border-navy-950 bg-navy-950 text-white hover:bg-navy-900",
  secondary: "border-slate-300 bg-white text-navy-950 hover:bg-slate-50",
  gold: "border-gold-500 bg-white text-gold-700 hover:bg-gold-100",
  success: "border-success bg-success text-white hover:bg-success-ink",
  danger: "border-red-300 bg-white text-danger-ink hover:bg-danger-bg",
};

export const buttonClass = (variant: ButtonVariant = "secondary", extra = "") =>
  `${buttonBase} ${buttonVariants[variant]} ${extra}`.trim();

export function Button({ variant = "secondary", className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}

export const inputClass =
  "mt-1 w-full rounded-[10px] border border-line bg-white px-3 py-2 text-sm text-ink outline-none " +
  "focus:border-gold-600 focus:ring-2 focus:ring-gold-500/25";

/* ---------- Status chips ---------- */

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const toneClass: Record<Tone, string> = {
  success: "border-success/25 bg-success-bg text-success-ink",
  warning: "border-warning/40 bg-warning-bg text-warning-ink",
  danger: "border-danger/25 bg-danger-bg text-danger-ink",
  info: "border-info/25 bg-info-bg text-info-ink",
  neutral: "border-line bg-white text-muted",
};

const statusTones: Record<string, Tone> = {
  approved: "success", active: "success", published: "success", verified: "success",
  pending: "warning", pending_review: "warning", changes_requested: "warning", paused: "warning",
  rejected: "danger", failed: "danger", suspended: "danger",
  queued: "info", processing: "info", unpublishing: "info",
};

export const statusTone = (value: unknown): Tone => statusTones[String(value ?? "")] ?? "neutral";

/** Status text is always shown (never colour alone) so it stays readable for everyone. */
export function StatusChip({ value, tone, children }: { value?: unknown; tone?: Tone; children?: ReactNode }) {
  const resolved = tone ?? statusTone(value);
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneClass[resolved]}`}>
      {children ?? label(String(value ?? "unknown"))}
    </span>
  );
}

/** Small count pill used inside tabs and buttons. */
export function CountPill({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`rounded-full border px-1.5 py-px text-[11px] font-bold leading-4 ${toneClass[tone]}`}>{children}</span>;
}

/* ---------- Surfaces ---------- */

export function Card({ title, subtitle, action, children, className = "" }: { title?: string; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-[18px] border border-line bg-white p-5 shadow-card ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="text-base font-bold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

const noticeClass: Record<Exclude<Tone, "neutral">, string> = {
  success: "border-success/25 bg-success-bg text-success-ink",
  warning: "border-warning/40 bg-warning-bg text-warning-ink",
  danger: "border-danger/25 bg-danger-bg text-danger-ink",
  info: "border-info/25 bg-info-bg text-info-ink",
};

export function Notice({ tone, children, action }: { tone: Exclude<Tone, "neutral">; children: ReactNode; action?: ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm ${noticeClass[tone]}`}>
      <div className="min-w-0">{children}</div>
      {action}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-ivory-50/60 px-4 py-8 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-[13px] text-muted">{children}</p>}
    </div>
  );
}

/* ---------- Key facts ---------- */

export function Facts({ children, columns = 2 }: { children: ReactNode; columns?: 1 | 2 }) {
  return <dl className={`grid gap-x-6 gap-y-3 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>{children}</dl>;
}

export function Fact({ label: name, children }: { label: string; children?: ReactNode }) {
  const empty = children === undefined || children === null || children === "" || children === false;
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted">{name}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-ink">{empty ? <span className="font-normal text-slate-400">Not provided</span> : children}</dd>
    </div>
  );
}

export function Chips({ items, empty = "None" }: { items: string[]; empty?: string }) {
  if (!items.length) return <span className="font-normal text-slate-400">{empty}</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map(item => (
        <li key={item} className="rounded-full border border-line bg-ivory-50 px-2.5 py-0.5 text-xs font-medium text-ink">{item}</li>
      ))}
    </ul>
  );
}
