"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Info, RefreshCw, SlidersHorizontal, Sunrise } from "lucide-react";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import {
  operationalPolicies,
  policyLabels,
  type OperationalPolicies,
} from "@/lib/partner/reservations/operational-policies";
import {
  errorMessage,
  pmsButton,
  pmsCard,
  pmsPrimaryButton,
  settingsHref,
  SettingsSubpageHeader,
  StatusPill,
  type PmsStatus,
} from "./settings-shared";

const policyDescriptions: Record<keyof OperationalPolicies, string> = {
  requireAssignedRoom:
    "Staff must assign an active physical room number before marking a guest as checked in.",
  requireCleanRoom:
    "The assigned physical room must be marked clean or inspected before check-in. Requires an assignment independently of the assignment rule.",
  requireGuestRegistration:
    "All adult, child, and infant staying-guest names must match reservation counts before check-in.",
  requireSettledBalance:
    "Bundled reservation charges, credits, payments, and refunds must net to zero before checkout.",
};

export function OperationalPoliciesSection({
  propertyId,
  propertyName,
  data,
}: {
  propertyId: string;
  propertyName?: string;
  data: PmsStatus;
}) {
  return (
    <div className="space-y-6 pb-10 text-[#061224]">
      <SettingsSubpageHeader
        propertyId={propertyId}
        propertyName={propertyName}
        section="policies"
        title="Operational Policies"
        description="Control check-in, housekeeping, guest registration, checkout settlement, and early walk-in enforcement."
        data={data}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,1fr)] xl:items-start">
        <PolicyEditorForm key={propertyId} propertyId={propertyId} data={data} />

        <div className="space-y-6">
          <EarlyWalkInCard
            key={`${propertyId}:${String(data.allowEarlyWalkIns)}:${data.openingData}`}
            propertyId={propertyId}
            data={data}
          />

          <section className={pmsCard}>
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-[#c89b3c]" aria-hidden="true" />
              <h2 className="text-sm font-bold text-[#061224]">
                How enforcement works
              </h2>
            </div>
            <ul className="mt-3 space-y-2.5 text-xs leading-5 text-slate-600">
              <li>
                All policies default to off and take effect immediately for
                subsequent actions on new reservations and existing active
                stays.
              </li>
              <li>
                Name registration is separate from ID documents and
                verification. Historical manual registrations without canonical
                occupant records are evaluated strictly by policy.
              </li>
              <li>
                Reservation balance includes bundled booking charges, credits,
                received payments, refunds, and reserved refunds. Pending online
                payments and separately paid services are excluded.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function PolicyEditorForm({
  propertyId,
  data,
}: {
  propertyId: string;
  data: PmsStatus;
}) {
  const client = useQueryClient();
  const initialPolicies = operationalPolicies(data.operationalPolicies);
  const [draft, setDraft] = useState<OperationalPolicies>(() => initialPolicies);
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState(data.policyRevision ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState("");

  // When the user hasn't edited anything, keep revision aligned with live data.
  const effectiveRevision = dirty ? revision : (data.policyRevision ?? revision);
  const displayedDraft = dirty ? draft : initialPolicies;
  const activeCount = Object.values(displayedDraft).filter(Boolean).length;

  function togglePolicy(key: keyof OperationalPolicies, checked: boolean) {
    const base = dirty ? draft : initialPolicies;
    setDraft({ ...base, [key]: checked });
    setDirty(true);
    setNotice("");
    if (!conflict) setError("");
  }

  async function reloadSaved() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const current = await apiFetch<PmsStatus>(
        `/api/partner/properties/${propertyId}/pms`,
      );
      setDraft(operationalPolicies(current.operationalPolicies));
      setRevision(current.policyRevision ?? 0);
      setDirty(false);
      setConflict(false);
      setNotice("Saved policies loaded. Review before saving.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className={pmsCard}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setNotice("");
        try {
          const saved = await apiFetch<PmsStatus>(
            `/api/partner/properties/${propertyId}/pms`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "operationalPolicies",
                revision: effectiveRevision,
                policies: displayedDraft,
              }),
            },
          );
          const next = operationalPolicies(saved.operationalPolicies);
          setDraft(next);
          setRevision(saved.policyRevision ?? effectiveRevision + 1);
          setDirty(false);
          setConflict(false);
          setNotice("Operational policies saved.");
          await client.invalidateQueries({ queryKey: ["partner", propertyId] });
        } catch (cause) {
          const isConflict =
            cause instanceof ApiClientError &&
            (cause.status === 409 || cause.code === "POLICY_REVISION_CONFLICT");
          setConflict(isConflict);
          setError(errorMessage(cause));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200/80 bg-slate-50 text-[#061224]">
            <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#061224]">
              Operational policies
            </h2>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">
              Toggle the gates your front desk must satisfy at check-in and
              checkout.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <StatusPill tone="gold">Unsaved changes</StatusPill>}
          <StatusPill tone={activeCount > 0 ? "emerald" : "slate"}>
            {activeCount} / 4 active
          </StatusPill>
        </div>
      </div>

      <div className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
        {(Object.keys(policyLabels) as (keyof OperationalPolicies)[]).map(
          (key) => {
            const checked = displayedDraft[key];
            return (
              <label
                key={key}
                className="flex cursor-pointer items-start justify-between gap-4 py-4 transition-colors hover:bg-slate-50/60 sm:px-2 sm:-mx-2 sm:rounded-xl"
              >
                <div className="min-w-0">
                  <span className="block text-sm font-semibold text-[#061224]">
                    {policyLabels[key]}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    {policyDescriptions[key]}
                  </span>
                </div>
                <span className="relative mt-0.5 inline-flex shrink-0 items-center">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busy}
                    onChange={(e) => togglePolicy(key, e.target.checked)}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className="h-6 w-11 rounded-full bg-slate-200 transition-colors duration-200 peer-checked:bg-[#061224] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#c89b3c] peer-disabled:opacity-50"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-xs transition-transform duration-200 peer-checked:translate-x-5"
                  />
                </span>
              </label>
            );
          },
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-800"
        >
          {error} Your draft is retained.
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-800"
        >
          {notice}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="submit"
          className={`${pmsPrimaryButton} w-full sm:w-auto`}
          disabled={busy || conflict}
        >
          {busy ? "Saving…" : "Save operational policies"}
        </button>
        <button
          type="button"
          className={`${pmsButton} w-full sm:w-auto`}
          disabled={busy}
          onClick={() => void reloadSaved()}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Reload saved policies (replaces draft)
        </button>
      </div>
    </form>
  );
}

function EarlyWalkInCard({
  propertyId,
  data,
}: {
  propertyId: string;
  data: PmsStatus;
}) {
  const client = useQueryClient();
  const [early, setEarly] = useState(data.allowEarlyWalkIns === true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const hasOpeningAnswer =
    data.openingData === "none" || data.openingData === "external";

  async function saveWalkIn(next: boolean) {
    setEarly(next);
    if (!hasOpeningAnswer) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiFetch<PmsStatus>(`/api/partner/properties/${propertyId}/pms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "declaration",
          openingData: data.openingData,
          teamReviewed: data.teamReviewed,
          allowEarlyWalkIns: next,
        }),
      });
      setNotice(
        next
          ? "Early overnight walk-ins enabled."
          : "Early overnight walk-ins disabled.",
      );
      await client.invalidateQueries({ queryKey: ["partner", propertyId] });
    } catch (cause) {
      setEarly(data.allowEarlyWalkIns === true);
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={pmsCard}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#e9ddc1] bg-[#fbf5e8] text-[#936c22]">
            <Sunrise className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#061224]">
              Early overnight walk-ins
            </h2>
            <p className="text-xs text-slate-500">
              Arrivals before standard hotel check-in time
            </p>
          </div>
        </div>
        <StatusPill tone={early ? "emerald" : "slate"}>
          {early ? "Allowed" : "Off"}
        </StatusPill>
      </div>

      {hasOpeningAnswer ? (
        <label className="mt-4 flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
          <span className="text-xs leading-5 text-slate-700">
            Allow overnight walk-ins before standard check-in. Charge full
            current-date nights; show checkout explicitly. Never book the
            previous night.
          </span>
          <span className="relative mt-0.5 inline-flex shrink-0 items-center">
            <input
              type="checkbox"
              checked={early}
              disabled={busy}
              onChange={(e) => void saveWalkIn(e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="h-6 w-11 rounded-full bg-slate-200 transition-colors duration-200 peer-checked:bg-[#061224] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#c89b3c] peer-disabled:opacity-50"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-xs transition-transform duration-200 peer-checked:translate-x-5"
            />
          </span>
        </label>
      ) : (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs leading-5 text-amber-900">
          Complete opening declarations in{" "}
          <Link
            href={settingsHref("pms", propertyId)}
            className="font-bold underline"
          >
            PMS Setup &amp; Readiness
          </Link>{" "}
          to configure early overnight walk-ins.
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs font-medium text-rose-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-xs font-medium text-emerald-700">
          {notice}
        </p>
      )}
    </section>
  );
}
