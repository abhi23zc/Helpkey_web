"use client";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowDownLeft,
  Building2,
  ChevronDown,
  History,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import type {
  readDues,
  duesHotels,
  CommandResult,
  Confirmation,
} from "@/lib/dues/service";
import type { Receipt } from "@/lib/dues/domain";
type View = Awaited<ReturnType<typeof readDues>>;
const money = (n: number | null) =>
  n === null
    ? "Not configured"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
      }).format(n / 100);
const date = (v: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(v) ? "UTC" : undefined,
  }).format(new Date(v));
const button =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-amber-600 disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} !border-[#0b2038] !bg-[#0b2038] !text-white hover:!bg-[#173550]`;
const field =
  "mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100 disabled:bg-slate-50";
const methodLabels = {
  bank_transfer: "Bank transfer",
  upi: "UPI",
  cheque: "Cheque",
  cash: "Cash",
  other: "Other",
};
function ConfirmationSummary({
  confirmation: c,
  busy,
  confirm,
  back,
}: {
  confirmation: Confirmation;
  busy: boolean;
  confirm: () => void;
  back: () => void;
}) {
  const isPaymentLike = c.kind === "payment" || c.kind === "report_payment";
  return (
    <section
      role="region"
      aria-label={
        isPaymentLike
          ? "Payment confirmation"
          : "Correction confirmation"
      }
      className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-5"
    >
      <h3 className="text-lg font-bold">
        {c.kind === "report_payment"
          ? `Confirm reported payment (${c.reportReference})`
          : c.kind === "payment"
            ? "Confirm payment received"
            : "Confirm recording correction"}
      </h3>
      <p>
        {c.hotelName} ·{" "}
        <strong>
          {money(isPaymentLike ? c.payment.amountPaise : c.amountPaise)}
        </strong>
      </p>
      {isPaymentLike ? (
        <>
          <p>
            {methodLabels[c.payment.method]} · {c.payment.paymentDate} ·
            Reference: {c.payment.transactionReference}
          </p>
          <p className="text-sm">
            Oldest recorded dues first; bookings recorded at the same time use a
            consistent booking order.
          </p>
        </>
      ) : (
        <>
          <p>{c.reason}</p>
          <p className="text-sm">
            This reverses the entire recording and restores its original booking
            allocations. It does not return money through a bank.
          </p>
        </>
      )}
      <div className="space-y-2">
        {c.allocations.map((a) => (
          <div
            key={a.bookingId}
            className="rounded-xl border border-amber-200 bg-white p-3 text-sm"
          >
            <strong>{a.reference}</strong>
            <p>
              {isPaymentLike
                ? `Payment received ${money(a.amountPaise)} · Remaining dues ${money(a.afterPaise)}`
                : `Restore ${money(a.amountPaise)} to this booking's accounting balance`}
            </p>
          </div>
        ))}
      </div>
      <p className="text-sm">
        {isPaymentLike
          ? "Records money already received externally. No bank transaction or hotel charge will be initiated."
          : "The original payment and this correction remain permanently in history."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button className={primary} disabled={busy} onClick={confirm}>
          {busy
            ? "Saving…"
            : isPaymentLike
              ? "Confirm payment received"
              : "Confirm correction"}
        </button>
        <button className={button} disabled={busy} onClick={back}>
          Back to review
        </button>
      </div>
    </section>
  );
}
export function DuesWorkspace({
  propertyId,
  owner = false,
}: {
  propertyId?: string;
  owner?: boolean;
}) {
  const [selected, setSelected] = useState(propertyId ?? ""),
    [after, setAfter] = useState<string | null>(null),
    [tab, setTab] = useState<"outstanding" | "attention" | "history" | "reports">(
      "outstanding",
    );
  const [chosen, setChosen] = useState<string[]>([]),
    [open, setOpen] = useState(false),
    [amount, setAmount] = useState(""),
    [paymentDate, setPaymentDate] = useState(""),
    [method, setMethod] = useState<Receipt["method"]>("bank_transfer"),
    [reference, setReference] = useState(""),
    [notes, setNotes] = useState("");
  const [replaces, setReplaces] = useState<Receipt | null>(null),
    [correction, setCorrection] = useState<Receipt | null>(null),
    [reason, setReason] = useState(""),
    [preview, setPreview] = useState<Confirmation | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [reportActionMode, setReportActionMode] = useState<
    "record" | "reject" | "flag" | null
  >(null);
  const [reportChosen, setReportChosen] = useState<string[]>([]);
  const [reportReason, setReportReason] = useState("");
  const pending = useRef(new Map<string, string>());
  const hotels = useQuery({
    queryKey: ["dues-hotels", after],
    enabled: !owner,
    queryFn: () =>
      apiFetch<Awaited<ReturnType<typeof duesHotels>>>(
        `/api/admin/dues${after ? `?after=${encodeURIComponent(after)}` : ""}`,
        { cache: "no-store" },
      ),
    retry: false,
  });
  const [reportsAfter, setReportsAfter] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["hotel-dues", owner, selected, reportsAfter],
    enabled: !!selected,
    queryFn: () =>
      apiFetch<View>(
        owner
          ? `/api/partner/properties/${encodeURIComponent(selected)}/dues`
          : `/api/admin/dues?${new URLSearchParams({ propertyId: selected, ...(reportsAfter ? { reportsAfter } : {}) })}`,
        { cache: "no-store" },
      ),
    retry: false,
  });
  const data = query.data,
    maximum =
      data?.outstanding
        .filter((p) => chosen.includes(p.bookingId))
        .reduce((n, p) => n + p.duesPaise, 0) ?? 0;
  const bookingLink = (id: string) =>
    owner
      ? `/partner/reservations?propertyId=${encodeURIComponent(selected)}&bookingId=${encodeURIComponent(id)}`
      : `/admin/bookings?bookingId=${encodeURIComponent(id)}`;
  const accountingLink = owner
    ? `/partner/finances?propertyId=${encodeURIComponent(selected)}`
    : `/admin/accounting?propertyId=${encodeURIComponent(selected)}`;
  async function openReportAttachment(reportId: string) {
    setNotice("");
    try {
      const res = await apiFetch<{ url: string }>(
        `/api/admin/dues/reports/${encodeURIComponent(reportId)}/attachment?propertyId=${encodeURIComponent(selected)}`,
        { cache: "no-store" },
      );
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to open payment proof.",
      );
    }
  }
  function autoSelectOldestForAmount(targetPaise: number) {
    const picked: string[] = [];
    let running = 0;
    for (const p of data?.outstanding ?? []) {
      if (picked.length >= 50) break;
      picked.push(p.bookingId);
      running += p.duesPaise;
      if (running >= targetPaise) break;
    }
    setReportChosen(picked);
    setPreview(null);
  }
  async function refreshDues() {
    setPreview(null);
    const refreshed = await query.refetch();
    if (refreshed.data) {
      const available = new Set(
        refreshed.data.outstanding.map((p) => p.bookingId),
      );
      setChosen((old) => old.filter((id) => available.has(id)));
    }
  }
  async function command(input: Record<string, unknown>) {
    const key = JSON.stringify([selected, input]);
    if (!pending.current.has(key))
      pending.current.set(key, crypto.randomUUID());
    setBusy(true);
    setNotice("");
    try {
      const result = await apiFetch<CommandResult>(
        `/api/admin/dues/commands?propertyId=${encodeURIComponent(selected)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...input,
            requestId: pending.current.get(key),
          }),
        },
      );
      pending.current.delete(key);
      if ("confirmation" in result) setPreview(result.confirmation);
      else {
        setPreview(null);
        setCorrection(null);
        setReplaces(null);
        setOpen(false);
        setChosen([]);
        setActiveReportId(null);
        setReportActionMode(null);
        setReportChosen([]);
        setReportReason("");
        if (result.status === "Rejected") {
          setTab("reports");
          setNotice("Reported payment rejected and owner notified.");
        } else if (result.status === "Pending") {
          setTab("reports");
          setNotice("Unrecordable explanation saved; report remains pending.");
        } else if (result.status === "Recorded") {
          setTab("reports");
          setNotice("Reported payment linked to the existing verified receipt.");
        } else {
          setTab("history");
          setNotice(
            result.status === "Received"
              ? "Payment received recorded. No bank transaction was initiated."
              : "Payment recording corrected. No money was returned through a bank.",
          );
        }
        await Promise.all([
          query.refetch(),
          !owner ? hotels.refetch() : Promise.resolve(),
        ]);
      }
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.status < 500 &&
        error.status !== 408
      ) {
        pending.current.delete(key);
        if (
          [
            "DUES_CONFIRMATION_STALE",
            "DUES_CONFIRMATION_EXPIRED",
            "DUES_CONFIRMATION_USED",
            "DUES_REQUIRES_REVIEW",
          ].includes(error.code)
        ) {
          setPreview(null);
          await refreshDues();
        }
      }
      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to save. Retry the same action to recover its result.",
      );
    } finally {
      setBusy(false);
    }
  }
  function resetHotel(id: string) {
    setReportsAfter(null);
    setSelected(id);
    setChosen([]);
    setPreview(null);
    setCorrection(null);
    setReplaces(null);
    setOpen(false);
    setNotice("");
    setAmount("");
    setPaymentDate("");
    setMethod("bank_transfer");
    setReference("");
    setNotes("");
    setReason("");
    setActiveReportId(null);
    setReportActionMode(null);
    setReportChosen([]);
    setReportReason("");
    setTab("outstanding");
  }
  function reviewPayment() {
    const available = new Set(data?.outstanding.map((p) => p.bookingId) ?? []);
    if (chosen.some((id) => !available.has(id))) {
      setChosen((old) => old.filter((id) => available.has(id)));
      setPreview(null);
      setNotice(
        "Some selected bookings no longer have verified dues. Review the updated selection and maximum before continuing.",
      );
      return;
    }
    if (
      !/^\d+(?:\.\d{1,2})?$/.test(amount.trim()) ||
      !Number.isFinite(Number(amount)) ||
      Number(amount) <= 0
    ) {
      setNotice(
        "Enter an amount in rupees greater than zero, with no more than two decimal places.",
      );
      return;
    }
    if (Number(amount) * 100 > maximum + 0.000001) {
      setNotice(`Maximum for the selected bookings is ${money(maximum)}.`);
      return;
    }
    void command({
      action: "preview_payment",
      payment: {
        bookingIds: chosen,
        amountRupees: amount.trim(),
        paymentDate,
        method,
        transactionReference: reference,
        notes,
        replacesId: replaces?.id ?? null,
      },
    });
  }
  function startReplacement(receipt: Receipt) {
    setReplaces(receipt);
    setCorrection(null);
    setPreview(null);
    setOpen(true);
    setTab("outstanding");
    setChosen(
      data?.outstanding
        .filter((p) =>
          receipt.allocations.some((a) => a.bookingId === p.bookingId),
        )
        .map((p) => p.bookingId) ?? [],
    );
    setAmount(String(receipt.amountPaise / 100));
    setPaymentDate(receipt.paymentDate);
    setMethod(receipt.method);
    setReference(receipt.transactionReference);
    setNotes(receipt.notes);
  }
  return (
    <section
      className="mx-auto min-w-0 max-w-7xl space-y-6 p-4 text-slate-900 sm:p-6 lg:p-8"
      aria-label="Hotel dues"
    >
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-amber-700">
            Hotel settlement
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Hotel Dues</h1>
          <p className="mt-2 text-sm text-slate-600">
            What the hotel owes Helpkey, and payments already received.
          </p>
        </div>
        <ShieldCheck className="text-slate-400" aria-hidden="true" />
      </header>
      {!owner && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <label className="block text-sm font-semibold">
            <Building2 className="mr-2 inline h-4 w-4" />
            Hotel
            <select
              aria-label="Hotel"
              className={field}
              value={selected}
              disabled={busy}
              onChange={(e) => resetHotel(e.target.value)}
            >
              <option value="">Select a hotel</option>
              {selected &&
                !hotels.data?.hotels.some((h) => h.id === selected) && (
                  <option value={selected}>
                    {data?.hotel.name ?? "Selected hotel"}
                  </option>
                )}
              {hotels.data?.hotels.map((h) => (
                <option value={h.id} key={h.id}>
                  {h.name}
                  {h.pendingReportsCount
                    ? ` (${h.pendingReportsCount} pending reports)`
                    : ""}
                </option>
              ))}
            </select>
          </label>
          {hotels.data?.nextCursor && (
            <button
              className={`${button} mt-3`}
              disabled={busy}
              onClick={() => setAfter(hotels.data!.nextCursor)}
            >
              More hotels
            </button>
          )}
          {after && (
            <button
              disabled={busy}
              className={`${button} mt-3`}
              onClick={() => setAfter(null)}
            >
              First hotels
            </button>
          )}
        </div>
      )}
      {(query.error || (!owner && hotels.error)) && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm">
          Unable to load hotel dues. {(query.error || hotels.error)?.message}{" "}
          <button
            className={button}
            onClick={() => {
              if (selected) void refreshDues();
              if (!owner) void hotels.refetch();
            }}
          >
            Retry
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm">
          {notice}
        </p>
      )}
      {selected && query.isPending && <p>Loading hotel dues…</p>}
      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">{data.hotel.name}</h2>
            <div className="flex flex-wrap gap-2">
              <Link className={button} href={accountingLink}>
                View accounting
              </Link>
              <button
                className={button}
                disabled={busy}
                onClick={() => {
                  void refreshDues();
                }}
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: "Outstanding dues",
                detail: "Hotel owes Helpkey · verified balances",
                value: money(data.totals.outstandingPaise),
                icon: Wallet,
              },
              {
                label: "Payments received",
                detail: "Recorded payments, less corrections",
                value: money(data.totals.paymentsReceivedPaise),
                icon: ArrowDownLeft,
              },
              {
                label: "Bookings needing attention",
                detail: "Review before clearing dues",
                value: String(data.totals.bookingsNeedingAttention),
                icon: History,
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <div className="flex justify-between text-sm font-semibold text-slate-600">
                  <span>{card.label}</span>
                  <card.icon className="h-5 w-5 text-slate-400" />
                </div>
                <p className="mt-4 text-3xl font-bold">{card.value}</p>
                <p className="mt-2 text-xs text-slate-500">{card.detail}</p>
              </div>
            ))}
          </div>
          {data.warnings.map((w) => (
            <p
              className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"
              role="status"
              key={w}
            >
              {w}
            </p>
          ))}
          <details className="rounded-2xl border border-slate-200 bg-white p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
              Dues policy
              <ChevronDown className="h-4 w-4" />
            </summary>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>
                Dues limit:{" "}
                {data.policy.duesLimit?.type === "unlimited"
                  ? "Unlimited"
                  : data.policy.duesLimit?.type === "limited"
                    ? money(data.policy.duesLimit.amountPaise)
                    : "Not configured"}
              </p>
              <p>Warning threshold: {money(data.policy.duesWarningPaise)}</p>
              <p>
                Grace period:{" "}
                {data.policy.duesGraceDays === null
                  ? "Not configured"
                  : `${data.policy.duesGraceDays} days`}
              </p>
              <p>
                No overdue dates are applied: the starting event and overdue
                rule have not been defined. These settings do not block
                bookings, collect payments, or deduct from payouts.
              </p>
            </div>
          </details>
          <div
            className="flex flex-wrap gap-2 border-b border-slate-200 pb-3"
            role="tablist"
            aria-label="Dues views"
          >
            {(
              [
                ["outstanding", "Outstanding"],
                ["attention", "Needs attention"],
                ["history", "Payment history"],
                ...(!owner
                  ? ([
                      [
                        "reports",
                        `Reported payments${data.pendingReportsCount ? ` (${data.pendingReportsCount})` : ""}`,
                      ],
                    ] as const)
                  : []),
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                className={tab === value ? primary : button}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "outstanding" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold">Hotel owes Helpkey</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {owner
                      ? "Verified remaining dues by booking."
                      : "Select bookings to record money already received from this hotel."}
                  </p>
                </div>
                {!owner && (
                  <button
                    className={primary}
                    disabled={busy || !chosen.length}
                    onClick={() => {
                      setOpen(true);
                      setCorrection(null);
                      setPreview(null);
                    }}
                  >
                    Record payment received
                  </button>
                )}
              </div>
              {!data.outstanding.length && (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
                  No verified outstanding dues. Check Needs attention for
                  unresolved bookings.
                </div>
              )}
              {data.outstanding.map((p) => (
                <article
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                  key={p.bookingId}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {!owner && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${p.reference}`}
                          checked={chosen.includes(p.bookingId)}
                          disabled={
                            busy ||
                            (chosen.length >= 50 &&
                              !chosen.includes(p.bookingId))
                          }
                          onChange={(e) => {
                            setChosen((old) =>
                              e.target.checked
                                ? [...old, p.bookingId]
                                : old.filter((id) => id !== p.bookingId),
                            );
                            setPreview(null);
                          }}
                        />
                      )}
                      <Link
                        className="font-semibold underline decoration-slate-300 underline-offset-4"
                        href={bookingLink(p.bookingId)}
                      >
                        {p.reference}
                      </Link>
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                        Outstanding
                      </span>
                    </div>
                    <p className="font-bold">
                      Remaining dues {money(p.duesPaise)}
                    </p>
                  </div>
                  <details className="mt-3 text-sm text-slate-500">
                    <summary className="cursor-pointer">
                      Booking details
                    </summary>
                    <p className="mt-2">
                      Dues first recorded:{" "}
                      {p.firstRecordedAt
                        ? date(p.firstRecordedAt)
                        : "Unavailable"}
                    </p>
                    <p>
                      Saved earned commission:{" "}
                      {money(p.details.earnedCommissionPaise)}
                    </p>
                    <p>
                      Guest outstanding:{" "}
                      {money(p.details.guestOutstandingPaise)}
                    </p>
                    <Link className="underline" href={accountingLink}>
                      View agreements and accounting entries
                    </Link>
                  </details>
                </article>
              ))}
              {!owner && open && !correction && (
                <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="text-lg font-bold">
                    {replaces
                      ? "Record linked replacement"
                      : "Record payment received"}
                  </h3>
                  {replaces && (
                    <p className="text-sm text-slate-600">
                      Replacement for {replaces.reference}. The original and
                      correction remain in history; the same bank reference
                      identifies this payment.
                    </p>
                  )}
                  <p className="text-sm">
                    {chosen.length} selected bookings · Maximum amount:{" "}
                    <strong>{money(maximum)}</strong>. Select up to 50 bookings.
                    Oldest recorded dues are cleared first.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-semibold">
                      Amount received (₹)
                      <input
                        aria-label="Amount received in rupees"
                        className={field}
                        inputMode="decimal"
                        value={amount}
                        placeholder="0.00"
                        onChange={(e) => {
                          setAmount(e.target.value);
                          setPreview(null);
                        }}
                      />
                    </label>
                    <label className="text-sm font-semibold">
                      Payment date
                      <input
                        type="date"
                        className={field}
                        value={paymentDate}
                        onChange={(e) => {
                          setPaymentDate(e.target.value);
                          setPreview(null);
                        }}
                      />
                    </label>
                    <label className="text-sm font-semibold">
                      Payment method
                      <select
                        className={field}
                        value={method}
                        disabled={!!replaces}
                        onChange={(e) => {
                          setMethod(e.target.value as Receipt["method"]);
                          setPreview(null);
                        }}
                      >
                        {Object.entries(methodLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-semibold">
                      Transaction reference
                      <input
                        className={field}
                        value={reference}
                        disabled={!!replaces}
                        maxLength={200}
                        onChange={(e) => {
                          setReference(e.target.value);
                          setPreview(null);
                        }}
                      />
                    </label>
                  </div>
                  <label className="block text-sm font-semibold">
                    Optional notes
                    <textarea
                      className={field}
                      value={notes}
                      maxLength={1000}
                      onChange={(e) => {
                        setNotes(e.target.value);
                        setPreview(null);
                      }}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={primary}
                      disabled={
                        busy ||
                        !chosen.length ||
                        !paymentDate ||
                        !reference.trim()
                      }
                      onClick={reviewPayment}
                    >
                      Review allocation
                    </button>
                    <button
                      className={button}
                      disabled={busy}
                      onClick={() => {
                        setOpen(false);
                        setReplaces(null);
                        setPreview(null);
                      }}
                    >
                      Close
                    </button>
                  </div>
                </section>
              )}
            </div>
          )}
          {tab === "attention" && (
            <div className="space-y-4">
              {!data.attention.length && (
                <p className="rounded-2xl border bg-white p-6 text-slate-500">
                  No bookings need attention.
                </p>
              )}
              {data.attention.map((p) => (
                <article
                  key={p.bookingId}
                  className="space-y-2 rounded-2xl border border-amber-200 bg-white p-4"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <Link
                      className="font-semibold underline"
                      href={bookingLink(p.bookingId)}
                    >
                      {p.reference}
                    </Link>
                    <span className="text-sm font-semibold text-amber-800">
                      Needs attention
                    </span>
                  </div>
                  <p className="text-sm">
                    Last recorded dues: {money(p.duesPaise)} · Excluded from
                    verified outstanding dues.
                  </p>
                  {p.reasons.map((r) => (
                    <p key={r} className="text-sm text-slate-600">
                      {r}
                    </p>
                  ))}
                  <details className="text-sm">
                    <summary className="cursor-pointer">Review details</summary>
                    <Link
                      className="mt-2 inline-block underline"
                      href={accountingLink}
                    >
                      Open booking accounting and saved service agreements
                    </Link>
                    <p className="break-all text-xs text-slate-400">
                      Booking reference in records: {p.bookingId}
                    </p>
                  </details>
                </article>
              ))}
            </div>
          )}
          {tab === "history" && (
            <div className="space-y-4">
              {!data.payments.length && (
                <p className="rounded-2xl border bg-white p-6 text-slate-500">
                  No payments received have been recorded.
                </p>
              )}
              {data.payments.map((p) => (
                <article
                  key={p.id}
                  className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <h3 className="font-bold">
                        {p.status === "Corrected"
                          ? "Payment recording corrected"
                          : "Payment received"}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {date(p.paymentDate)} · {methodLabels[p.method]} ·{" "}
                        {p.transactionReference}
                      </p>
                    </div>
                    <strong className="text-xl">{money(p.amountPaise)}</strong>
                  </div>
                  {p.correction && (
                    <p className="rounded-xl bg-slate-50 p-3 text-sm">
                      Correction reason: {p.correction.reason}. No money was
                      returned through a bank.
                    </p>
                  )}
                  {p.needsAttention && (
                    <p className="text-sm text-amber-800">
                      An included booking needs attention. The recorded payment
                      remains in history.
                    </p>
                  )}
                  <details className="text-sm">
                    <summary className="cursor-pointer font-semibold">
                      Booking allocations and history
                    </summary>
                    <div className="mt-3 space-y-3">
                      {p.allocations.map((a) => (
                        <p key={a.bookingId}>
                          <Link
                            className="underline"
                            href={bookingLink(a.bookingId)}
                          >
                            {a.reference}
                          </Link>{" "}
                          · {money(a.amountPaise)} received · Remaining dues at
                          recording {money(a.afterPaise)}
                        </p>
                      ))}
                      <p>
                        Recorded by {p.actorId} · {date(p.recordedAt)}
                      </p>
                      {p.notes && <p>{p.notes}</p>}
                      {p.replacesId && (
                        <p>
                          Linked replacement of{" "}
                          {data.payments.find((r) => r.id === p.replacesId)
                            ?.reference ?? p.replacesId}
                        </p>
                      )}
                      {p.replacedBy && (
                        <p>
                          Replaced by{" "}
                          {data.payments.find((r) => r.id === p.replacedBy)
                            ?.reference ?? p.replacedBy}
                        </p>
                      )}
                      {p.history.map((h, i) => (
                        <p key={i}>
                          {h.type} · {h.at} · {h.actorId}
                        </p>
                      ))}
                      <Link
                        className="inline-block underline"
                        href={accountingLink}
                      >
                        View journal entries
                      </Link>
                      <p className="break-all text-xs text-slate-400">
                        {p.reference} · {p.id}
                      </p>
                    </div>
                  </details>
                  {!owner && (
                    <div className="flex flex-wrap gap-2">
                      {!p.correction && (
                        <button
                          className={button}
                          disabled={busy}
                          onClick={() => {
                            setCorrection(p);
                            setReason("");
                            setPreview(null);
                            setOpen(false);
                          }}
                        >
                          Correct recording
                        </button>
                      )}
                      {p.correction && !p.replacedBy && (
                        <button
                          className={button}
                          disabled={busy}
                          onClick={() => startReplacement(p)}
                        >
                          Record replacement
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
          {!owner && correction && (
            <section className="space-y-4 rounded-2xl border border-amber-200 bg-white p-5">
              <h3 className="text-lg font-bold">Correct payment recording</h3>
              <p className="text-sm">
                {correction.transactionReference} ·{" "}
                {money(correction.amountPaise)}. Reverse the entire recording,
                then enter a linked replacement if needed. No money is returned
                through a bank.
              </p>
              <label className="block text-sm font-semibold">
                Correction reason
                <textarea
                  className={field}
                  value={reason}
                  maxLength={500}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setPreview(null);
                  }}
                />
              </label>
              <button
                className={primary}
                disabled={busy || reason.trim().length < 3}
                onClick={() =>
                  void command({
                    action: "preview_correction",
                    paymentId: correction.id,
                    reason,
                  })
                }
              >
                Review correction
              </button>
              <button
                className={`${button} ml-2`}
                disabled={busy}
                onClick={() => {
                  setCorrection(null);
                  setPreview(null);
                }}
              >
                Close
              </button>
            </section>
          )}
          {!owner && tab === "reports" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold">Owner-reported dues payments</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Verify reported transfers against bank statements using exact reported details, link to an existing matching receipt, or reject with an owner-visible reason.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {reportsAfter && <button className={button} disabled={busy} onClick={() => setReportsAfter(null)}>Newest reports</button>}
                {data.nextReportsCursor && <button className={button} disabled={busy} onClick={() => setReportsAfter(data.nextReportsCursor)}>Older reports</button>}
              </div>
              {!data.reports.length && (
                <p className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-500">
                  No reported payments submitted for this hotel.
                </p>
              )}
              {data.reports.map((r) => {
                const isActive = activeReportId === r.id;
                const reportSelectedMax = data.outstanding
                  .filter((p) => reportChosen.includes(p.bookingId))
                  .reduce((n, p) => n + p.duesPaise, 0);
                return (
                  <article
                    key={r.id}
                    className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold">{r.reference}</h4>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              r.status === "awaiting_verification"
                                ? "bg-amber-50 text-amber-900"
                                : r.status === "recorded"
                                  ? "bg-emerald-50 text-emerald-800"
                                  : r.status === "rejected"
                                    ? "bg-rose-50 text-rose-800"
                                    : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {r.status.replaceAll("_", " ")}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600">
                          {date(r.paymentDate)} · {methodLabels[r.method]} · Ref:{" "}
                          <strong>{r.transactionReference}</strong>
                        </p>
                        <p className="text-xs text-slate-500">
                          Submitted {r.submittedAt} · Hotel: {data.hotel.name}
                        </p>
                        {r.notes && (
                          <p className="text-xs text-slate-600">Note: {r.notes}</p>
                        )}
                      </div>
                      <strong className="text-xl">{money(r.amountPaise)}</strong>
                    </div>

                    {r.attachment && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className={button}
                          onClick={() => void openReportAttachment(r.id)}
                        >
                          View proof ({r.attachment.fileName})
                        </button>
                      </div>
                    )}

                    {r.unrecordableReason && (
                      <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                        Pending explanation: {r.unrecordableReason}
                      </p>
                    )}

                    {r.rejectionReason && (
                      <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                        Rejection reason: {r.rejectionReason}
                      </p>
                    )}

                    {r.linkedReceipt && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-950">
                        <p>
                          Linked receipt: <strong>{r.linkedReceipt.reference}</strong>{" "}
                          ({r.linkedMode === "linked_existing" ? "Matched existing receipt" : "Recorded from report"})
                        </p>
                        {r.linkedReceipt.correction && (
                          <p className="mt-1 text-amber-900">
                            Receipt later corrected: {r.linkedReceipt.correction.reason}
                            {r.linkedReceipt.replacement
                              ? ` · Replaced by ${r.linkedReceipt.replacement.reference} (${money(r.linkedReceipt.replacement.amountPaise)})`
                              : ""}
                          </p>
                        )}
                      </div>
                    )}

                    {r.status === "awaiting_verification" && (
                      <div className="space-y-3 border-t border-slate-100 pt-3">
                        {r.matchingReceipts.length > 0 && (
                          <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm">
                            <p className="font-semibold text-sky-950">
                              Matching recorded receipt found
                            </p>
                            {r.matchingReceipts.map((m) => (
                              <div
                                key={m.id}
                                className="flex flex-wrap items-center justify-between gap-2"
                              >
                                <span>
                                  {m.reference} · {money(m.amountPaise)} ·{" "}
                                  {m.paymentDate} · {m.transactionReference}
                                </span>
                                <button
                                  type="button"
                                  disabled={busy}
                                  className={primary}
                                  onClick={() =>
                                    void command({
                                      action: "link_report_receipt",
                                      reportId: r.id,
                                      paymentId: m.id,
                                    })
                                  }
                                >
                                  Link to matching receipt
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            className={primary}
                            onClick={() => {
                              setActiveReportId(r.id);
                              setReportActionMode("record");
                              setPreview(null);
                              autoSelectOldestForAmount(r.amountPaise);
                            }}
                          >
                            Record reported payment
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className={button}
                            onClick={() => {
                              setActiveReportId(r.id);
                              setReportActionMode("reject");
                              setReportReason("");
                              setPreview(null);
                            }}
                          >
                            Reject report
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className={button}
                            onClick={() => {
                              setActiveReportId(r.id);
                              setReportActionMode("flag");
                              setReportReason(r.unrecordableReason ?? "");
                              setPreview(null);
                            }}
                          >
                            Note unrecordable
                          </button>
                        </div>

                        {isActive && reportActionMode === "record" && (
                          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold">
                                Select collectible bookings for {money(r.amountPaise)} (Selected max: {money(reportSelectedMax)})
                              </p>
                              <button
                                type="button"
                                className={button}
                                onClick={() => autoSelectOldestForAmount(r.amountPaise)}
                              >
                                Auto-select oldest
                              </button>
                            </div>
                            <div className="max-h-56 space-y-2 overflow-y-auto">
                              {data.outstanding.map((p) => (
                                <label
                                  key={p.bookingId}
                                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                >
                                  <span className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={reportChosen.includes(p.bookingId)}
                                      disabled={
                                        busy ||
                                        (reportChosen.length >= 50 &&
                                          !reportChosen.includes(p.bookingId))
                                      }
                                      onChange={(e) => {
                                        setReportChosen((old) =>
                                          e.target.checked
                                            ? [...old, p.bookingId]
                                            : old.filter((id) => id !== p.bookingId),
                                        );
                                        setPreview(null);
                                      }}
                                    />
                                    <span>{p.reference}</span>
                                  </span>
                                  <strong>{money(p.duesPaise)}</strong>
                                </label>
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={busy || !reportChosen.length}
                                className={primary}
                                onClick={() =>
                                  void command({
                                    action: "preview_report_payment",
                                    reportId: r.id,
                                    bookingIds: reportChosen,
                                  })
                                }
                              >
                                Review report allocation
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                className={button}
                                onClick={() => {
                                  setActiveReportId(null);
                                  setReportActionMode(null);
                                }}
                              >
                                Close
                              </button>
                            </div>
                          </div>
                        )}

                        {isActive &&
                          (reportActionMode === "reject" ||
                            reportActionMode === "flag") && (
                            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                              <label className="block text-sm font-semibold">
                                {reportActionMode === "reject"
                                  ? "Owner-visible rejection reason"
                                  : "Admin explanation (report remains pending)"}
                                <textarea
                                  className={field}
                                  maxLength={500}
                                  value={reportReason}
                                  onChange={(e) => setReportReason(e.target.value)}
                                />
                              </label>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={busy || reportReason.trim().length < 3}
                                  className={primary}
                                  onClick={() =>
                                    void command({
                                      action:
                                        reportActionMode === "reject"
                                          ? "reject_report"
                                          : "flag_report_unrecordable",
                                      reportId: r.id,
                                      reason: reportReason.trim(),
                                    })
                                  }
                                >
                                  {reportActionMode === "reject"
                                    ? "Confirm rejection"
                                    : "Save pending explanation"}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  className={button}
                                  onClick={() => {
                                    setActiveReportId(null);
                                    setReportActionMode(null);
                                  }}
                                >
                                  Close
                                </button>
                              </div>
                            </div>
                          )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          {!owner && preview && (
            <ConfirmationSummary
              confirmation={preview}
              busy={busy}
              back={() => setPreview(null)}
              confirm={() =>
                void command({
                  action:
                    preview.kind === "payment"
                      ? "record_payment"
                      : preview.kind === "report_payment"
                        ? "record_report_payment"
                        : "correct_payment",
                  confirmationId: preview.id,
                })
              }
            />
          )}
        </>
      )}
    </section>
  );
}
