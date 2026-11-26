"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BedDouble,
  ChevronRight,
  Clock,
  Globe,
  ReceiptText,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { operationalPolicies } from "@/lib/partner/reservations/operational-policies";
import {
  canAccessSection,
  ConfirmActionDialog,
  errorMessage,
  formatDateTime,
  pmsButton,
  pmsCard,
  pmsCautionButton,
  pmsDangerButton,
  pmsPrimaryButton,
  settingsHref,
  SettingsNoticeBanner,
  stateLabels,
  StatusPill,
  type PmsStatus,
  type SettingsSection,
} from "./settings-shared";

type DirectoryCard = {
  id: Exclude<SettingsSection, "hub">;
  title: string;
  description: string;
  icon: LucideIcon;
  iconBg: string;
  badge?: {
    text: string;
    tone: "emerald" | "amber" | "rose" | "slate" | "gold";
  };
};

export function SettingsHub({
  propertyId,
  data,
}: {
  propertyId: string;
  propertyName?: string;
  data: PmsStatus;
}) {
  const client = useQueryClient();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const owner = data.role === "owner";
  const busy = busyAction !== null;
  const completedCount = data.items.filter((i) => i.complete).length;
  const totalChecks = data.items.length;
  const incompleteCount = totalChecks - completedCount;

  const policies = operationalPolicies(data.operationalPolicies);
  const activePoliciesCount =
    Object.values(policies).filter(Boolean).length +
    (data.allowEarlyWalkIns ? 1 : 0);

  async function send(actionKey: string, body: object) {
    setBusyAction(actionKey);
    setError("");
    setNotice("");
    try {
      const saved = await apiFetch<PmsStatus>(
        `/api/partner/properties/${propertyId}/pms`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (
        saved.inventoryVerification?.checkedAt &&
        !saved.inventoryVerification.passed
      ) {
        setError(
          "Inventory verification found inconsistencies. Review the checklist and contact support before using PMS.",
        );
      } else {
        setNotice("Hotel settings saved.");
      }
      await client.invalidateQueries({ queryKey: ["partner", propertyId] });
      await client.invalidateQueries({ queryKey: ["partner", "shell"] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyAction(null);
      setConfirmDisable(false);
    }
  }

  const pmsDot =
    data.state === "ready"
      ? "bg-emerald-500"
      : data.state === "disabled"
        ? "bg-rose-500"
        : data.state === "setup"
          ? "bg-amber-500"
          : "bg-slate-400";

  const allCards: DirectoryCard[] = [
    {
      id: "finance", title: "Finance Settings",
      description: "View your commercial agreement, commission, guest payment options, payout policy, and dues policy. Managed by HelpKey administrators.",
      icon: ReceiptText, iconBg: "bg-slate-100 text-slate-700 border-slate-200/80",
      badge: { text: "Read only", tone: "slate" },
    },
    {
      id: "pms",
      title: "PMS Setup & Readiness",
      description:
        "Review the 8-item setup checklist, inventory verification history, and opening balance declarations.",
      icon: ShieldCheck,
      iconBg:
        incompleteCount === 0
          ? "bg-emerald-50 text-emerald-700 border-emerald-200/70"
          : "bg-amber-50 text-amber-700 border-amber-200/70",
      badge:
        incompleteCount === 0
          ? { text: `${completedCount}/${totalChecks} Ready`, tone: "emerald" }
          : { text: `${incompleteCount} left`, tone: "amber" },
    },
    {
      id: "policies",
      title: "Operational Policies",
      description:
        "Configure check-in room assignment, clean-room enforcement, guest registration, checkout settlement, and walk-ins.",
      icon: SlidersHorizontal,
      iconBg: "bg-slate-100 text-[#061224] border-slate-200/80",
      badge: {
        text: `${activePoliciesCount} Active`,
        tone: "slate",
      },
    },
    {
      id: "team",
      title: "Team & Access",
      description:
        "Invite hotel staff with verified emails, assign fixed operational roles, manage pending links, and revoke access.",
      icon: Users,
      iconBg: "bg-indigo-50 text-indigo-700 border-indigo-200/70",
      badge: { text: "Staff & Roles", tone: "slate" },
    },
    {
      id: "rooms",
      title: "Room Numbers",
      description:
        "Maintain physical room numbers against sellable capacity, group by room type, and bulk-add number ranges.",
      icon: BedDouble,
      iconBg: "bg-[#fbf5e8] text-[#936c22] border-[#e9ddc1]",
      badge: {
        text: data.items.find((i) => i.id === "register")?.complete
          ? "Complete"
          : "Setup",
        tone: data.items.find((i) => i.id === "register")?.complete
          ? "gold"
          : "amber",
      },
    },
    {
      id: "invoices",
      title: "Invoice & GST Settings",
      description:
        "Configure India GST registration, GSTIN, legal business details, invoice & credit-note numbering series, and history.",
      icon: ReceiptText,
      iconBg: "bg-teal-50 text-teal-700 border-teal-200/70",
      badge: { text: "India GST", tone: "slate" },
    },
    {
      id: "activity",
      title: "Activity & Audit Log",
      description:
        "Inspect chronological records of PMS state changes, policy updates, staff invitations, role edits, and room register changes.",
      icon: Clock,
      iconBg: "bg-slate-100 text-slate-700 border-slate-200/80",
      badge: { text: "Audit Log", tone: "slate" },
    },
  ];
  const cards = allCards.filter((card) => canAccessSection(card.id, data));

  return (
    <div className="space-y-6 pb-10 text-[#061224]">
      {/* Header */}
      <header className="space-y-1 border-b border-slate-200/80 pb-4">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#061224] sm:text-[28px]">
          Hotel settings
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
          Prepare hotel operations independently from your public listing.
        </p>
      </header>

      {owner && <Link href={`/partner/settings/bank?propertyId=${encodeURIComponent(propertyId)}`} className={pmsButton}>Manage payout bank details</Link>}
      {/* Top inline notice / error */}
      <SettingsNoticeBanner
        notice={notice}
        error={error}
        onDismissNotice={() => setNotice("")}
        onDismissError={() => setError("")}
      />

      {/* Action required alert when PMS has a restriction or incomplete items */}
      {(data.reason || (data.activated && incompleteCount > 0)) && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-amber-200/90 bg-[#fbf5e8] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3 min-w-0">
            <AlertTriangle
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#061224]">
                {data.reason
                  ? "PMS operations restricted"
                  : `${incompleteCount} setup item${incompleteCount === 1 ? "" : "s"} need attention`}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-amber-900/90">
                {data.reason ||
                  "Complete the remaining setup checks so staff can operate this hotel in PMS."}
              </p>
            </div>
          </div>
          <Link
            href={settingsHref("pms", propertyId)}
            className={`${pmsPrimaryButton} shrink-0 text-xs`}
          >
            Review setup checklist
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* Live Status Strip — PMS Operations + Public Bookings side-by-side */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* PMS Status Card */}
        <section className={`${pmsCard} flex flex-col justify-between gap-4`}>
          <div className="flex items-start gap-3 min-w-0">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200/80 bg-slate-50 text-[#061224]">
              <ShieldCheck className="h-5 w-5 text-[#c89b3c]" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${pmsDot}`}
                />
                <h2 className="text-base font-bold text-[#061224]">
                  PMS: {stateLabels[data.state]}
                </h2>
              </div>
              {data.inventoryVerification?.checkedAt ? (
                <p className="mt-1 text-xs text-slate-500">
                  Last inventory verification:{" "}
                  {formatDateTime(data.inventoryVerification.checkedAt)} ·{" "}
                  <span
                    className={
                      data.inventoryVerification.passed
                        ? "font-semibold text-emerald-700"
                        : "font-semibold text-rose-700"
                    }
                  >
                    {data.inventoryVerification.passed
                      ? "Passed"
                      : "Needs reconciliation"}
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  Verify shared inventory to confirm operational readiness.
                </p>
              )}
            </div>
          </div>

          {owner ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3.5">
              {data.activated && (
                <button
                  type="button"
                  disabled={busy || !!data.reason}
                  onClick={() => void send("verify", { action: "verify" })}
                  className={pmsButton}
                >
                  {busyAction === "verify" ? "Verifying…" : "Verify inventory"}
                </button>
              )}
              {!data.activated ? (
                <button
                  type="button"
                  disabled={busy || !!data.reason}
                  onClick={() => void send("activate", { action: "activate" })}
                  className={pmsPrimaryButton}
                >
                  {busyAction === "activate" ? "Activating…" : "Activate PMS"}
                </button>
              ) : data.state === "disabled" ? (
                <button
                  type="button"
                  disabled={busy || data.adminDisabled}
                  onClick={() => void send("resume", { action: "resume" })}
                  className={pmsPrimaryButton}
                >
                  {busyAction === "resume" ? "Enabling…" : "Enable PMS"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy || data.adminDisabled}
                  onClick={() => setConfirmDisable(true)}
                  className={pmsDangerButton}
                >
                  Temporarily disable PMS
                </button>
              )}
            </div>
          ) : (
            <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">
              Only the hotel owner can activate PMS or change setup declarations.
            </p>
          )}
        </section>

        {/* Public Bookings Card */}
        <section className={`${pmsCard} flex flex-col justify-between gap-4`}>
          <div className="flex items-start gap-3 min-w-0">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200/80 bg-slate-50 text-[#061224]">
              <Globe className="h-5 w-5 text-slate-600" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    data.marketplace.bookable ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
                <h2 className="text-base font-bold text-[#061224]">
                  Public bookings:{" "}
                  {data.marketplace.bookable ? "Available" : "Unavailable"}
                </h2>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {data.marketplace.reason} PMS availability is managed
                separately.
              </p>
            </div>
          </div>

          {owner ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3.5">
              <button
                type="button"
                className={
                  data.marketplace.ownerPaused
                    ? pmsPrimaryButton
                    : pmsCautionButton
                }
                disabled={busy}
                onClick={() =>
                  void send("marketplace", {
                    action: "marketplace",
                    paused: !data.marketplace.ownerPaused,
                  })
                }
              >
                {busyAction === "marketplace"
                  ? "Updating…"
                  : data.marketplace.ownerPaused
                    ? "Resume public bookings"
                    : "Pause public bookings"}
              </button>
            </div>
          ) : (
            <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">
              Public booking availability is managed by the hotel owner.
            </p>
          )}
        </section>
      </div>

      {/* Settings Directory Grid (3×2 on xl, 2×3 on md, 1×6 on mobile) */}
      <section aria-label="Settings modules" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
            Configuration modules
          </h2>
          <span className="text-xs font-medium text-slate-400">
            {cards.length} {cards.length === 1 ? "section" : "sections"}
          </span>
        </div>

        <nav
          aria-label="Hotel settings"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.id}
                href={settingsHref(card.id, propertyId)}
                className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#c89b3c]/55 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c]"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${card.iconBg}`}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="flex items-center gap-2">
                      {card.badge && (
                        <StatusPill tone={card.badge.tone}>
                          {card.badge.text}
                        </StatusPill>
                      )}
                      <ChevronRight
                        className="h-4 w-4 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[#061224]"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                  <h3 className="mt-4 text-base font-bold text-[#061224] group-hover:text-[#061224]">
                    {card.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                    {card.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </nav>
      </section>

      <ConfirmActionDialog
        open={confirmDisable}
        title="Temporarily disable PMS?"
        description="Disabling PMS immediately pauses internal check-ins, room operations, billing, and staff workflows for this hotel. Public bookings are unaffected and can be managed separately."
        confirmLabel="Disable PMS"
        tone="danger"
        busy={busyAction === "disable"}
        onCancel={() => setConfirmDisable(false)}
        onConfirm={() => void send("disable", { action: "disable" })}
      />
    </div>
  );
}
