"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  BedDouble,
  CheckCircle2,
  Clock,
  ReceiptText,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import type { SetupItem } from "@/lib/partner/pms/domain";
import type { OperationalPolicies } from "@/lib/partner/reservations/operational-policies";

export type SettingsSection =
  | "finance"
  | "hub"
  | "pms"
  | "policies"
  | "team"
  | "rooms"
  | "invoices"
  | "activity";

export const pmsButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200/90 bg-white px-4 py-2 text-sm font-semibold text-[#061224] shadow-2xs transition-all duration-150 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer whitespace-nowrap";

export const pmsPrimaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#061224] px-4 py-2 text-sm font-semibold text-white shadow-xs transition-all duration-150 hover:bg-[#0d2240] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer whitespace-nowrap";

export const pmsDangerButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-2 text-sm font-semibold text-rose-700 shadow-2xs transition-all duration-150 hover:border-rose-300 hover:bg-rose-100/80 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer whitespace-nowrap";

export const pmsCautionButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-2 text-sm font-semibold text-amber-900 shadow-2xs transition-all duration-150 hover:border-amber-300 hover:bg-amber-100/80 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer whitespace-nowrap";

export const pmsInput =
  "min-h-11 w-full min-w-0 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-sm font-medium text-[#061224] placeholder:text-slate-400 outline-none transition-colors focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

export const pmsCard =
  "rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-2xs";

export type PmsStatus = {
  propertyId?: string;
  propertyName?: string;
  state: "not_activated" | "setup" | "ready" | "disabled";
  role: string;
  permissions?: readonly string[];
  activated: boolean;
  reason: string | null;
  items: SetupItem[];
  openingData: string;
  teamReviewed: boolean;
  allowEarlyWalkIns?: boolean;
  operationalPolicies?: OperationalPolicies;
  policyRevision?: number;
  adminDisabled: boolean;
  inventoryVerification?: { passed: boolean; checkedAt: string | null };
  marketplace: { bookable: boolean; ownerPaused: boolean; reason: string };
};

export type TeamData = {
  members: {
    userId: string;
    name: string;
    email: string | null;
    role: string;
    status: string;
  }[];
  invitations: {
    id: string;
    email: string;
    role: string;
    status: string;
    expiresAt: string;
  }[];
  events: {
    id: string;
    actorId?: string;
    actorName: string;
    type: string;
    targetId: string;
    before?: unknown;
    after?: unknown;
    createdAt: string | null;
  }[];
  nextCursor: string | null;
};

export const stateLabels = {
  not_activated: "Not activated",
  setup: "Setup in progress",
  ready: "Ready to use",
  disabled: "Temporarily disabled",
} as const;

export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to save. Please retry.";
}

export function hotelHref(href: string, id: string) {
  const [path, query] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("propertyId", id);
  return `${path}?${params}`;
}

export function settingsHref(section: SettingsSection, propertyId: string) {
  const path =
    section === "hub" ? "/partner/settings" : `/partner/settings/${section}`;
  return hotelHref(path, propertyId);
}

export function formatRoleLabel(role: string) {
  if (role === "maintenance") return "Maintenance staff";
  return role ? role[0].toUpperCase() + role.slice(1) : "Staff";
}

