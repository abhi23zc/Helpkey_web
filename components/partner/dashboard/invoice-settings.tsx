"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileSignature,
  Hash,
  History,
  Info,
  Lock,
  RotateCcw,
} from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import type { InvoiceSettings } from "@/lib/partner/invoices/domain";
import type { readSettings } from "@/lib/partner/invoices/service";
import {
  errorMessage,
  formatDateTime,
  pmsButton,
  pmsCard,
  pmsInput,
  pmsPrimaryButton,
  settingsHref,
  StatusPill,
  type PmsStatus,
} from "./settings/settings-shared";

export const invoiceButton = pmsPrimaryButton;
export const invoiceField = pmsInput;

const defaults = {
  country: "IN",
  legalName: "",
  address: "",
  state: "",
  stateCode: "",
  contact: "",
  registration: "unregistered",
  gstin: "",
  irpRequired: false,
  accountantConfirmed: true,
  invoiceSeries: "INV",
  creditSeries: "CN",
  invoiceStart: 1,
  creditStart: 1,
  signatory: "",
  signatoryDesignation: "",
  footer: "",
} satisfies InvoiceSettings;

type SettingsPayload = Awaited<ReturnType<typeof readSettings>>;

function currentFinancialYearCode() {
  const now = new Date();
  const y = now.getFullYear();
  const start = now.getMonth() + 1 >= 4 ? y : y - 1;
  return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`;
}

export function InvoiceSettingsEditor({
  propertyId,
  pmsStatus,
}: {
  propertyId: string;
  pmsStatus?: PmsStatus;
}) {
  const base = `/api/partner/properties/${propertyId}/invoice-settings`;
  const storage = `invoice-settings:${propertyId}`;
  const query = useQuery({
    queryKey: ["partner", propertyId, "invoice-settings"],
    queryFn: ({ signal }) => apiFetch<SettingsPayload>(base, { signal }),
  });

  if (query.isPending) {
    return (
      <div className={pmsCard} role="status">
        <p className="text-sm font-medium text-slate-500">
          Loading invoice settings…
        </p>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-medium text-rose-800"
      >
        <span>{errorMessage(query.error)}</span>
        <button
          type="button"
          className={pmsButton}
          onClick={() => void query.refetch()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <SettingsForm
      key={propertyId}
      propertyId={propertyId}
      base={base}
      storage={storage}
      query={query}
      data={query.data}
      pmsStatus={pmsStatus}
    />
  );
}

function SettingsForm({
  propertyId,
  base,
  storage,
  query,
  data,
  pmsStatus,
}: {
  propertyId: string;
  base: string;
  storage: string;
  query: {
    refetch: () => Promise<{ data?: SettingsPayload }>;
  };
  data: SettingsPayload;
  pmsStatus?: PmsStatus;
}) {
  const [restored] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storage) || "null") as {
        draft: InvoiceSettings;
        revision: number;
      } | null;
    } catch {
      return null;
    }
  });

  const [hasDraftBanner, setHasDraftBanner] = useState(Boolean(restored));
  const [draft, setDraft] = useState<InvoiceSettings>(
    restored?.draft ?? data.settings ?? defaults,
  );
  const [revision, setRevision] = useState(restored?.revision ?? data.revision);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const locked = data.used === true;
  const pmsNotReady = Boolean(pmsStatus && pmsStatus.state !== "ready");
  const fyCode = currentFinancialYearCode();
  const invoicePreview = `${draft.invoiceSeries || "INV"}/${fyCode}/${draft.invoiceStart || 1}`;
  const creditPreview = `${draft.creditSeries || "CN"}/${fyCode}/${draft.creditStart || 1}`;

  function update(value: InvoiceSettings) {
    setDraft(value);
    setNotice("");
    try {
      sessionStorage.setItem(storage, JSON.stringify({ draft: value, revision }));
    } catch {
      /* Ignore storage quota issues. */
    }
  }

  function discardDraft() {
    try {
      sessionStorage.removeItem(storage);
    } catch {
      /* Ignore storage errors. */
    }
    setDraft(data.settings ?? defaults);
    setRevision(data.revision);
    setHasDraftBanner(false);
    setError("");
    setNotice("Unsaved local draft discarded.");
  }

  return (
    <div className="space-y-6">
      {/* Context Banners */}
      <div className="rounded-2xl border border-[#e9ddc1] bg-[#fbf5e8] px-4 py-3.5 text-xs leading-5 text-amber-950">
        <div className="flex items-start gap-2.5">
          <Info
            className="mt-0.5 h-4 w-4 shrink-0 text-[#936c22]"
            aria-hidden="true"
          />
          <p>
            India only. Ask your accountant to confirm registration and the
            requirements that apply to your hotel. Registration is not
            determined from booking values. Financial years follow April–March
            in the hotel timezone. Dates are assigned when issued.
          </p>
        </div>
      </div>

      {pmsNotReady && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
              aria-hidden="true"
            />
            <span className="text-xs leading-5 font-medium">
              Complete PMS setup before saving invoice settings. You can still
              draft values below—they are retained locally until PMS is ready.
            </span>
          </div>
          <Link
            href={settingsHref("pms", propertyId)}
            className={`${pmsButton} !min-h-9 shrink-0 !text-xs`}
          >
            Review PMS setup
          </Link>
        </div>
      )}

      {locked && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-700">
          <Lock
            className="mt-0.5 h-4 w-4 shrink-0 text-slate-500"
            aria-hidden="true"
          />
          <p>
            <strong className="font-semibold text-[#061224]">
              Identity &amp; numbering locked:
            </strong>{" "}
            At least one document has been issued. Registration status, GSTIN,
            series, and starting numbers cannot be changed. Contact support for
            a new legal seller.
          </p>
        </div>
      )}

      {hasDraftBanner && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 text-xs font-medium text-indigo-900">
          <span>
            Restored your unsaved local draft from this browser session.
          </span>
          <button
            type="button"
            onClick={discardDraft}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-50 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Discard draft
          </button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)] xl:items-start">
        {/* Main Form Section (keeps heading and form inside the same <section> container) */}
        <section className={pmsCard}>
          <h2 className="text-xl font-bold text-[#061224]">Invoice settings</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Seller details and numbering series applied to tax invoices,
            ordinary invoices, and credit notes.
          </p>

          <form
            className="mt-6 space-y-6"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              setNotice("");
              try {
                await apiFetch(base, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    expectedRevision: revision,
                    settings: draft,
                  }),
                });
                sessionStorage.removeItem(storage);
                setHasDraftBanner(false);
                const refreshed = await query.refetch();
                setDraft(refreshed.data?.settings ?? defaults);
                setRevision(refreshed.data?.revision ?? revision + 1);
                setConfirmed(false);
                setNotice("Invoice settings saved.");
              } catch (cause) {
                setError(
                  cause instanceof Error ? cause.message : "Unable to save",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {/* Group 1: Business & Tax Identity */}
            <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Building2
                    className="h-4 w-4 text-[#c89b3c]"
                    aria-hidden="true"
                  />
                  <h3 className="text-sm font-bold text-[#061224]">
                    Business &amp; tax identity
                  </h3>
                </div>
                {locked && (
                  <StatusPill tone="slate">
                    <Lock className="h-3 w-3" aria-hidden="true" />
                    Tax ID locked
                  </StatusPill>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-medium text-[#061224]">
                  <span>Registration status</span>
                  <select
                    disabled={busy || locked}
                    className={invoiceField}
                    value={draft.registration}
                    onChange={(e) =>
                      update({
                        ...draft,
                        registration: e.target
                          .value as InvoiceSettings["registration"],
                      })
                    }
                  >
                    <option value="unregistered">
                      Unregistered — ordinary invoices
                    </option>
                    <option value="registered">
                      Registered — taxable supplies
                    </option>
                    <option value="composition">
                      Composition — unavailable
                    </option>
                    <option value="exempt">Exempt — unavailable</option>
                  </select>
                </label>

                <label className="space-y-1.5 text-sm font-medium text-[#061224]">
                  <span>GSTIN (registered business)</span>
                  <input
                    disabled={busy || locked}
                    className={`${invoiceField} font-mono uppercase`}
                    maxLength={15}
                    placeholder={
                      draft.registration === "registered"
                        ? "e.g. 27AABCC1234D1Z5"
                        : "Leave blank if unregistered"
                    }
                    value={draft.gstin}
                    onChange={(e) =>
                      update({
                        ...draft,
                        gstin: e.target.value.toUpperCase(),
                      })
                    }
                  />
                </label>

                <label className="space-y-1.5 text-sm font-medium text-[#061224] sm:col-span-2">
                  <span>Legal business name</span>
                  <input
                    required
                    disabled={busy}
                    className={invoiceField}
                    placeholder="Registered legal entity name"
                    value={draft.legalName}
                    onChange={(e) =>
                      update({ ...draft, legalName: e.target.value })
                    }
                  />
                </label>

                <label className="space-y-1.5 text-sm font-medium text-[#061224] sm:col-span-2">
                  <span>Registered address</span>
                  <input
                    required
                    disabled={busy}
                    className={invoiceField}
                    placeholder="Street, city, PIN code"
                    value={draft.address}
                    onChange={(e) =>
                      update({ ...draft, address: e.target.value })
                    }
                  />
                </label>

                <label className="space-y-1.5 text-sm font-medium text-[#061224]">
                  <span>State</span>
                  <input
                    required
                    disabled={busy}
                    className={invoiceField}
                    placeholder="e.g. Maharashtra"
                    value={draft.state}
                    onChange={(e) =>
                      update({ ...draft, state: e.target.value })
                    }
                  />
                </label>

                <label className="space-y-1.5 text-sm font-medium text-[#061224]">
                  <span>State code</span>
                  <input
                    required
                    disabled={busy}
                    maxLength={2}
                    placeholder="e.g. 27"
                    className={`${invoiceField} font-mono`}
                    value={draft.stateCode}
                    onChange={(e) =>
                      update({ ...draft, stateCode: e.target.value })
                    }
                  />
                </label>

                <label className="space-y-1.5 text-sm font-medium text-[#061224] sm:col-span-2">
                  <span>Business contact details</span>
                  <input
                    required
                    disabled={busy}
                    className={invoiceField}
                    placeholder="Billing phone and/or email"
                    value={draft.contact}
                    onChange={(e) =>
                      update({ ...draft, contact: e.target.value })
                    }
                  />
                </label>
              </div>

              <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200/80 bg-white p-3.5">
                <div className="min-w-0">
                  <span className="block text-sm font-semibold text-[#061224]">
                    IRP e-Invoice registration required
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                    Enable if your hotel is above the GST e-invoicing threshold.
                    Local document issuance will be blocked until IRP
                    integration is connected.
                  </span>
                </div>
                <span className="relative mt-0.5 inline-flex shrink-0 items-center">
                  <input
                    type="checkbox"
                    checked={draft.irpRequired}
                    disabled={busy}
                    onChange={(e) =>
                      update({ ...draft, irpRequired: e.target.checked })
                    }
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
            </div>

            {/* Group 2: Document Numbering & Series */}
            <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Hash
                    className="h-4 w-4 text-[#c89b3c]"
                    aria-hidden="true"
                  />
                  <h3 className="text-sm font-bold text-[#061224]">
                    Document numbering &amp; series
                  </h3>
                </div>
                <StatusPill tone={locked ? "slate" : "gold"}>
                  {locked ? "Locked after issuance" : "Locks on first invoice"}
                </StatusPill>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-medium text-[#061224]">
                  <span>Invoice series</span>
                  <input
                    required
                    disabled={busy || locked}
                    maxLength={4}
                    placeholder="INV"
                    className={`${invoiceField} font-mono`}
                    value={draft.invoiceSeries}
                    onChange={(e) =>
                      update({ ...draft, invoiceSeries: e.target.value })
                    }
                  />
                </label>

                <label className="space-y-1.5 text-sm font-medium text-[#061224]">
                  <span>First invoice number</span>
                  <input
                    required
                    disabled={busy || locked}
                    type="number"
                    min={1}
                    max={999999}
                    className={`${invoiceField} font-mono`}
                    value={String(draft.invoiceStart)}
                    onChange={(e) =>
                      update({
                        ...draft,
                        invoiceStart: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                </label>

                <label className="space-y-1.5 text-sm font-medium text-[#061224]">
                  <span>Credit-note series</span>
                  <input
                    required
                    disabled={busy || locked}
                    maxLength={4}
                    placeholder="CN"
                    className={`${invoiceField} font-mono`}
                    value={draft.creditSeries}
                    onChange={(e) =>
                      update({ ...draft, creditSeries: e.target.value })
                    }
                  />
                </label>

                <label className="space-y-1.5 text-sm font-medium text-[#061224]">
                  <span>First credit-note number</span>
                  <input
                    required
                    disabled={busy || locked}
                    type="number"
                    min={1}
                    max={999999}
                    className={`${invoiceField} font-mono`}
                    value={String(draft.creditStart)}
                    onChange={(e) =>
                      update({
                        ...draft,
                        creditStart: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs">
                <span className="font-semibold text-slate-500">
                  Format preview:
                </span>
                <code className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono font-semibold text-[#061224]">
                  {invoicePreview}
                </code>
                <code className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono font-semibold text-[#061224]">
                  {creditPreview}
                </code>
              </div>
            </div>

            {/* Group 3: Signatory & Footer */}
            <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <FileSignature
                  className="h-4 w-4 text-[#c89b3c]"
                  aria-hidden="true"
                />
                <h3 className="text-sm font-bold text-[#061224]">
                  Signatory &amp; document footer
                </h3>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-medium text-[#061224]">
                  <span>Authorized signatory</span>
                  <input
                    required
                    disabled={busy}
                    className={invoiceField}
                    placeholder="Full name"
                    value={draft.signatory}
                    onChange={(e) =>
                      update({ ...draft, signatory: e.target.value })
                    }
                  />
                </label>

                <label className="space-y-1.5 text-sm font-medium text-[#061224]">
                  <span>Signatory designation</span>
                  <input
                    required
                    disabled={busy}
                    className={invoiceField}
                    placeholder="e.g. General Manager"
                    value={draft.signatoryDesignation}
                    onChange={(e) =>
                      update({
                        ...draft,
                        signatoryDesignation: e.target.value,
                      })
                    }
                  />
                </label>

                <label className="space-y-1.5 text-sm font-medium text-[#061224] sm:col-span-2">
                  <span>Document footer</span>
                  <input
                    disabled={busy}
                    maxLength={1000}
                    className={invoiceField}
                    placeholder="Optional payment terms or jurisdiction note"
                    value={draft.footer}
                    onChange={(e) =>
                      update({ ...draft, footer: e.target.value })
                    }
                  />
                </label>
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 text-sm text-slate-700">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#061224]"
              />
              <span className="leading-snug">
                I have confirmed registration status and applicable document
                requirements with the hotel/accountant.
              </span>
            </label>

            <p className="text-xs leading-5 text-slate-500">
              Series and starting numbers lock after first issuance. Issued
              documents cannot be edited. Printed tax documents include a
              signature space for the authorized signatory.
            </p>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-800"
              >
                <AlertCircle
                  className="mt-0.5 h-4 w-4 shrink-0 text-rose-600"
                  aria-hidden="true"
                />
                <span>{error} Your draft is retained.</span>
              </div>
            )}

            {notice && (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-800"
              >
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                  aria-hidden="true"
                />
                <span>{notice}</span>
              </div>
            )}

            <button
              type="submit"
              className={`${invoiceButton} w-full sm:w-auto`}
              disabled={busy || !confirmed}
            >
              {busy ? "Saving…" : "Save invoice settings"}
            </button>
          </form>
        </section>

        {/* Right Rail: Live Summary + Revision History */}
        <div className="space-y-6">
          <section className={pmsCard}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-[#061224]">
                Tax &amp; numbering summary
              </h3>
              <StatusPill
                tone={
                  draft.registration === "registered"
                    ? "emerald"
                    : draft.registration === "unregistered"
                      ? "slate"
                      : "amber"
                }
              >
                {draft.registration}
              </StatusPill>
            </div>
            <dl className="mt-4 space-y-2.5 text-xs">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-500">Seller</dt>
                <dd className="text-right font-semibold text-[#061224]">
                  {draft.legalName || "Not set"}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-500">GSTIN</dt>
                <dd className="font-mono font-semibold text-[#061224]">
                  {draft.gstin || "—"}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-500">State</dt>
                <dd className="font-semibold text-[#061224]">
                  {draft.state || "—"}
                  {draft.stateCode ? ` (${draft.stateCode})` : ""}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3 border-t border-slate-100 pt-2.5">
                <dt className="text-slate-500">First invoice</dt>
                <dd className="font-mono font-semibold text-[#061224]">
                  {invoicePreview}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-500">First credit note</dt>
                <dd className="font-mono font-semibold text-[#061224]">
                  {creditPreview}
                </dd>
              </div>
            </dl>
          </section>

          <section className={pmsCard}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <History
                  className="h-4 w-4 text-[#c89b3c]"
                  aria-hidden="true"
                />
                <h3 className="text-base font-bold text-[#061224]">
                  Revision history
                </h3>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                Rev {data.revision}
              </span>
            </div>

            {!data.history.length ? (
              <p className="mt-3 text-xs text-slate-500">
                Saved configuration revisions will appear here.
              </p>
            ) : (
              <details className="mt-3" open>
                <summary className="cursor-pointer py-1 text-xs font-semibold text-slate-600 hover:text-[#061224]">
                  Settings history ({data.history.length})
                </summary>
                <div className="mt-3 space-y-2.5 border-l border-slate-200 pl-3.5">
                  {data.history.map((h) => {
                    const before =
                      (h.before as Record<string, unknown> | null) ?? null;
                    const after = (h.after as Record<string, unknown>) ?? {};
                    const changedEntries = Object.entries(after).filter(
                      ([k, v]) => !before || before[k] !== v,
                    );
                    return (
                      <details
                        key={String(h.revision)}
                        className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs"
                      >
                        <summary className="cursor-pointer font-semibold text-[#061224]">
                          Revision {String(h.revision)} ·{" "}
                          {String(h.actorName || h.actorId)} ·{" "}
                          <span className="font-normal text-slate-500">
                            {formatDateTime(
                              typeof h.createdAt === "string"
                                ? h.createdAt
                                : null,
                            )}
                          </span>
                        </summary>
                        <dl className="mt-2 space-y-1 border-t border-slate-200/70 pt-2">
                          {(changedEntries.length
                            ? changedEntries
                            : Object.entries(after)
                          ).map(([k, value]) => (
                            <div
                              key={k}
                              className="flex flex-wrap justify-between gap-2 text-[11px]"
                            >
                              <dt className="font-medium text-slate-500">{k}</dt>
                              <dd className="break-all font-medium text-[#061224]">
                                {String(before?.[k] ?? "—")} → {String(value)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    );
                  })}
                </div>
              </details>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
