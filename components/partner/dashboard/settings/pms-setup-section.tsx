"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  ShieldCheck,
} from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import {
  ConfirmActionDialog,
  errorMessage,
  formatDateTime,
  hotelHref,
  pmsButton,
  pmsCard,
  pmsDangerButton,
  pmsInput,
  pmsPrimaryButton,
  SettingsNoticeBanner,
  SettingsSubpageHeader,
  stateLabels,
  StatusPill,
  type PmsStatus,
} from "./settings-shared";

export function PmsSetupSection({
  propertyId,
  propertyName,
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
  const totalCount = data.items.length;
  const pct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

  // Pin incomplete items to top so owners immediately see what needs action.
  const orderedItems = [
    ...data.items.filter((i) => !i.complete),
    ...data.items.filter((i) => i.complete),
  ];

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

  return (
    <div className="space-y-6 pb-10 text-[#061224]">
      <SettingsSubpageHeader
        propertyId={propertyId}
        propertyName={propertyName}
        section="pms"
        title="PMS Setup & Readiness"
        description="Complete every operational prerequisite, verify shared inventory, and confirm opening balances."
        data={data}
      />

      <SettingsNoticeBanner
        notice={notice}
        error={error}
        onDismissNotice={() => setNotice("")}
        onDismissError={() => setError("")}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)] xl:items-start">
        {/* Left: Setup Checklist */}
        <section className={pmsCard}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#061224]">
                Setup checklist
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                All {totalCount} checks must pass for PMS to reach Ready status.
              </p>
            </div>
            <StatusPill tone={completedCount === totalCount ? "emerald" : "amber"}>
              {completedCount} / {totalCount} complete · {pct}%
            </StatusPill>
          </div>

          <div
            className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Setup readiness progress"
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                pct === 100 ? "bg-emerald-500" : "bg-[#c89b3c]"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>

          <ul className="mt-5 divide-y divide-slate-100">
            {orderedItems.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 py-4 first:pt-2 last:pb-1 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex items-start gap-3 min-w-0">
                  {item.complete ? (
                    <CheckCircle2
                      className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
                      aria-hidden="true"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[#061224]">
                        {item.label}
                      </p>
                      <span
                        className={`text-xs font-semibold ${
                          item.complete ? "text-emerald-700" : "text-amber-700"
                        }`}
                      >
                        · {item.complete ? "Complete" : "Needs attention"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {item.detail}
                    </p>
                  </div>
                </div>
                {owner && item.href && (
                  <Link
                    href={hotelHref(item.href, propertyId)}
                    className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 self-start rounded-xl px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c] ${
                      item.complete
                        ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        : "bg-[#061224] text-white hover:bg-[#0d2240]"
                    }`}
                  >
                    {item.complete ? "Review setup" : "Fix setup"}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Right Rail: PMS Status Control + Opening Information */}
        <div className="space-y-6">
          <section className={pmsCard}>
            <div className="flex items-center gap-2.5">
              <ShieldCheck
                className="h-5 w-5 text-[#c89b3c]"
                aria-hidden="true"
              />
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${pmsDot}`}
              />
              <h2 className="text-base font-bold text-[#061224]">
                PMS: {stateLabels[data.state]}
              </h2>
            </div>

            {data.inventoryVerification?.checkedAt && (
              <p className="mt-3 text-xs text-slate-500">
                Last inventory verification:{" "}
                <strong className="font-semibold text-slate-700">
                  {formatDateTime(data.inventoryVerification.checkedAt)}
                </strong>{" "}
                ·{" "}
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
            )}

            {data.reason && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium leading-5 text-amber-900"
              >
                {data.reason}
              </p>
            )}

            {owner ? (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
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
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Only the hotel owner can activate PMS or change setup
                declarations. Ask your owner to resolve incomplete items.
              </p>
            )}
          </section>

          {owner && (
            <DeclarationsCard
              key={`${propertyId}:${data.openingData}:${data.teamReviewed}:${String(data.allowEarlyWalkIns)}`}
              data={data}
              busy={busy}
              save={(body) => send("declaration", body)}
            />
          )}
        </div>
      </div>

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

function DeclarationsCard({
  data,
  busy,
  save,
}: {
  data: PmsStatus;
  busy: boolean;
  save: (body: object) => Promise<void>;
}) {
  const [opening, setOpening] = useState(data.openingData);
  const [reviewed, setReviewed] = useState(data.teamReviewed);
  const [early, setEarly] = useState(data.allowEarlyWalkIns === true);
  const confirmed = data.openingData === "none" && data.teamReviewed;

  return (
    <form
      className={pmsCard}
      onSubmit={(e) => {
        e.preventDefault();
        void save({
          action: "declaration",
          openingData: opening,
          teamReviewed: reviewed,
          allowEarlyWalkIns: early,
        });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-[#061224]">
          Confirm opening information
        </h2>
        <StatusPill tone={confirmed ? "emerald" : "amber"}>
          {confirmed ? "Confirmed" : "Required"}
        </StatusPill>
      </div>

      <label className="mt-4 block text-sm font-medium text-[#061224]">
        <span>
          Does this hotel have reservations or balances outside Helpkey to bring
          across?
        </span>
        <select
          required
          disabled={busy}
          value={opening}
          onChange={(e) => setOpening(e.target.value)}
          className={`${pmsInput} mt-2`}
        >
          <option value="unknown">Choose an answer</option>
          <option value="none">
            No — all required information is already in Helpkey, or this is a
            new hotel
          </option>
          <option value="external">
            Yes — external reservations or balances need reconciliation
          </option>
        </select>
      </label>

      <p className="mt-2 text-xs leading-5 text-slate-500">
        External reservation import is currently unavailable. Selecting external
        opening information keeps setup incomplete until reconciled.
      </p>

      <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
        <label className="flex items-start gap-3 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            disabled={busy}
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#061224]"
          />
          <span className="leading-snug">
            I reviewed the hotel team, or I operate this hotel alone.
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={early}
            disabled={busy}
            onChange={(e) => setEarly(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#061224]"
          />
          <span className="leading-snug">
            Allow overnight walk-ins before standard check-in. Charge full
            current-date nights; show checkout explicitly. Never book the
            previous night.
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={busy || opening === "unknown"}
        className={`${pmsPrimaryButton} mt-5 w-full sm:w-auto`}
      >
        {busy ? "Saving…" : "Save opening information"}
      </button>
    </form>
  );
}