export function toInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const letters =
    parts.length === 1
      ? parts[0].slice(0, 2)
      : `${parts[0][0]}${parts[parts.length - 1][0]}`;
  return letters.toUpperCase();
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function formatShortDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function usePmsStatus(propertyId: string) {
  return useQuery({
    queryKey: ["partner", propertyId, "pms"],
    queryFn: ({ signal }) =>
      apiFetch<PmsStatus>(`/api/partner/properties/${propertyId}/pms`, {
        signal,
      }),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

export function canAccessSection(
  section: SettingsSection,
  data: Pick<PmsStatus, "role" | "permissions">,
) {
  const owner = data.role === "owner";
  const has = (perm: string) =>
    owner || Boolean(data.permissions?.includes(perm));
  switch (section) {
    case "finance":
      return owner;
    case "hub":
    case "pms":
      return true;
    case "policies":
      return has("setup.manage");
    case "team":
    case "activity":
      return has("team.manage");
    case "rooms":
      return has("rooms.manage");
    case "invoices":
      return (
        has("invoice.settings") || ["owner", "manager"].includes(data.role)
      );
  }
}

export const SETTINGS_NAV_META = [
  { id: "finance" as const, label: "Finance Settings", icon: ReceiptText },
  {
    id: "pms" as const,
    label: "PMS Setup",
    icon: ShieldCheck,
  },
  {
    id: "policies" as const,
    label: "Policies",
    icon: SlidersHorizontal,
  },
  {
    id: "team" as const,
    label: "Team",
    icon: Users,
  },
  {
    id: "rooms" as const,
    label: "Rooms",
    icon: BedDouble,
  },
  {
    id: "invoices" as const,
    label: "Invoices",
    icon: ReceiptText,
  },
  {
    id: "activity" as const,
    label: "Activity",
    icon: Clock,
  },
];

export function StatusPill({
  tone,
  children,
}: {
  tone: "emerald" | "amber" | "rose" | "slate" | "gold";
  children: ReactNode;
}) {
  const styles = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    slate: "border-slate-200 bg-slate-100/80 text-slate-700",
    gold: "border-[#e9ddc1] bg-[#fbf5e8] text-[#805b18]",
  }[tone];
  const dot = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    slate: "bg-slate-400",
    gold: "bg-[#c89b3c]",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${styles}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export function SettingsNoticeBanner({
  notice,
  error,
  onDismissNotice,
  onDismissError,
}: {
  notice?: string;
  error?: string;
  onDismissNotice?: () => void;
  onDismissError?: () => void;
}) {
  if (!notice && !error) return null;
  return (
    <div className="space-y-2.5">
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-rose-600"
              aria-hidden="true"
            />
            <span className="break-words">{error}</span>
          </div>
          {onDismissError && (
            <button
              type="button"
              onClick={onDismissError}
              aria-label="Dismiss error"
              className="shrink-0 rounded-lg p-1 text-rose-600 hover:bg-rose-100 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
              aria-hidden="true"
            />
            <span className="break-words">{notice}</span>
          </div>
          {onDismissNotice && (
            <button
              type="button"
              onClick={onDismissNotice}
              aria-label="Dismiss notice"
              className="shrink-0 rounded-lg p-1 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function SettingsSubpageHeader({
  propertyId,
  section,
  title,
  description,
  data,
  actions,
  hideHeading = false,
}: {
  propertyId: string;
  propertyName?: string;
  section: Exclude<SettingsSection, "hub">;
  title: string;
  description: string;
  data: PmsStatus;
  actions?: ReactNode;
  hideHeading?: boolean;
}) {
  const permittedNav = SETTINGS_NAV_META.filter((item) =>
    canAccessSection(item.id, data),
  );
  return (
    <header className="space-y-3 border-b border-slate-200/80 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={settingsHref("hub", propertyId)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-[#061224] shadow-2xs transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Hotel settings
        </Link>

        {permittedNav.length > 1 && (
          <nav
            aria-label="Hotel settings"
            className="hidden items-center gap-1 rounded-xl border border-slate-200/80 bg-white/90 p-1 shadow-2xs lg:inline-flex"
          >
            {permittedNav.map(({ id, label, icon: Icon }) => {
              const active = section === id;
              return (
                <Link
                  key={id}
                  href={settingsHref(id, propertyId)}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c] ${
                    active
                      ? "bg-[#061224] text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-100/80 hover:text-[#061224]"
                  }`}
                >
                  <Icon
                    className={`h-3.5 w-3.5 ${active ? "text-[#c89b3c]" : "text-slate-400"}`}
                    aria-hidden="true"
                  />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      {!hideHeading && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#061224] sm:text-[26px]">
              {title}
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
              {description}
            </p>
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {actions}
            </div>
          )}
        </div>
      )}
    </header>
  );
}

export function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "danger" | "caution";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Close confirmation"
        disabled={busy}
        onClick={onCancel}
        className="absolute inset-0 bg-[#061224]/50 backdrop-blur-xs"
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-[#061224]">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {description}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2.5">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className={pmsButton}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={
              tone === "danger"
                ? "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                : "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
            }
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
