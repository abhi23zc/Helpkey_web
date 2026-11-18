"use client";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import type { reviewInvoice } from "@/lib/partner/invoices/service";
import {
  particular,
  type DocumentDetails,
  type Particular,
  type IssueInput,
} from "@/lib/partner/invoices/domain";
import { AlertCircle, ChevronDown, FileText, Printer } from "lucide-react";
import type { RecordData } from "@/lib/partner/dashboard/domain";

const button =
  "inline-flex items-center justify-center min-h-[38px] rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-[#0b1f3a] hover:bg-slate-50 transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed";
const primaryButton =
  "inline-flex items-center justify-center min-h-[42px] px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#0b1f3a] hover:bg-[#152e50] active:scale-[0.99] transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed";
const field =
  "w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#c59a40] focus:outline-none focus:ring-2 focus:ring-[#c59a40]/20 transition-all";
const selectField =
  "w-full min-h-[40px] rounded-xl border border-slate-200 bg-white pl-3.5 pr-8 py-2 text-sm text-slate-900 focus:border-[#c59a40] focus:outline-none focus:ring-2 focus:ring-[#c59a40]/20 transition-all appearance-none cursor-pointer";

type Review = Awaited<ReturnType<typeof reviewInvoice>>;
const money = (n: number) => `₹${(n / 100).toFixed(2)}`;
const blankParticular = (
  sourceId: string,
  description: string,
): Particular => ({
  sourceId,
  description,
  quantity: 1,
  unit: "service",
  taxablePaise: 0,
  cgstPaise: 0,
  sgstPaise: 0,
  igstPaise: 0,
  cgstRate: 0,
  sgstRate: 0,
  igstRate: 0,
  sac: "",
  placeOfSupply: "",
  placeOfSupplyCode: "",
  reverseCharge: false,
  sellerConfirmed: true,
  provenance: "",
});
const emptyDetails = (): DocumentDetails => ({
  customer: {
    name: "",
    address: "",
    state: "",
    stateCode: "",
    gstin: "",
    deliveryAddress: "",
  },
  accountantConfirmed: true,
  irpRequired: false,
  lines: [],
});
function ParticularEditor({
  value,
  onChange,
}: {
  value: Particular;
  onChange: (v: Particular) => void;
}) {
  const labels = {
    description: "Document description",
    quantity: "Quantity",
    unit: "Unit",
    sac: "SAC (6 digits)",
    placeOfSupply: "Place of supply",
    placeOfSupplyCode: "Place of supply state code",
    taxablePaise: "Taxable value (₹)",
    cgstPaise: "CGST (₹)",
    sgstPaise: "SGST (₹)",
    igstPaise: "IGST (₹)",
    cgstRate: "CGST rate (%)",
    sgstRate: "SGST rate (%)",
    igstRate: "IGST rate (%)",
    provenance: "Accountant confirmation / source evidence",
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Object.entries(labels).map(([k, label]) => {
        const key = k as keyof typeof labels;
        const isMoney = key.endsWith("Paise"),
          numeric = isMoney || key.endsWith("Rate") || key === "quantity";
        return (
          <label className="block text-xs font-semibold text-slate-700" key={key}>
            {label}
            <input
              className={`mt-1 ${field}`}
              type={numeric ? "number" : "text"}
              step={key === "quantity" ? "1" : "0.01"}
              min={numeric ? "0" : undefined}
              value={isMoney ? Number(value[key]) / 100 : value[key]}
              onChange={(e) =>
                onChange({
                  ...value,
                  [key]: isMoney
                    ? Math.round(Number(e.target.value) * 100)
                    : numeric
                      ? Number(e.target.value)
                      : e.target.value,
                })
              }
            />
          </label>
        );
      })}
    </div>
  );
}
type Pending = { key: string; body: IssueInput; ambiguous: boolean };
type Props = {
  bookingId: string;
  propertyId: string;
  onChanged: () => void;
  onDraftChange?: (s: string, dirty: boolean, busy?: boolean) => void;
};
const subscribe = () => () => {};
export function ReservationInvoices(props: Props) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return hydrated ? (
    <InvoiceWorkspace key={props.bookingId} {...props} />
  ) : (
    <p>Loading invoice drafts…</p>
  );
}
function InvoiceWorkspace({
  bookingId,
  propertyId,
  onChanged,
  onDraftChange,
}: Props) {
  const base = `/api/partner/bookings/${bookingId}/invoices`,
    storage = `invoice-draft:${bookingId}`;
  const query = useQuery({
    queryKey: ["partner", propertyId, "invoices", bookingId],
    queryFn: () => apiFetch<Review>(base),
  });
  const [restored] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storage) || "{}");
    } catch {
      return {};
    }
  });
  const [draft, setDraft] = useState<DocumentDetails | null>(
      restored.draft ?? null,
    ),
    [draftVersion, setDraftVersion] = useState(restored.draftVersion ?? ""),
    [pending, setPending] = useState<Pending | null>(restored.pending ?? null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [review, setReview] = useState<IssueInput | null>(null),
    [notice, setNotice] = useState("");
  const [invoiceId, setInvoiceId] = useState<string>(restored.invoiceId ?? ""),
    [reductionId, setReductionId] = useState<string>(
      restored.reductionId ?? "",
    ),
    [reason, setReason] = useState<string>(restored.reason ?? ""),
    [allocations, setAllocations] = useState<Record<string, Particular>>(
      restored.allocations ?? {},
    );
  useEffect(() => {
    sessionStorage.setItem(
      storage,
      JSON.stringify({
        draft,
        draftVersion,
        pending,
        invoiceId,
        reductionId,
        reason,
        allocations,
      }),
    );
  }, [
    storage,
    draft,
    draftVersion,
    pending,
    invoiceId,
    reductionId,
    reason,
    allocations,
  ]);
  useEffect(() => {
    onDraftChange?.("invoices", !!draft || !!pending || !!reason, busy);
  }, [draft, pending, reason, busy, onDraftChange]);
  const data = query.data;
  async function issue() {
    const attempt =
      pending ??
      (review
        ? { key: crypto.randomUUID(), body: review, ambiguous: false }
        : null);
    if (!attempt) return;
    setPending({ ...attempt, ambiguous: true });
    sessionStorage.setItem(
      storage,
      JSON.stringify({
        draft,
        draftVersion,
        pending: { ...attempt, ambiguous: true },
        invoiceId,
        reductionId,
        reason,
        allocations,
      }),
    );
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<{ number: string }>(base, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": attempt.key,
        },
        body: JSON.stringify(attempt.body),
      });
      setPending(null);
      setReview(null);
      setDraft(null);
      setReason("");
      setAllocations({});
      setNotice(
        `${attempt.body.action === "invoice" ? "Invoice" : "Credit note"} issued: ${result.number}`,
      );
      await query.refetch();
      onChanged();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Issuance response unavailable.",
      );
      const definitive =
        e instanceof ApiClientError &&
        [400, 401, 403, 409, 422, 429].includes(e.status);
      const resolved =
        e instanceof ApiClientError &&
        ["INVOICE_REVIEW_STALE", "INVOICE_REVIEW_REQUIRED"].includes(e.code);
      if (resolved || (definitive && !attempt.ambiguous)) {
        setPending(null);
        setReview(null);
        await query.refetch();
      } else setPending({ ...attempt, ambiguous: true });
    } finally {
      setBusy(false);
    }
  }
  async function print(id: string) {
    const win = window.open("", "_blank");
    if (!win) {
      setError("Allow the print window to open.");
      return;
    }
    try {
      const response = await fetch(`${base}/${id}/print`);
      if (!response.ok)
        throw new Error(
          "Document access unavailable. Refresh and check your hotel permissions.",
        );
      win.document.open();
      win.document.write(await response.text());
      win.document.close();
    } catch (e) {
      win.close();
      setError(e instanceof Error ? e.message : "Printing unavailable");
    }
  }
  if (!data)
    return (
      <p role="status">
        {query.error instanceof Error
          ? query.error.message
          : "Loading invoices…"}
      </p>
    );
  const docs = data.documents as RecordData[],
    invoice = docs.find((d) => d.id === invoiceId);
  const change = (d: DocumentDetails) => {
    setDraft(d);
    setReview(null);
  };
  return (
    <section
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      aria-label="Invoices"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-[#0b1f3a]">Invoices</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Formal GST invoices and credit notes for accounting and guest records.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.canIssue && (
            <Link
              className={button}
              href={`/partner/settings?section=invoices&propertyId=${propertyId}`}
            >
              Invoice settings
            </Link>
          )}
          <button
            className={button}
            disabled={busy}
            onClick={() => {
              setReview(null);
              void query.refetch();
            }}
          >
            Refresh documents
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        Invoices document reservation charges. Receipts record money received.
        Supplemental services remain separate and cannot be invoiced here.
        Issued documents are permanent; identity and tax corrections require
        external accountant review.
      </p>

      {/* Invoice Settlement Metrics */}
      <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
          <dt className="text-xs text-slate-500">Previously invoiced</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{money(data.previouslyInvoicedPaise)}</dd>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
          <dt className="text-xs text-slate-500">Amount paid</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{money(data.settlement.netPaidPaise)}</dd>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
          <dt className="text-xs text-slate-500">Balance due</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{money(data.settlement.balanceDuePaise)}</dd>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
          <dt className="text-xs text-slate-500">Refund pending</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{money(data.settlement.pendingRefundPaise)}</dd>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
          <dt className="text-xs text-slate-500">Refund completed</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{money(data.settlement.completedRefundPaise)}</dd>
        </div>
      </dl>

      {error && (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50/90 p-3.5 text-xs text-amber-950 font-medium">
          {error} Your draft is retained.
        </p>
      )}

      {notice && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-3.5 text-xs text-emerald-950 font-medium">
          {notice}
        </p>
      )}

      {pending ? (
        <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/80 p-4">
          <p role="status" className="text-xs text-blue-950 font-medium">
            An issuance request is unresolved. Retry the saved request to
            recover its result. The same document will be returned if it was
            issued.
          </p>
          <button className={primaryButton} disabled={busy} onClick={issue}>
            Resolve issuance
          </button>
        </div>
      ) : (
        data.canIssue && (
          <>
            <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm group">
              <summary className="cursor-pointer font-semibold text-slate-800 hover:text-slate-900 flex items-center justify-between">
                <span>Customer billing and document details</span>
                <span className="text-xs font-normal text-slate-500">Edit recipient, GSTIN & tax lines</span>
              </summary>
              <p className="mt-3 mb-4 text-xs text-slate-500 leading-relaxed">
                Choose the billing recipient explicitly. Confirm seller
                ownership and exact taxable values with your accountant; these
                details never change folio charges. Enter original amounts
                without reversing an inclusive total or splitting aggregate tax.
              </p>
              <button
                className={button}
                onClick={() => {
                  setDraftVersion(data.version);
                  change({
                    ...(data.details ?? emptyDetails()),
                    lines: data.remaining.map(
                      (l) =>
                        data.details?.lines.find((p) => p.sourceId === l.id) ??
                        blankParticular(l.id, l.description),
                    ),
                  });
                }}
              >
                Edit document details
              </button>
              {draft && (
                <form
                  className="mt-4 space-y-4 pt-4 border-t border-slate-100"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    setError("");
                    try {
                      await apiFetch(`${base}/details`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          expectedVersion: draftVersion,
                          details: {
                            ...draft,
                            lines: draft.lines.filter((p) =>
                              data.remaining.some((l) => l.id === p.sourceId),
                            ),
                          },
                        }),
                      });
                      setDraft(null);
                      await query.refetch();
                      setNotice(
                        "Customer billing and source details saved. Review before issuing.",
                      );
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Save unavailable",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Object.entries({
                      name: "Billing recipient name",
                      address: "Billing address",
                      state: "Customer state",
                      stateCode: "Customer state code",
                      gstin: "Customer GSTIN (if registered)",
                      deliveryAddress: "Delivery address",
                    }).map(([key, label]) => (
                      <label className="block text-xs font-semibold text-slate-700" key={key}>
                        {label}
                        <input
                          className={`mt-1 ${field}`}
                          value={
                            draft.customer[key as keyof typeof draft.customer]
                          }
                          onChange={(e) =>
                            change({
                              ...draft,
                              customer: {
                                ...draft.customer,
                                [key]: e.target.value,
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-[#0b1f3a] focus:ring-[#c59a40]"
                      checked={draft.irpRequired}
                      onChange={(e) =>
                        change({ ...draft, irpRequired: e.target.checked })
                      }
                    />
                    <span>This transaction requires IRP registration (issuance unavailable).</span>
                  </label>
                  {data.remaining.map((l) => {
                    const p =
                      draft.lines.find((p) => p.sourceId === l.id) ??
                      blankParticular(l.id, l.description);
                    return (
                      <fieldset
                        className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4"
                        key={l.id}
                      >
                        <legend className="font-semibold text-xs text-slate-800 px-2">
                          {l.description} · {money(l.amountPaise)}
                        </legend>
                        <ParticularEditor
                          value={p}
                          onChange={(p) =>
                            change({
                              ...draft,
                              lines: [
                                ...draft.lines.filter(
                                  (v) => v.sourceId !== l.id,
                                ),
                                p,
                              ],
                            })
                          }
                        />
                      </fieldset>
                    );
                  })}
                  <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                    <input type="checkbox" required className="rounded border-slate-300 text-[#0b1f3a] focus:ring-[#c59a40]" />
                    <span>I confirm the billing recipient, hotel seller ownership, source evidence and accountant-approved particulars.</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button className={primaryButton} disabled={busy}>
                      Save document details
                    </button>
                    {draftVersion !== data.version && (
                      <button
                        type="button"
                        className={button}
                        onClick={() => setDraftVersion(data.version)}
                      >
                        I have reviewed the refreshed sources
                      </button>
                    )}
                  </div>
                </form>
              )}
            </details>

            {/* Invoicing Requirements Checklist & Uninvoiced list */}
            <div className="space-y-3">
              {data.blockers.length > 0 && (
                <div className="rounded-xl border border-amber-200/90 bg-amber-50/70 p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-amber-900 font-semibold text-xs tracking-wide uppercase">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Invoice Requirements Checklist</span>
                  </div>
                  <div className="space-y-1.5 pl-6">
                    {data.blockers.map((b, i) => (
                      <p key={i} className="text-xs text-amber-900 list-item list-disc leading-relaxed">
                        {b}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {data.remaining.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Uninvoiced Charges
                  </p>
                  <ul className="divide-y divide-slate-100">
                    {data.remaining.map((l) => (
                      <li key={l.id} className="flex items-center justify-between py-1.5 text-xs text-slate-700">
                        <span className="font-medium text-slate-800">{l.description}</span>
                        <span className="font-semibold text-slate-900 tabular-nums">{money(l.amountPaise)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                className={primaryButton}
                disabled={
                  busy ||
                  !!draft ||
                  !!data.blockers.length ||
                  !data.remaining.length
                }
                onClick={() =>
                  setReview({
                    action: "invoice",
                    expectedVersion: data.version,
                  })
                }
              >
                Review invoice
              </button>
            </div>

            {data.canCredit && (
              <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
                <summary className="cursor-pointer font-semibold text-slate-800 hover:text-slate-900 flex items-center justify-between">
                  <span>Create credit note</span>
                  <span className="text-xs font-normal text-slate-500">Allocate folio reductions</span>
                </summary>
                <p className="mt-3 mb-4 text-xs text-slate-500 leading-relaxed">
                  Select an existing saved folio reduction and allocate its
                  value and tax to original invoice lines. This records no new
                  credit and returns no money.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Original invoice
                    <div className="relative mt-1">
                      <select
                        aria-label="Original invoice"
                        className={selectField}
                        value={invoiceId}
                        onChange={(e) => {
                          setInvoiceId(e.target.value);
                          setAllocations({});
                          setReview(null);
                        }}
                      >
                        <option value="">Choose invoice</option>
                        {docs
                          .filter((d) => d.documentType !== "credit_note")
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.invoiceNumber}
                            </option>
                          ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      </div>
                    </div>
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Saved folio reduction
                    <div className="relative mt-1">
                      <select
                        aria-label="Saved folio reduction"
                        className={selectField}
                        value={reductionId}
                        onChange={(e) => {
                          setReductionId(e.target.value);
                          setAllocations({});
                          setReview(null);
                        }}
                      >
                        <option value="">Choose reduction</option>
                        {data.reductions
                          .filter((l) => l.remainingPaise > 0)
                          .map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.description} · {money(l.remainingPaise)} remaining
                            </option>
                          ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      </div>
                    </div>
                  </label>
                  <label className="block text-xs font-semibold text-slate-700 sm:col-span-2">
                    Reason
                    <input
                      className={`mt-1 ${field}`}
                      value={reason}
                      onChange={(e) => {
                        setReason(e.target.value);
                        setReview(null);
                      }}
                    />
                  </label>
                </div>
                {invoice &&
                  reductionId &&
                  (invoice.lines as RecordData[])
                    .filter((l) => l.sign > 0)
                    .map((l) => (
                      <fieldset
                        key={l.id}
                        className="my-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4"
                      >
                        <legend className="font-semibold text-xs text-slate-800 px-2">
                          {l.description} · original {money(l.amountPaise)}
                        </legend>
                        <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-[#0b1f3a] focus:ring-[#c59a40]"
                            checked={!!allocations[l.id]}
                            onChange={(e) => {
                              const next = { ...allocations };
                              if (e.target.checked)
                                next[l.id] = {
                                  ...l,
                                  sourceId: reductionId,
                                  taxablePaise: 0,
                                  cgstPaise: 0,
                                  sgstPaise: 0,
                                  igstPaise: 0,
                                } as Particular;
                              else delete next[l.id];
                              setAllocations(next);
                              setReview(null);
                            }}
                          />
                          <span>Allocate to this line</span>
                        </label>
                        {allocations[l.id] && (
                          <ParticularEditor
                            value={allocations[l.id]}
                            onChange={(p) => {
                              setAllocations({ ...allocations, [l.id]: p });
                              setReview(null);
                            }}
                          />
                        )}
                      </fieldset>
                    ))}
                <div className="mt-4">
                  <button
                    className={primaryButton}
                    disabled={
                      busy ||
                      !invoiceId ||
                      !reductionId ||
                      reason.trim().length < 3 ||
                      !Object.keys(allocations).length
                    }
                    onClick={() => {
                      const parsed = Object.entries(allocations).map(
                        ([lineId, p]) => ({
                          lineId,
                          result: particular.safeParse(
                            Object.fromEntries(
                              Object.keys(blankParticular("", "")).map((key) => [
                                key,
                                p[key as keyof Particular],
                              ]),
                            ),
                          ),
                        }),
                      );
                      const invalid = parsed.find((a) => !a.result.success);
                      if (invalid && !invalid.result.success) {
                        setError(
                          invalid.result.error.issues
                            .map((i) => i.message)
                            .join(" "),
                        );
                        return;
                      }
                      setError("");
                      setReview({
                        action: "credit_note",
                        expectedVersion: data.version,
                        invoiceId,
                        reductionId,
                        reason,
                        allocations: parsed.map((a) => ({
                          lineId: a.lineId,
                          particulars: a.result.data!,
                        })),
                      });
                    }}
                  >
                    Review credit note
                  </button>
                </div>
              </details>
            )}

            {review && (
              <section
                role="region"
                aria-label="Confirm document issuance"
                className="space-y-4 rounded-xl border border-[#c59a40]/30 bg-amber-50/40 p-4.5"
              >
                <div>
                  <h4 className="font-bold text-[#0b1f3a]">
                    Confirm{" "}
                    {review.action === "invoice" ? "invoice" : "credit note"}
                  </h4>
                  <p className="text-xs text-slate-600 mt-1">
                    {data.settings?.legalName} →{" "}
                    {review.action === "invoice"
                      ? data.details?.customer.name
                      : invoice?.customer.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {data.settings?.address} ·{" "}
                    {data.settings?.gstin || "Unregistered business"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {review.action === "invoice"
                      ? data.details?.customer.address
                      : invoice?.customer.address}
                  </p>
                </div>

                <div className="space-y-2">
                  {(review.action === "invoice"
                    ? data.remaining.map((l) => ({
                        p: data.details!.lines.find(
                          (p) => p.sourceId === l.id,
                        )!,
                        amount: l.amountPaise,
                      }))
                    : (review.allocations ?? []).map((a) => ({
                        p: a.particulars,
                        amount:
                          a.particulars.taxablePaise +
                          a.particulars.cgstPaise +
                          a.particulars.sgstPaise +
                          a.particulars.igstPaise,
                      }))
                  ).map(({ p, amount }, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-slate-200 bg-white p-3 text-xs space-y-1"
                    >
                      <p className="font-semibold text-slate-900">
                        {p.description} · {money(amount)}
                      </p>
                      <p className="text-slate-500">
                        {p.quantity} {p.unit} · SAC {p.sac} · {p.placeOfSupply}{" "}
                        ({p.placeOfSupplyCode})
                      </p>
                      <p className="text-slate-600 font-mono text-[11px]">
                        Taxable value{" "}
                        {money(p.taxablePaise * Math.sign(amount))} · CGST{" "}
                        {money(p.cgstPaise * Math.sign(amount))} ({p.cgstRate}%)
                        · SGST {money(p.sgstPaise * Math.sign(amount))} (
                        {p.sgstRate}%) · IGST{" "}
                        {money(p.igstPaise * Math.sign(amount))} ({p.igstRate}%)
                      </p>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between">
                  <span className="font-semibold text-sm text-slate-800">Total:</span>
                  <span className="font-bold text-base text-slate-900 tabular-nums">
                    {money(
                      review.action === "invoice"
                        ? data.remaining.reduce((n, l) => n + l.amountPaise, 0)
                        : (review.allocations ?? []).reduce(
                            (n, a) =>
                              n +
                              a.particulars.taxablePaise +
                              a.particulars.cgstPaise +
                              a.particulars.sgstPaise +
                              a.particulars.igstPaise,
                            0,
                          ),
                    )}
                  </span>
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Issuance permanently saves these details and today’s
                  hotel-local date. It does not change the balance or initiate a
                  refund.
                </p>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button className={primaryButton} disabled={busy} onClick={issue}>
                    Issue{" "}
                    {review.action === "invoice" ? "invoice" : "credit note"}
                  </button>
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() => setReview(null)}
                  >
                    Back to review
                  </button>
                </div>
              </section>
            )}
          </>
        )
      )}

      {/* Document History */}
      <div className="space-y-3 pt-3 border-t border-slate-100">
        <h4 className="font-bold text-sm text-[#0b1f3a]">Document history</h4>
        {!docs.length ? (
          <p className="text-xs text-slate-400">No issued documents.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {docs.map((d) => (
              <article
                className="flex flex-wrap items-center justify-between gap-3 py-3"
                key={d.id}
              >
                <div>
                  <p className="font-semibold text-sm text-slate-900">
                    {d.documentType === "credit_note"
                      ? "Credit note issued"
                      : d.documentType === "tax_invoice"
                        ? "Tax invoice"
                        : "Ordinary invoice"}{" "}
                    · {d.invoiceNumber}
                  </p>
                  <p className="text-xs text-slate-500">
                    {d.date} · {money(d.totalPaise)}
                    {d.original ? ` · Original ${d.original.number}` : ""}
                  </p>
                </div>
                <button className={button} onClick={() => void print(d.id)}>
                  <Printer className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
                  Print
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
