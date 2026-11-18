"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { formatPaise as formatCurrency } from "@/lib/currency";
import { ChevronDown, Printer } from "lucide-react";
const formatPaise = (value: number) =>
  formatCurrency(value, { withFractions: true });
import type { readFolio } from "@/lib/partner/billing/service";
import type { BillingCommand } from "@/lib/partner/billing/domain";
type Folio = Awaited<ReturnType<typeof readFolio>>;

const outlineButton =
  "inline-flex items-center justify-center min-h-[38px] rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-[#0b1f3a] hover:bg-slate-50 transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed";
const button = outlineButton;
const inputField =
  "w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#c59a40] focus:outline-none focus:ring-2 focus:ring-[#c59a40]/20 transition-all";
const field = inputField;
const selectField =
  "w-full min-h-[42px] rounded-xl border border-slate-200 bg-white pl-3.5 pr-8 py-2 text-sm text-slate-900 focus:border-[#c59a40] focus:outline-none focus:ring-2 focus:ring-[#c59a40]/20 transition-all appearance-none cursor-pointer";
const textareaField =
  "w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#c59a40] focus:outline-none focus:ring-2 focus:ring-[#c59a40]/20 transition-all resize-y";

function formatEntryTitle(description?: string | null, type?: string | null, status?: string | null): string {
  const raw = (description || type || status || "Charge").trim();
  const lower = raw.toLowerCase();
  if (lower === "collection" || lower === "received") return "Payment Received";
  if (lower === "reversal") return "Payment Reversal";
  if (lower.startsWith("stay change: category")) return "Room Category Upgrade";
  if (lower.startsWith("stay change: dates")) return "Stay Dates Modification";
  if (lower.startsWith("stay change: room")) return "Room Move / Transfer";
  if (lower.startsWith("stay change:")) return "Stay Modification";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function formatStaffName(actorName?: string | null, actorId?: string | null): string {
  if (actorName && actorName.trim()) return `Staff: ${actorName.trim()}`;
  if (actorId && actorId.trim()) {
    if (/^[A-Za-z0-9_-]{16,}$/.test(actorId.trim())) return "Staff: Front Desk";
    return `Staff: ${actorId.trim()}`;
  }
  return "Staff: Front Desk";
}

function formatPaymentDetails(method?: string | null, reference?: string | null): string | null {
  if (!method) return null;
  const m = method.toLowerCase();
  const hasRef = reference && reference.trim() && reference !== "No external reference";
  const refText = hasRef ? ` (Ref: ${reference.trim()})` : "";
  if (m === "cash") return `Cash payment${refText}`;
  if (m === "card") return `Card payment${refText}`;
  if (m === "upi") return `UPI payment${refText}`;
  if (m === "online") return `Online payment${refText}`;
  return `${method.charAt(0).toUpperCase() + method.slice(1)} payment${refText}`;
}

function formatStatusBadge(status?: string | null, type?: string | null): { label: string; className: string } {
  const s = (status || type || "charge").toLowerCase();
  if (s === "collection" || s === "received" || s === "payment") {
    return { label: "Payment", className: "bg-emerald-100 text-emerald-900" };
  }
  if (s === "reversal" || s === "refund") {
    return { label: s === "reversal" ? "Reversal" : "Refund", className: "bg-purple-100 text-purple-900" };
  }
  if (s === "charge") {
    return { label: "Charge", className: "bg-amber-100 text-amber-900" };
  }
  return { label: s.charAt(0).toUpperCase() + s.slice(1), className: "bg-slate-100 text-slate-700" };
}

export function ReservationFolio({
  bookingId,
  propertyId,
  onChanged,
  onDraftChange,
}: {
  bookingId: string;
  propertyId: string;
  onChanged: () => void;
  onDraftChange?: (section: string, dirty: boolean, busy?: boolean) => void;
}) {
  const [cursor, setCursor] = useState<string>();
  const query = useQuery({
    queryKey: ["partner", propertyId, "folio", bookingId, cursor],
    queryFn: () =>
      apiFetch<Folio>(
        `/api/partner/bookings/${bookingId}/folio${cursor ? `?before=${cursor}` : ""}`,
      ),
    refetchInterval: 30000,
  });
  const [tab, setTab] = useState("Charges");
  const [action, setAction] = useState<BillingCommand["action"]>("post");
  const [category, setCategory] = useState("other");
  const [description, setDescription] = useState("");
  const [explanation, setExplanation] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [original, setOriginal] = useState("");
  const [review, setReview] = useState(false);
  const reviewRevision = useRef<number | null>(null);
  const reviewVersion = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [frozen, setFrozen] = useState(false);
  const pending = useRef<{
    key: string;
    body: unknown;
    ambiguous: boolean;
  } | null>(null);
  const dirty = !!(
    description ||
    explanation ||
    amount ||
    reason ||
    original ||
    frozen
  );
  useEffect(() => {
    onDraftChange?.("billing", dirty, busy);
  }, [dirty, busy, onDraftChange]);
  const data = query.data;
  async function submit() {
    if (!data) return;
    if (!pending.current) {
      const amountPaise = Math.round(Number(amount) * 100);
      if (
        action !== "void" &&
        (!/^\d+(\.\d{1,2})?$/.test(amount) ||
          amountPaise <= 0 ||
          !Number.isSafeInteger(amountPaise))
      ) {
        setError(
          "Enter an exact positive amount with at most two decimal places.",
        );
        return;
      }
      pending.current = {
        key: crypto.randomUUID(),
        ambiguous: false,
        body: {
          action,
          expectedRevision: reviewRevision.current ?? data.revision,
          expectedStatementVersion:
            reviewVersion.current ?? data.statementVersion,
          ...(action !== "void"
            ? { category, description, amountPaise, details: { explanation } }
            : {}),
          ...(action !== "post" ? { reason } : {}),
          ...(["void", "correct"].includes(action)
            ? { originalEntryId: original }
            : {}),
        },
      };
    }
    setBusy(true);
    onDraftChange?.("billing", true, true);
    setError("");
    try {
      await apiFetch(`/api/partner/bookings/${bookingId}/folio`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": pending.current.key,
        },
        body: JSON.stringify(pending.current.body),
      });
      pending.current = null;
      setFrozen(false);
      setReview(false);
      setDescription("");
      setExplanation("");
      setAmount("");
      setReason("");
      setOriginal("");
      await query.refetch();
      onChanged();
    } catch (e) {
      const definitive =
        e instanceof ApiClientError &&
        [400, 401, 403, 409, 422, 429].includes(e.status);
      if (!definitive) pending.current!.ambiguous = true;
      // These errors occur only after the transaction positively finds no committed request.
      const resolvedUncommitted =
        e instanceof ApiClientError &&
        [
          "BILLING_CHANGED",
          "ENTRY_ALREADY_NEUTRALIZED",
          "BILLING_STATE_CONFLICT",
        ].includes(e.code);
      if (pending.current!.ambiguous && !resolvedUncommitted) setFrozen(true);
      else {
        pending.current = null;
        setFrozen(false);
        setReview(false);
      }
      setError(e instanceof Error ? e.message : "Billing request failed.");
      if (e instanceof ApiClientError && e.code === "BILLING_CHANGED")
        await query.refetch();
    } finally {
      setBusy(false);
    }
  }
  async function printStatement() {
    if (!data) return;
    const win = window.open("", "_blank");
    if (!win) {
      setError("Allow a print window to open.");
      return;
    }
    try {
      const statement = await apiFetch<Folio>(
        `/api/partner/bookings/${bookingId}/folio/statement?revision=${data.revision}&version=${encodeURIComponent(data.statementVersion)}`,
      );
      win.document.title = "Itemized billing statement";
      const heading = win.document.createElement("h1");
      heading.textContent = "Itemized billing statement — not a tax invoice.";
      win.document.body.append(heading);
      const content = win.document.createElement("pre");
      content.style.whiteSpace = "pre-wrap";
      content.style.fontFamily = "sans-serif";
      content.textContent = `${statement.hotel}\nReservation ${statement.reference} · Revision ${statement.revision}\n${new Date().toLocaleString("en-IN", { timeZone: statement.timezone })} (${statement.timezone})\n\nReservation\n${totals(
        statement,
      )
        .map(([label, value]) => `${label}: ${formatPaise(value)}`)
        .join(
          "\n",
        )}\n\nOriginal booking breakdown\nAccommodation: ${statement.components.accommodationPaise === null ? "Unavailable" : formatPaise(statement.components.accommodationPaise)}\nTaxes: ${statement.components.taxPaise === null ? "Unavailable" : formatPaise(statement.components.taxPaise)}\nFees: ${statement.components.feesPaise === null ? "Unavailable" : formatPaise(statement.components.feesPaise)}\nBooked extras: ${formatPaise(statement.components.bookedExtrasPaise)}\n${statement.components.bookedExtras.map((r: { name?: string; quantity?: number; amountPaise: number }) => `${r.name} × ${r.quantity ?? 1}: ${formatPaise(r.amountPaise)}`).join("\n")}\n\nCharges and adjustments\n${statement.entries.map((e) => `${e.createdAt ? new Date(e.createdAt).toLocaleString("en-IN", { timeZone: statement.timezone }) : ""} · ${e.description} · ${formatPaise(e.amountPaise)} · ${e.id} · ${e.actorName ?? e.actorId ?? ""}`).join("\n")}\n\nPayments\n${statement.payments.map((p) => `${p.stayQuote ? "Supplemental services" : "Reservation"} · ${p.id} · ${p.type ?? p.status} · ${formatPaise(p.amountPaise)}${p.receiptId ? ` · source ${p.receiptId}` : ""} · ${p.method ?? "online"} · ${p.reference ?? ""} · ${p.createdAt ? new Date(p.createdAt).toLocaleString("en-IN", { timeZone: statement.timezone }) : ""}`).join("\n")}\n\nRefunds\n${statement.refunds.map((r) => `${r.stayQuote ? "Supplemental services" : "Reservation"} · ${r.id} · ${r.status} · ${formatPaise(r.amountPaise)} · source ${r.paymentId}`).join("\n")}\n\nSupplemental services (separate pool)\nAgreed: ${formatPaise(statement.services.totalPaise)}\nReceived: ${formatPaise(statement.services.receivedPaise)}\nCompleted refunds: ${formatPaise(statement.services.completedRefundPaise)}\nPending refunds: ${formatPaise(statement.services.pendingRefundPaise)}\nAwaiting payment: ${formatPaise(statement.services.awaitingPaymentPaise)}\nOutstanding balance: ${formatPaise(statement.services.balanceDuePaise)}\nUnreserved refundable excess: ${statement.serviceWarnings.length ? "Review required" : formatPaise(statement.services.refundableExcessPaise)}\n${statement.services.agreements.map((a) => `${a.title ?? a.id} · ${a.status} · ${a.settlement}`).join("\n")}\n\n${[...statement.notices, ...statement.warnings, ...statement.serviceWarnings].join("\n")}`;
      win.document.body.append(content);
      win.focus();
      win.print();
    } catch (e) {
      win.close();
      setError(e instanceof Error ? e.message : "Could not prepare statement.");
    }
  }
  if (query.isPending) return <p>Loading billing…</p>;
  if (!data)
    return (
      <p role="alert">
        {query.error instanceof Error
          ? query.error.message
          : "Billing unavailable."}
      </p>
    );
  const viewEntries =
    tab === "Payments"
      ? data.payments
      : tab === "Refunds"
        ? data.refunds
        : tab === "History"
          ? [...data.entries, ...data.payments, ...data.refunds].sort(
              (a, b) =>
                String(b.createdAt ?? "").localeCompare(
                  String(a.createdAt ?? ""),
                ) || b.id.localeCompare(a.id),
            )
          : data.entries;
  return (
    <section
      id="workspace-billing"
      tabIndex={-1}
      className="space-y-4 pb-28"
      aria-label="Folio and billing"
    >
      {/* Warnings & Notices */}
      {[
        ...data.notices,
        ...data.warnings,
        ...data.serviceWarnings,
        ...(data.restriction ? [data.restriction] : []),
      ].map((w) => (
        <p
          role="alert"
          key={w}
          className="rounded-xl border border-amber-200/80 bg-amber-50/90 p-3.5 text-xs text-amber-950 font-medium"
        >
          {w}
        </p>
      ))}

      {/* Folio / Billing Hero Card */}
      <div className="rounded-2xl border border-[#ede7dc] bg-white p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f3efe8] pb-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#fbf5e8] text-[#c89b3c]">
              <Printer className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-[#061224]">Folio / Billing</h3>
              <p className="text-[11px] text-[#8b96aa]">
                Revision {data.revision} · Final agreed amounts
              </p>
            </div>
          </div>
          <button className={outlineButton} onClick={printStatement}>
            <Printer className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
            Print statement
          </button>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-3">
          <div className="rounded-xl border border-[#f0ece4] bg-[#fdfdfc] p-3.5 flex flex-col justify-between min-w-0">
            <div>
              <p className="text-[11px] font-semibold text-[#8b96aa]">Total Charges</p>
              <p className="mt-1 text-xl font-bold text-[#061224] tabular-nums">
                {formatPaise(data.reservation.effectiveTotalPaise)}
              </p>
            </div>
            <p className="mt-1.5 text-[11px] text-[#8b96aa] truncate">
              {data.reservation.billingNetPaise !== 0 ? (
                <>Room {formatPaise(data.reservation.originalTotalPaise)} {data.reservation.billingNetPaise > 0 ? `+ ${formatPaise(data.reservation.billingNetPaise)}` : `- ${formatPaise(Math.abs(data.reservation.billingNetPaise))}`}</>
              ) : (
                <>Original accommodation</>
              )}
            </p>
          </div>

          <div className="rounded-xl border border-[#f0ece4] bg-[#fdfdfc] p-3.5 flex flex-col justify-between min-w-0">
            <div>
              <p className="text-[11px] font-semibold text-[#8b96aa]">Payments Received</p>
              <p className="mt-1 text-xl font-bold text-emerald-700 tabular-nums">
                {formatPaise(data.reservation.receivedPaise)}
              </p>
            </div>
            <p className="mt-1.5 text-[11px] text-[#8b96aa]">
              {data.payments.length} payment{data.payments.length === 1 ? "" : "s"} recorded
            </p>
          </div>

          <div className={`rounded-xl border p-3.5 flex flex-col justify-between min-w-0 ${
            data.reservation.balanceDuePaise > 0 
              ? "bg-amber-50/70 border-amber-200/80" 
              : data.reservation.balanceDuePaise < 0
                ? "bg-blue-50/70 border-blue-200/80"
                : "bg-emerald-50/70 border-emerald-200/80"
          }`}>
            <div>
              <div className="flex items-center justify-between gap-1">
                <p className="text-[11px] font-semibold text-[#8b96aa]">Balance Due</p>
                <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                  data.reservation.balanceDuePaise > 0
                    ? "bg-amber-100 text-amber-900 border border-amber-200/60"
                    : data.reservation.balanceDuePaise < 0
                      ? "bg-blue-100 text-blue-900 border border-blue-200/60"
                      : "bg-emerald-100 text-emerald-900 border border-emerald-200/60"
                }`}>
                  {data.reservation.balanceDuePaise > 0 
                    ? "Pending" 
                    : data.reservation.balanceDuePaise < 0 
                      ? "Refund due" 
                      : "Settled"}
                </span>
              </div>
              <p className={`mt-1 text-xl font-bold tabular-nums ${
                data.reservation.balanceDuePaise > 0 
                  ? "text-amber-950" 
                  : data.reservation.balanceDuePaise < 0 
                    ? "text-blue-950" 
                    : "text-emerald-900"
              }`}>
                {formatPaise(data.reservation.balanceDuePaise)}
              </p>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-600 truncate">
              {data.reservation.balanceDuePaise > 0 ? "Outstanding guest payment" : "No balance due"}
            </p>
          </div>
        </div>
      </div>

      {/* Folio Ledger (Charges, Payments, Refunds, History) */}
      <div className="rounded-2xl border border-[#ede7dc] bg-white shadow-xs overflow-hidden">
        {/* Card Header with View Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#f3efe8] p-4 sm:px-5">
          <h4 className="text-sm font-bold text-[#061224]">Itemized Transactions</h4>
          <nav aria-label="Billing views" className="flex items-center gap-1 rounded-xl bg-[#f4f2ee] p-1">
            {["Charges", "Payments", "Refunds", "History"].map((t) => (
              <button
                key={t}
                aria-pressed={tab === t}
                className={`min-h-[28px] px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  tab === t
                    ? "bg-white text-[#061224] shadow-xs"
                    : "text-[#68758c] hover:text-[#061224]"
                }`}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </nav>
        </div>

        {/* Desktop Table View */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{tab} for this reservation</caption>
            <thead className="border-b border-[#f3efe8] bg-[#faf8f5] text-[10px] font-bold uppercase tracking-wider text-[#8b96aa]">
              <tr>
                <th scope="col" className="py-2.5 pl-4 sm:pl-5">Entry / source</th>
                <th scope="col" className="py-2.5 px-3">Date / staff</th>
                <th scope="col" className="py-2.5 px-3">Status</th>
                <th scope="col" className="py-2.5 pr-4 sm:pr-5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3efe8]">
              {viewEntries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-xs text-[#8b96aa]">
                    No {tab.toLowerCase()} recorded yet.
                  </td>
                </tr>
              ) : (
                viewEntries.map((e) => {
                  const title = formatEntryTitle(e.description, e.type, e.status);
                  const staff = formatStaffName(e.actorName, e.actorId);
                  const paymentInfo = formatPaymentDetails(e.method, e.reference);
                  const badge = formatStatusBadge(e.status, e.type);

                  return (
                    <tr key={e.sourceId ?? e.id} data-entry-id={e.id} className="hover:bg-[#faf9f6] transition-colors">
                      <td className="max-w-64 py-3 pl-4 sm:pl-5">
                        <p className="font-semibold text-xs text-[#061224]">
                          {title}
                        </p>
                        {e.stayQuote && (
                          <p className="text-[11px] text-[#8b96aa]">
                            Supplemental services
                          </p>
                        )}
                        {paymentInfo && (
                          <p className="text-[11px] text-[#68758c] mt-0.5">
                            {paymentInfo}
                          </p>
                        )}
                        {tab === "History" && e.reason && (
                          <p className="mt-1 text-[11px] text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                            <span className="font-semibold text-slate-700">Note:</span> {e.reason}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs text-[#68758c]">
                        <p className="font-medium text-[#061224]">
                          {e.createdAt
                            ? new Date(e.createdAt).toLocaleString("en-IN", {
                                timeZone: data.timezone,
                              })
                            : ""}
                        </p>
                        <p className="text-[#8b96aa] text-[11px] mt-0.5">{staff}</p>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 pr-4 sm:pr-5 text-right font-bold text-xs tabular-nums text-[#061224]">
                        {formatPaise(e.amountPaise)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile List View */}
        <ul className="divide-y divide-[#f3efe8] px-4 sm:hidden">
          {viewEntries.length === 0 ? (
            <li className="py-8 text-center text-xs text-[#8b96aa]">
              No {tab.toLowerCase()} recorded yet.
            </li>
          ) : (
            viewEntries.map((e) => {
              const title = formatEntryTitle(e.description, e.type, e.status);
              const staff = formatStaffName(e.actorName, e.actorId);
              const paymentInfo = formatPaymentDetails(e.method, e.reference);
              const badge = formatStatusBadge(e.status, e.type);

              return (
                <li
                  key={e.sourceId ?? e.id}
                  data-entry-id={e.id}
                  className="grid gap-1.5 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-xs text-[#061224]">
                        {title}
                      </p>
                      {e.stayQuote && (
                        <p className="text-[11px] text-[#8b96aa]">
                          Supplemental services
                        </p>
                      )}
                      {paymentInfo && (
                        <p className="text-[11px] text-[#68758c]">
                          {paymentInfo}
                        </p>
                      )}
                    </div>
                    <strong className="tabular-nums font-bold text-xs text-[#061224]">
                      {formatPaise(e.amountPaise)}
                    </strong>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#8b96aa]">
                    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ${badge.className}`}>
                      {badge.label}
                    </span>
                    {e.createdAt && (
                      <span>
                        {new Date(e.createdAt).toLocaleString("en-IN", {
                          timeZone: data.timezone,
                        })}
                      </span>
                    )}
                    <span>{staff}</span>
                  </div>
                  {tab === "History" && e.reason && (
                    <p className="text-[11px] text-slate-600 bg-slate-50 p-1.5 rounded">
                      <span className="font-semibold text-slate-700">Note:</span> {e.reason}
                    </p>
                  )}
                </li>
              );
            })
          )}
        </ul>

        {tab === "Charges" && data.services.agreements.length > 0 && (
          <div className="border-t border-[#f3efe8] p-4 bg-[#faf8f5]">
            <h4 className="font-bold text-xs text-[#061224]">Service agreements · separate pool</h4>
            <ul className="divide-y divide-slate-100 mt-2">
              {data.services.agreements.map((a) => (
                <li className="py-2 text-xs" key={a.id}>
                  <p className="font-medium text-slate-800">
                    {a.title ?? a.id} · {a.status} ·{" "}
                    {a.settlement?.replaceAll("_", " ")}
                  </p>
                  <p className="text-slate-500 text-[11px]">
                    {a.quote?.status === "accepted"
                      ? `Agreed ${formatPaise(a.quote.amountPaise)}`
                      : "No accepted charge"}
                    {a.quote?.paymentId ? ` · Receipt ${a.quote.paymentId}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Pagination inside card footer */}
        {["Charges", "History"].includes(tab) && (
          <div className="flex items-center justify-between border-t border-[#f3efe8] bg-[#faf8f5] p-3 px-4 sm:px-5">
            <span className="text-[11px] text-[#8b96aa]">
              Showing {tab.toLowerCase()} entries
            </span>
            <div className="flex gap-2">
              <button
                className={outlineButton}
                disabled={!cursor}
                onClick={() => setCursor(undefined)}
              >
                First entries
              </button>
              <button
                className={outlineButton}
                disabled={!data.nextCursor}
                onClick={() => setCursor(data.nextCursor ?? undefined)}
              >
                Older entries
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Post Hotel Charge or Adjustment Form */}
      {(data.capabilities.post || data.capabilities.adjust || frozen) && (
        <form
          className="rounded-2xl border border-[#ede7dc] bg-white p-4 sm:p-5 shadow-xs space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (review || frozen) void submit();
            else {
              reviewRevision.current = data.revision;
              reviewVersion.current = data.statementVersion;
              setReview(true);
            }
          }}
        >
          <div className="border-b border-[#f3efe8] pb-3">
            <h4 className="text-sm font-bold text-[#061224]">
              Post hotel charge or adjustment
            </h4>
            <p className="text-[11px] text-[#8b96aa] mt-0.5">
              Add incidentals, dining, room damages, or manual credits. Use the service request system for existing service agreements.
            </p>
          </div>

          <fieldset
            disabled={busy || frozen || review}
            className="grid gap-3.5 sm:grid-cols-2"
          >
            <label className="block text-[11px] font-semibold text-[#8b96aa]">
              Entry type
              <div className="relative mt-1">
                <select
                  className={selectField}
                  value={action}
                  onChange={(e) => setAction(e.target.value as typeof action)}
                >
                  {data.capabilities.post && <option value="post">Charge</option>}
                  {data.capabilities.adjust && (
                    <>
                      <option value="credit">Credit</option>
                      <option value="correct">Correct entry</option>
                      <option value="void">Void entry</option>
                    </>
                  )}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </div>
              </div>
            </label>

            {["correct", "void"].includes(action) && (
              <label className="block text-[11px] font-semibold text-[#8b96aa]">
                Original entry
                <div className="relative mt-1">
                  <select
                    required
                    className={selectField}
                    value={original}
                    onChange={(e) => setOriginal(e.target.value)}
                  >
                    <option value="">Choose entry</option>
                    {data.entries
                      .filter((e) => !e.originalEntryId)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.description} · {formatPaise(e.amountPaise)}
                        </option>
                      ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  </div>
                </div>
              </label>
            )}

            {action !== "void" && (
              <>
                <label className="block text-[11px] font-semibold text-[#8b96aa]">
                  Category
                  <div className="relative mt-1">
                    <select
                      className={selectField}
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      {[
                        "laundry",
                        "food_beverage",
                        "transport",
                        "damage",
                        "other",
                      ].map((c) => (
                        <option key={c} value={c}>
                          {c.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    </div>
                  </div>
                </label>
                <label className="block text-[11px] font-semibold text-[#8b96aa]">
                  Final amount (₹)
                  <input
                    required
                    inputMode="decimal"
                    placeholder="0.00"
                    className={`mt-1 ${inputField}`}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <label className="block text-[11px] font-semibold text-[#8b96aa] sm:col-span-2">
                  Description
                  <input
                    required
                    minLength={3}
                    maxLength={250}
                    placeholder="Brief description of the charge or service"
                    className={`mt-1 ${inputField}`}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
                <label className="block text-[11px] font-semibold text-[#8b96aa] sm:col-span-2">
                  Charge details
                  <textarea
                    required
                    minLength={3}
                    maxLength={1000}
                    rows={2}
                    placeholder="Detailed explanation of the charge or adjustment for internal records..."
                    className={`mt-1 ${textareaField}`}
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                  />
                </label>
              </>
            )}

            {action !== "post" && (
              <label className="block text-[11px] font-semibold text-[#8b96aa] sm:col-span-2">
                Reason
                <textarea
                  required
                  minLength={3}
                  maxLength={500}
                  rows={2}
                  placeholder="State the reason for this credit, correction, or void..."
                  className={`mt-1 ${textareaField}`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
          </fieldset>

          {review && (
            <p className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950">
              Review: {action} · {description || original} ·{" "}
              {amount ? `₹${amount}` : "Neutralize original amount"}. This will
              change the reservation balance.
            </p>
          )}

          {frozen && (
            <p role="status" className="rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-xs text-blue-950">
              The result is unconfirmed. Retry the saved request to resolve it
              before editing.
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-xs text-rose-900">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              className="inline-flex items-center justify-center min-h-[40px] px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#0b1f3a] hover:bg-[#152e50] active:scale-[0.99] transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={busy}
              type="submit"
            >
              {busy
                ? "Saving…"
                : frozen
                  ? "Retry saved request"
                  : review
                    ? "Confirm posting"
                    : "Review entry"}
            </button>
            {review && !frozen && (
              <button
                className="inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-all shadow-xs"
                type="button"
                onClick={() => setReview(false)}
              >
                Edit draft
              </button>
            )}
          </div>
        </form>
      )}

      {error &&
        !(data.capabilities.post || data.capabilities.adjust || frozen) && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-xs text-rose-900">{error}</p>
        )}
    </section>
  );
}
function totals(data: Folio): [string, number][] {
  const r = data.reservation;
  return [
    ["Original booking", r.originalTotalPaise],
    ["Existing credits", -r.existingCreditPaise],
    ["Hotel adjustments", r.billingNetPaise],
    ["Effective reservation charges", r.effectiveTotalPaise],
    ["Received", r.receivedPaise],
    ["Completed refunds", r.completedRefundPaise],
    ["Pending refunds", r.pendingRefundPaise],
    ["Outstanding balance", r.balanceDuePaise],
    ["Unreserved refundable excess", r.refundableExcessPaise],
  ];
}
