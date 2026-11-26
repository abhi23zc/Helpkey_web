"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  History,
  Info,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { AssessmentEditor } from "./deduction-editor";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import type {
  readPayouts,
  payoutHotels,
  previewPayout,
} from "@/lib/payouts/service";

const categories = [
  "commissionTax",
  "statutory",
  "gatewayFees",
  "other",
] as const;
const labels = {
  commissionTax: "Commission tax",
  statutory: "Statutory deductions",
  gatewayFees: "Gateway fees",
  other: "Other adjustments",
};
type View = Awaited<ReturnType<typeof readPayouts>>;
type Position = View["positions"][number];
type Payout = View["payouts"][number];
type Review = Awaited<ReturnType<typeof previewPayout>>;
type Tab = "ready" | "attention" | "history";
const money = (n: number | null | undefined) =>
  n == null
    ? "Not assessed"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
      }).format(n / 100);
const date = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      }).format(new Date(value))
    : "Not checked out";
const button =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} !border-[#0b2038] !bg-[#0b2038] !text-white hover:!bg-[#173550]`;
const field =
  "mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100 disabled:bg-slate-50";
const disclosure =
  "flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-600 [&::-webkit-details-marker]:hidden";
const reserved = (p: Position) =>
  !!p.reservation && p.reservation.status !== "released";
const ready = (p: Position) => p.eligible && !reserved(p);
function bookingStatus(p: Position) {
  if (ready(p))
    return {
      label: "Ready to pay",
      detail: "Checks complete. You can include this booking in a payout.",
      tone: "bg-emerald-50 text-emerald-800",
    };
  if (!p.baseReasons.length)
    return {
      label: "Review deductions",
      detail: "Confirm the deductions to calculate the final hotel payment.",
      tone: "bg-amber-50 text-amber-900",
    };
  if (p.baseReasons.includes("Saved payout waiting period has not elapsed."))
    return {
      label: "Waiting period",
      detail: `Available after ${date(p.eligibleAt)}, once all checks are complete.`,
      tone: "bg-blue-50 text-blue-800",
    };
  if (p.baseReasons.includes("Booking is not accounting enrolled."))
    return {
      label: "Historical booking",
      detail:
        "Excluded from payouts. Review its original agreement in accounting if it needs to be included.",
      tone: "bg-slate-100 text-slate-600",
    };
  if (
    p.baseReasons.includes("Completed, reconciled checkout is required.") &&
    !p.checkoutAt
  )
    return {
      label: "Awaiting checkout",
      detail: "The stay must finish before this booking can become payable.",
      tone: "bg-blue-50 text-blue-800",
    };
  return {
    label: "Review required",
    detail:
      "Check the booking details and accounting before preparing a payout.",
    tone: "bg-amber-50 text-amber-900",
  };
}
function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="mb-4 rounded-full bg-slate-50 p-4">
        <Wallet className="size-6 text-slate-400" />
      </span>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
        {children}
      </p>
    </div>
  );
}
function PaymentForm({
  payout,
  busy,
  submit,
}: {
  payout: Payout;
  busy: boolean;
  submit: (input: Record<string, unknown>) => Promise<boolean>;
}) {
  const [paymentDate, setDate] = useState(""),
    [method, setMethod] = useState("bank_transfer"),
    [reference, setReference] = useState(""),
    [notes, setNotes] = useState(""),
    [confirm, setConfirm] = useState(false),
    [reason, setReason] = useState(""),
    [bankAcknowledgement, setBankAcknowledgement] = useState<string | null>(
      null,
    );
  return (
    <div className="mt-5 space-y-3">
      <details className="rounded-xl border border-slate-200 p-4">
        <summary className={disclosure}>
          Record payment
          <ArrowRight className="size-4" />
        </summary>
        <p className="my-4 text-sm leading-6 text-slate-500">
          After paying the hotel through your bank or UPI, record the completed
          payment here.
        </p>
        <fieldset
          disabled={busy || !!payout.reviewWarnings.length}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Payment date
              <input
                className={field}
                type="date"
                value={paymentDate}
                onChange={(e) => {
                  setDate(e.target.value);
                  setConfirm(false);
                }}
              />
            </label>
            <label className="block text-sm font-medium">
              Payment method
              <select
                className={field}
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value);
                  setConfirm(false);
                }}
              >
                {[
                  ["bank_transfer", "Bank transfer"],
                  ["upi", "UPI"],
                  ["cheque", "Cheque"],
                  ["cash", "Cash"],
                  ["other", "Other"],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm font-medium">
            Transaction reference (required)
            <input
              className={field}
              maxLength={200}
              value={reference}
              onChange={(e) => {
                setReference(e.target.value);
                setConfirm(false);
              }}
            />
          </label>
          <label className="block text-sm font-medium">
            Optional payment notes
            <textarea
              className={field}
              maxLength={1000}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setConfirm(false);
              }}
            />
          </label>
          {payout.bankAcknowledgementRequired && (
            <label className="block rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
              <p className="mb-3">
                Bank details changed after preparation, or the prepared payout
                has no bank baseline. Current account:{" "}
                {payout.currentBank
                  ? `${payout.currentBank.holderName} · ${payout.currentBank.bankName} · ${payout.currentBank.maskedAccount} · ${payout.currentBank.ifsc}`
                  : "No bank account saved for the current owner"}
                . Review the external payment destination.
              </p>
              <input
                type="checkbox"
                checked={bankAcknowledgement === payout.currentBankVersion}
                onChange={(e) => {
                  setBankAcknowledgement(
                    e.target.checked ? payout.currentBankVersion : null,
                  );
                  setConfirm(false);
                }}
              />{" "}
              I acknowledge the current bank details and have checked the
              payment destination.
            </label>
          )}
          {!confirm ? (
            <button
              className={primary}
              disabled={
                !paymentDate ||
                !reference.trim() ||
                (payout.bankAcknowledgementRequired &&
                  bankAcknowledgement !== payout.currentBankVersion)
              }
              onClick={() => setConfirm(true)}
            >
              Review payment
              <ArrowRight className="size-4" />
            </button>
          ) : (
            <div
              role="region"
              aria-label="Payment confirmation"
              className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-5"
            >
              <p className="font-semibold">
                Confirm {money(payout.finalPaise)} paid externally to{" "}
                {payout.hotelName}.
              </p>
              <p className="text-sm">
                {payout.reference} ·{" "}
                {payout.bookings.map((b) => b.reference).join(", ")}
              </p>
              <p className="text-sm">
                {date(paymentDate)} · {method.replaceAll("_", " ")} ·{" "}
                {reference}
              </p>
              <p className="text-sm">
                Hotel payable {money(payout.grossPaise)} − deductions{" "}
                {money(payout.deductionsPaise)} = payment{" "}
                {money(payout.finalPaise)}. This records a completed payment and
                cannot be edited.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className={primary}
                  disabled={
                    payout.bankAcknowledgementRequired &&
                    bankAcknowledgement !== payout.currentBankVersion
                  }
                  onClick={() =>
                    void submit({
                      action: "pay",
                      payoutId: payout.id,
                      paymentDate,
                      method,
                      reference,
                      notes,
                      ...(bankAcknowledgement
                        ? { acknowledgedBankVersion: bankAcknowledgement }
                        : {}),
                    })
                  }
                >
                  Confirm recorded payment
                </button>
                <button className={button} onClick={() => setConfirm(false)}>
                  Edit details
                </button>
              </div>
            </div>
          )}
        </fieldset>
      </details>
      <details className="px-4 py-2">
        <summary className="cursor-pointer text-sm text-slate-500">
          Cancel this prepared payout
        </summary>
        <label className="mt-3 block text-sm">
          Cancellation reason
          <input
            className={field}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button
          className={`${button} mt-3 !text-red-700`}
          disabled={busy || reason.trim().length < 3}
          onClick={() =>
            void submit({ action: "cancel", payoutId: payout.id, reason })
          }
        >
          Cancel payout
        </button>
      </details>
    </div>
  );
}
function PayoutCard({
  payout: p,
  owner,
  busy,
  submit,
  bookingLink,
}: {
  payout: Payout;
  owner: boolean;
  busy: boolean;
  submit: (input: Record<string, unknown>) => Promise<boolean>;
  bookingLink: (id: string) => string;
}) {
  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${p.status === "Paid" ? "bg-emerald-50 text-emerald-800" : p.status === "Prepared" ? "bg-blue-50 text-blue-800" : "bg-slate-100 text-slate-500"}`}
          >
            {p.status === "Prepared" ? "Prepared · awaiting payment" : p.status}
          </span>
          <h3 className="mt-3 break-all text-sm font-semibold text-slate-900">
            {p.reference}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {p.bookings.length}{" "}
            {p.bookings.length === 1 ? "booking" : "bookings"} · Prepared{" "}
            {date(p.createdAt)}
          </p>
        </div>
        <p className="text-2xl font-semibold tracking-tight text-slate-900">
          {money(p.finalPaise)}
        </p>
      </div>
      {p.reviewWarnings.length > 0 && (
        <div
          role="alert"
          className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
        >
          <p className="font-semibold">Review required before continuing</p>
          {p.reviewWarnings.map((w) => (
            <p key={w} className="mt-1">
              {w}
            </p>
          ))}
        </div>
      )}
      {p.payment && (
        <p className="mt-4 rounded-xl bg-emerald-50/70 p-3 text-sm text-emerald-900">
          Paid {date(p.payment.paymentDate)} ·{" "}
          {p.payment.method.replaceAll("_", " ")} · Reference{" "}
          {p.payment.reference}
          {p.payment.notes && ` · ${p.payment.notes}`}
        </p>
      )}
      <a
        className={`${button} mt-4`}
        target="_blank"
        rel="noopener noreferrer"
        href={
          owner
            ? `/api/partner/properties/${encodeURIComponent(p.propertyId)}/payouts/${encodeURIComponent(p.id)}/statement`
            : `/api/admin/payouts/${encodeURIComponent(p.id)}/statement?propertyId=${encodeURIComponent(p.propertyId)}`
        }
      >
        View statement <ArrowRight className="size-4" />
      </a>
      <details className="mt-5 border-t border-slate-100 pt-4">
        <summary className={disclosure}>
          View payout details
          <ChevronDown className="size-4" />
        </summary>
        <div className="mt-4 space-y-4 text-sm">
          <p>
            Hotel payable {money(p.grossPaise)} − deductions{" "}
            {money(p.deductionsPaise)} = payment {money(p.finalPaise)}
          </p>
          {p.bookings.map((b) => (
            <div
              className="space-y-2 rounded-xl bg-slate-50 p-4"
              key={b.bookingId}
            >
              <Link
                className="font-semibold underline decoration-slate-300 underline-offset-4"
                href={bookingLink(b.bookingId)}
              >
                {b.reference}
              </Link>
              <p>
                Online collected {money(b.verifiedOnlinePaise)} · Collected by
                hotel {money(b.hotelCollectionsPaise)} · Commission{" "}
                {money(b.commissionPaise)}
              </p>
              <p>
                Hotel payable {money(b.grossPaise)} − deductions{" "}
                {money(b.deductionsPaise)} = {money(b.finalPaise)}
              </p>
              {categories.map((k) => {
                const item = b.assessment.items[k];
                return (
                  <p key={k} className="text-slate-600">
                    {labels[k]}:{" "}
                    {item.status === "amount"
                      ? money(item.amountPaise)
                      : item.status.replaceAll("_", " ")}{" "}
                    · {item.status !== "unknown" && item.reason}
                  </p>
                );
              })}
              <p className="text-slate-500">
                Checkout {date(b.checkoutAt)} · Waiting period{" "}
                {b.savedDelayDays ?? "Unknown"} days
              </p>
            </div>
          ))}
          <details>
            <summary className="cursor-pointer text-slate-500">
              Activity and saved settings
            </summary>
            <div className="mt-3 space-y-2 text-xs leading-6 text-slate-500">
              <p>
                Prepared by {p.actorId} · {p.createdAt}
              </p>
              <p>
                Minimum {money(p.policy.minimumPayoutPaise)} ·{" "}
                {p.policy.payoutCycle ?? "Schedule not configured"}{" "}
                {p.policy.payoutWeekday ?? ""} ·{" "}
                {p.policy.timezone ?? "Timezone not configured"}
              </p>
              <p>
                Global revision {p.policy.globalRevision} · Hotel revision{" "}
                {p.policy.hotelRevision}
              </p>
              {p.history.map((event, i) => (
                <p key={i}>
                  {event.type} · {event.at} · {event.actorId}{" "}
                  {event.reason ?? ""}
                </p>
              ))}
            </div>
          </details>
        </div>
      </details>
      {!owner && p.status === "Prepared" && (
        <PaymentForm payout={p} busy={busy} submit={submit} />
      )}
    </article>
  );
}

export function PayoutWorkspace({
  propertyId,
  owner = false,
}: {
  propertyId?: string;
  owner?: boolean;
}) {
  const [selected, setSelected] = useState(propertyId ?? ""),
    [chosen, setChosen] = useState<string[]>([]),
    [notice, setNotice] = useState(""),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false),
    [after, setAfter] = useState<string | null>(null),
    [tab, setTab] = useState<Tab | null>(null),
    [search, setSearch] = useState("");
  const [review, setReview] = useState<{
    value: Review;
    dataUpdatedAt: number;
  } | null>(null);
  const pending = useRef<{ payload: string; requestId: string } | null>(null);
  const lock = useRef(false);
  const hotels = useQuery({
    queryKey: ["payout-hotels", after],
    enabled: !owner,
    queryFn: ({ signal }) =>
      apiFetch<Awaited<ReturnType<typeof payoutHotels>>>(
        `/api/admin/payouts${after ? `?after=${encodeURIComponent(after)}` : ""}`,
        { cache: "no-store", signal },
      ),
    retry: false,
  });
  const query = useQuery({
    queryKey: ["payouts", selected, owner],
    enabled: !!selected,
    queryFn: ({ signal }) =>
      apiFetch<View>(
        owner
          ? `/api/partner/properties/${encodeURIComponent(selected)}/payouts`
          : `/api/admin/payouts?propertyId=${encodeURIComponent(selected)}`,
        { cache: "no-store", signal },
      ),
    retry: false,
  });
  const data = query.data;
  const activeReview =
    review &&
    review.dataUpdatedAt === query.dataUpdatedAt &&
    review.value.hotel.id === selected &&
    JSON.stringify(review.value.bookings.map((b) => b.bookingId).sort()) ===
      JSON.stringify([...chosen].sort())
      ? review.value
      : null;
  async function reviewPayout() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    setFailed(false);
    setReview(null);
    try {
      const value = await apiFetch<Review>(
        `/api/admin/payouts/preview?propertyId=${encodeURIComponent(selected)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingIds: chosen }),
        },
      );
      setReview({ value, dataUpdatedAt: query.dataUpdatedAt });
    } catch (error) {
      setFailed(true);
      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to review this payout. Refresh and try again.",
      );
      await query.refetch();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function selectHotel(value: string) {
    setReview(null);
    setSelected(value);
    setChosen([]);
    setNotice("");
    setTab(null);
    setSearch("");
  }
  async function command(input: Record<string, unknown>) {
    if (lock.current) return false;
    lock.current = true;
    const payload = JSON.stringify({ propertyId: selected, input });
    if (pending.current?.payload !== payload)
      pending.current = { payload, requestId: crypto.randomUUID() };
    setBusy(true);
    setNotice("");
    setFailed(false);
    try {
      const result = await apiFetch<{ status: string }>(
        `/api/admin/payouts/commands?propertyId=${encodeURIComponent(selected)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...input,
            requestId: pending.current.requestId,
          }),
        },
      );
      pending.current = null;
      setReview(null);
      setNotice(
        result.status === "Paid"
          ? "External payment recorded. No transfer was initiated."
          : result.status === "Prepared"
            ? "Payout prepared. Its funds are reserved until you record payment or cancel."
            : result.status === "Cancelled"
              ? "Payout cancelled. The reserved bookings have been released."
              : "Assessment saved. The booking will appear in Ready when all checks are complete.",
      );
      setChosen([]);
      setSearch("");
      setTab(result.status === "Assessed" ? "ready" : "history");
      await query.refetch();
      if (!owner) await hotels.refetch();
      return true;
    } catch (error) {
      if (
        input.action === "pay" &&
        error instanceof ApiClientError &&
        error.code === "BANK_ACKNOWLEDGEMENT_REQUIRED"
      ) {
        pending.current = null;
        await query.refetch();
      }
      if (
        input.action === "prepare" &&
        error instanceof ApiClientError &&
        error.status < 500 &&
        error.status !== 408
      ) {
        setReview(null);
        pending.current = null;
        await query.refetch();
      }
      setFailed(true);
      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to save. Retry the same action to recover its result.",
      );
      return false;
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  const bookingLink = (id: string) =>
    owner
      ? `/partner/reservations?propertyId=${encodeURIComponent(selected)}&bookingId=${encodeURIComponent(id)}`
      : `/admin/bookings?bookingId=${encodeURIComponent(id)}`;
  const journalLink = owner
    ? `/partner/accounting?propertyId=${encodeURIComponent(selected)}`
    : `/admin/accounting?propertyId=${encodeURIComponent(selected)}`;
  const available = data?.positions.filter(ready) ?? [];
  const attention =
    data?.positions.filter((p) => !ready(p) && !reserved(p)) ?? [];
  const awaiting = attention.filter(
    (p) =>
      !p.baseReasons.includes("Booking is not accounting enrolled.") &&
      (p.baseReasons.includes("Completed, reconciled checkout is required.") ||
        p.baseReasons.includes("Saved payout waiting period has not elapsed.")),
  );
  const activeTab = owner
    ? "history"
    : (tab ??
      (available.length
        ? "ready"
        : attention.length
          ? "attention"
          : "history"));
  const selectedRows = available.filter((p) => chosen.includes(p.bookingId));
  const selectedTotal = selectedRows.reduce(
    (n, p) => n + (p.finalPaise ?? 0),
    0,
  );
  const prepared = data?.payouts.filter((p) => p.status === "Prepared") ?? [];
  const rows = (activeTab === "ready" ? available : attention).filter((p) =>
    p.reference.toLowerCase().includes(search.toLowerCase()),
  );
  const payouts =
    data?.payouts.filter((p) =>
      `${p.reference} ${p.status} ${p.payment?.reference ?? ""} ${p.bookings.map((b) => b.reference).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  const minimum = data?.policy.minimumPayoutPaise;
  return (
    <section
      className="mx-auto min-w-0 max-w-7xl space-y-6 p-4 text-slate-900 sm:p-6 lg:p-8"
      aria-label="Hotel payouts"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
            Hotel settlements
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Hotel Payouts
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {owner
              ? "Track payments to your hotel and view their details."
              : "Review bookings, prepare a payout, and record your payment."}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
          <ShieldCheck className="size-4 text-amber-700" />
          {owner
            ? "Your hotel’s payment history"
            : "Payments are made through your bank"}
        </span>
      </header>
      {!owner && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="payout-hotel"
              className="text-xs font-semibold uppercase tracking-wider text-slate-500"
            >
              Hotel
            </label>
            <div className="mt-2 flex items-center gap-3">
              <Building2 className="size-5 shrink-0 text-amber-700" />
              <select
                id="payout-hotel"
                className={`${field} !mt-0 !border-0 !bg-slate-50 font-medium`}
                value={selected}
                disabled={busy}
                onChange={(e) => selectHotel(e.target.value)}
              >
                <option value="">Select a hotel to get started</option>
                {selected &&
                  !hotels.data?.hotels.some((h) => h.id === selected) && (
                    <option value={selected}>
                      {data?.hotel.name ?? "Selected hotel"}
                    </option>
                  )}
                {hotels.data?.hotels.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {selected && (
            <button
              className={button}
              disabled={busy || query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RefreshCw
                className={`size-4 ${query.isFetching ? "animate-spin" : ""}`}
              />
              Refresh payouts
            </button>
          )}
          {hotels.data?.nextCursor && (
            <button
              className={button}
              disabled={busy}
              onClick={() => setAfter(hotels.data!.nextCursor)}
            >
              More hotels
            </button>
          )}
          {after && (
            <button
              className={button}
              disabled={busy}
              onClick={() => setAfter(null)}
            >
              First hotels
            </button>
          )}
        </div>
      )}
      {(query.error || (!owner && hotels.error)) && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p>
            Unable to load payouts. {(query.error || hotels.error)?.message}
          </p>
          <button
            className={button}
            onClick={() => {
              if (selected) void query.refetch();
              if (!owner) void hotels.refetch();
            }}
          >
            Retry
          </button>
        </div>
      )}
      {notice && (
        <p
          role={failed ? "alert" : "status"}
          className={`flex items-start gap-2 rounded-xl border p-4 text-sm ${failed ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}
        >
          {failed ? (
            <Info className="size-4 shrink-0" />
          ) : (
            <CheckCircle2 className="size-4 shrink-0" />
          )}
          {notice}
        </p>
      )}
      {selected && query.isPending && (
        <div
          role="status"
          className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-16 text-sm text-slate-500"
        >
          <Loader2 className="size-5 animate-spin" />
          Loading hotel payouts…
        </div>
      )}
      {!selected && !owner && (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="font-semibold">Your hotels</h2>
            <p className="mt-1 text-sm text-slate-500">
              Choose a hotel to review its bookings and payouts.
            </p>
          </div>
          {hotels.isPending ? (
            <p className="p-6 text-sm text-slate-500">Loading hotels…</p>
          ) : !hotels.data?.hotels.length ? (
            <Empty title="No hotels available">
              Your hotels will appear here when they are available.
            </Empty>
          ) : (
            hotels.data.hotels.map((h) => (
              <button
                disabled={busy}
                className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-5 text-left transition last:border-0 hover:bg-slate-50"
                key={h.id}
                onClick={() => selectHotel(h.id)}
              >
                <span className="flex items-center gap-3">
                  <span className="rounded-xl bg-amber-50 p-3">
                    <Building2 className="size-5 text-amber-700" />
                  </span>
                  <span className="font-medium">
                    {h.name}
                    <span className="mt-1 block text-xs font-normal text-slate-500">
                      {h.totals.reservedPaise > 0
                        ? `${money(h.totals.reservedPaise)} prepared · awaiting payment`
                        : "View bookings and payment history"}
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-4">
                  <span className="text-right">
                    <span className="block text-xs text-slate-500">
                      Ready to pay
                    </span>
                    <span className="font-semibold">
                      {money(h.totals.eligiblePaise)}
                    </span>
                  </span>
                  <ArrowRight className="size-4 text-slate-400" />
                </span>
              </button>
            ))
          )}
        </div>
      )}
      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
            <div>
              <p className="font-semibold">
                Business and payout readiness:{" "}
                {data.readiness?.status ?? "Setup incomplete"}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Advisory setup, separate from booking eligibility and deduction
                checks.
              </p>
            </div>
            <Link
              className={button}
              href={
                data.readiness?.href ??
                (owner
                  ? `/partner/settings/bank?propertyId=${selected}`
                  : `/admin/properties/${selected}/payout-readiness`)
              }
            >
              {owner ? "Manage bank details" : "Review payout readiness"}
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{data.hotel.name}</h2>
            <Link
              className="text-sm text-slate-500 underline"
              href={
                owner
                  ? `/partner/dues?propertyId=${encodeURIComponent(selected)}`
                  : `/admin/dues?propertyId=${encodeURIComponent(selected)}`
              }
            >
              View dues
            </Link>
            <Link
              className="text-sm text-slate-500 underline decoration-slate-300 underline-offset-4 hover:text-slate-900"
              href={journalLink}
            >
              View accounting
            </Link>
          </div>
          {!owner && (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="relative overflow-hidden rounded-2xl bg-[#0b2038] p-6 text-white shadow-sm">
                  <Wallet className="absolute right-5 top-5 size-5 text-amber-300" />
                  <p className="text-sm text-slate-300">Ready to pay</p>
                  <p className="mt-4 text-3xl font-semibold tracking-tight">
                    {money(data.totals.eligiblePaise)}
                  </p>
                  <p className="mt-3 text-xs text-slate-300">
                    {available.length}{" "}
                    {available.length === 1 ? "booking" : "bookings"} cleared
                    for a new payout
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-500">
                      Awaiting eligibility
                    </p>
                    <Clock3 className="size-5 text-amber-600" />
                  </div>
                  <p className="mt-4 text-3xl font-semibold tracking-tight">
                    {awaiting.length}
                    <span className="ml-2 text-base font-normal text-slate-400">
                      {awaiting.length === 1 ? "booking" : "bookings"}
                    </span>
                  </p>
                  <p className="mt-3 text-xs text-slate-500">
                    Waiting for checkout or the payout waiting period
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-500">Paid to date</p>
                    <ArrowDownLeft className="size-5 text-emerald-600" />
                  </div>
                  <p className="mt-4 text-3xl font-semibold tracking-tight">
                    {money(data.totals.paidPaise)}
                  </p>
                  <p className="mt-3 text-xs text-slate-500">
                    External payments recorded for this hotel
                  </p>
                </div>
              </div>
              {prepared.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-5 py-4">
                  <p className="text-sm text-blue-900">
                    <span className="font-semibold">
                      {money(data.totals.reservedPaise)} prepared
                    </span>{" "}
                    · {prepared.length}{" "}
                    {prepared.length === 1
                      ? "payout awaiting payment"
                      : "payouts awaiting payment"}
                  </p>
                  <button
                    className="inline-flex items-center gap-2 text-sm font-semibold text-blue-900"
                    onClick={() => {
                      setTab("history");
                      setSearch("");
                    }}
                  >
                    View prepared payouts
                    <ArrowRight className="size-4" />
                  </button>
                </div>
              )}
              <details className="rounded-xl border border-slate-200 bg-white px-5 py-4">
                <summary className={disclosure}>
                  <span className="flex items-center gap-2">
                    <Info className="size-4" />
                    Payout schedule & collection details
                  </span>
                  <ChevronDown className="size-4" />
                </summary>
                <div className="mt-4 grid gap-4 text-sm text-slate-600 sm:grid-cols-2">
                  <p>
                    Suggested payout date:{" "}
                    <strong className="font-medium text-slate-900">
                      {data.due.date ? date(data.due.date) : data.due.issue}
                    </strong>
                    <span className="mt-1 block text-xs">
                      A guide only. Eligible payouts can be prepared on other
                      days.
                    </span>
                  </p>
                  <p>
                    Minimum payout:{" "}
                    <strong className="font-medium text-slate-900">
                      {minimum === undefined
                        ? "Not configured"
                        : money(minimum)}
                    </strong>
                    <span className="mt-1 block text-xs">
                      Applies to the final total of the selected bookings.
                    </span>
                  </p>
                  <p>
                    Online collections awaiting settlement:{" "}
                    {money(data.totals.pendingOnlinePaise)}
                  </p>
                  <p>
                    Hotel collections awaiting settlement:{" "}
                    {money(data.totals.pendingHotelPaise)}
                  </p>
                  <p>
                    Payable within waiting period:{" "}
                    {money(data.totals.waitingPaise)}
                  </p>
                  <p>
                    Payable awaiting deduction review:{" "}
                    {money(data.totals.unassessedPaise)}
                  </p>
                </div>
              </details>
            </>
          )}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 pt-5 sm:px-6">
              <div
                role="tablist"
                aria-label="Payout sections"
                className="flex max-w-full gap-4 overflow-x-auto sm:gap-6"
              >
                {(owner
                  ? [["history", "Payout history", data.payouts.length]]
                  : [
                      ["ready", "Ready", available.length],
                      ["attention", "Needs attention", attention.length],
                      ["history", "History", data.payouts.length],
                    ]
                ).map(([key, label, count]) => (
                  <button
                    key={key}
                    role="tab"
                    id={`payout-tab-${key}`}
                    aria-controls="payout-panel"
                    aria-selected={activeTab === key}
                    tabIndex={activeTab === key ? 0 : -1}
                    data-payout-tab={key}
                    onKeyDown={(e) => {
                      const keys: Tab[] = owner
                        ? ["history"]
                        : ["ready", "attention", "history"];
                      const index = keys.indexOf(activeTab);
                      const next =
                        e.key === "ArrowRight"
                          ? keys[(index + 1) % keys.length]
                          : e.key === "ArrowLeft"
                            ? keys[(index + keys.length - 1) % keys.length]
                            : e.key === "Home"
                              ? keys[0]
                              : e.key === "End"
                                ? keys[keys.length - 1]
                                : null;
                      if (next) {
                        e.preventDefault();
                        setTab(next);
                        setSearch("");
                        e.currentTarget.parentElement
                          ?.querySelector<HTMLButtonElement>(
                            `[data-payout-tab="${next}"]`,
                          )
                          ?.focus();
                      }
                    }}
                    className={`flex shrink-0 items-center gap-2 border-b-2 pb-4 text-sm font-semibold transition ${activeTab === key ? "border-amber-600 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-700"}`}
                    onClick={() => {
                      setTab(key as Tab);
                      setSearch("");
                    }}
                  >
                    {key === "history" && <History className="size-4" />}
                    {label}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${activeTab === key ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-500"}`}
                    >
                      {count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div
              role="tabpanel"
              id="payout-panel"
              aria-labelledby={`payout-tab-${activeTab}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
                <p className="max-w-lg text-sm leading-6 text-slate-500">
                  {activeTab === "ready"
                    ? "Select cleared bookings to prepare a payout. Up to 50 bookings per payout."
                    : activeTab === "attention"
                      ? "See what each booking needs before it can be paid."
                      : "Track prepared payouts and payments already recorded."}
                </p>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                  <Search className="size-4 text-slate-400" />
                  <input
                    aria-label="Search bookings or payouts"
                    className="w-44 min-w-0 text-sm outline-none"
                    placeholder={
                      activeTab === "history"
                        ? "Search payouts…"
                        : "Search booking…"
                    }
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              {activeTab === "history" ? (
                <div className="space-y-4 p-4 sm:p-6">
                  {!payouts.length ? (
                    <Empty
                      title={search ? "No matching payouts" : "No payouts yet"}
                    >
                      {search
                        ? "Try another booking or payment reference."
                        : "Prepared payouts and recorded payments will appear here."}
                    </Empty>
                  ) : (
                    payouts.map((p) => (
                      <PayoutCard
                        key={p.id}
                        payout={p}
                        owner={owner}
                        busy={busy}
                        submit={command}
                        bookingLink={bookingLink}
                      />
                    ))
                  )}
                </div>
              ) : (
                <>
                  {rows.length === 0 ? (
                    <Empty
                      title={
                        search
                          ? "No matching bookings"
                          : activeTab === "ready"
                            ? "No bookings ready to pay"
                            : "Nothing needs attention"
                      }
                    >
                      {search
                        ? "Try another booking reference."
                        : activeTab === "ready"
                          ? "Completed stays appear here after their waiting period and deduction review. Check Needs attention for the next action."
                          : "Bookings that need review or are waiting for checkout will appear here."}
                    </Empty>
                  ) : (
                    <div>
                      {rows.map((p) => {
                        const status = bookingStatus(p);
                        return (
                          <article
                            className="border-b border-slate-100 px-5 py-5 last:border-b-0 sm:px-6"
                            key={p.bookingId}
                          >
                            <div className="grid items-start gap-4 md:grid-cols-[1fr_1fr_auto]">
                              <div className="flex items-start gap-3">
                                {activeTab === "ready" && (
                                  <input
                                    type="checkbox"
                                    className="mt-1 size-4 accent-[#0b2038]"
                                    aria-label={`Select ${p.reference}`}
                                    disabled={
                                      busy ||
                                      (chosen.length >= 50 &&
                                        !chosen.includes(p.bookingId))
                                    }
                                    checked={chosen.includes(p.bookingId)}
                                    onChange={(e) => {
                                      setReview(null);
                                      setChosen((old) =>
                                        e.target.checked
                                          ? [...old, p.bookingId]
                                          : old.filter(
                                              (id) => id !== p.bookingId,
                                            ),
                                      );
                                    }}
                                  />
                                )}
                                <div>
                                  <Link
                                    className="text-sm font-semibold underline decoration-slate-200 underline-offset-4 hover:text-amber-800"
                                    href={bookingLink(p.bookingId)}
                                  >
                                    {p.reference}
                                  </Link>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {p.checkoutAt
                                      ? `Checked out ${date(p.checkoutAt)}`
                                      : "Checkout pending"}
                                  </p>
                                </div>
                              </div>
                              <div>
                                <span
                                  className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${status.tone}`}
                                >
                                  {status.label}
                                </span>
                                <p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">
                                  {status.detail}
                                </p>
                              </div>
                              <div className="md:text-right">
                                <p className="text-xs text-slate-400">
                                  {ready(p)
                                    ? "Hotel payment"
                                    : "Hotel payable before deductions"}
                                </p>
                                <p className="mt-1 text-lg font-semibold">
                                  {money(
                                    ready(p)
                                      ? p.finalPaise
                                      : p.grossPaise > 0
                                        ? p.grossPaise
                                        : null,
                                  )}
                                </p>
                              </div>
                            </div>
                            <details className="mt-4">
                              <summary
                                className={`${disclosure} justify-start text-xs`}
                              >
                                View details
                                <ChevronDown className="size-3.5" />
                              </summary>
                              <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <p>
                                    Online collected:{" "}
                                    {money(p.verifiedOnlinePaise)}
                                  </p>
                                  <p>
                                    Collected by hotel:{" "}
                                    {money(p.hotelCollectionsPaise)}
                                  </p>
                                  <p>
                                    Earned commission:{" "}
                                    {money(p.commissionPaise)}
                                  </p>
                                  <p>
                                    Hotel payable before deductions:{" "}
                                    {money(p.grossPaise)}
                                  </p>
                                  <p>Deductions: {money(p.deductionsPaise)}</p>
                                  <p>
                                    Final hotel payment: {money(p.finalPaise)}
                                  </p>
                                </div>
                                <p className="text-xs">
                                  Waiting period:{" "}
                                  {p.savedDelayDays ?? "Not configured"} days ·
                                  Eligible from:{" "}
                                  {p.eligibleAt
                                    ? date(p.eligibleAt)
                                    : "Not available yet"}
                                </p>
                                {p.reasons.length > 0 && (
                                  <div className="space-y-1 border-t border-slate-200 pt-3">
                                    <p className="text-xs font-semibold uppercase tracking-wider">
                                      Checks to complete
                                    </p>
                                    {p.reasons.map((r) => (
                                      <p key={r} className="text-xs leading-5">
                                        {r}
                                      </p>
                                    ))}
                                  </div>
                                )}
                                <Link
                                  className="inline-block text-xs font-semibold underline underline-offset-4"
                                  href={journalLink}
                                >
                                  Review in accounting
                                </Link>
                                {ready(p) && (
                                  <AssessmentEditor
                                    key={`${p.bookingId}-${p.assessment?.version ?? 0}`}
                                    position={p}
                                    busy={busy}
                                    save={(items) =>
                                      void command({
                                        action: "assess",
                                        bookingId: p.bookingId,
                                        expectedVersion:
                                          p.assessment?.version ?? 0,
                                        items,
                                      })
                                    }
                                  />
                                )}
                              </div>
                            </details>
                            {!p.baseReasons.length && !ready(p) && (
                              <AssessmentEditor
                                key={`${p.bookingId}-${p.assessment?.version ?? 0}`}
                                position={p}
                                busy={busy}
                                save={(items) =>
                                  void command({
                                    action: "assess",
                                    bookingId: p.bookingId,
                                    expectedVersion: p.assessment?.version ?? 0,
                                    items,
                                  })
                                }
                              />
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                  {activeTab === "ready" && activeReview && (
                    <section
                      aria-label="Payout preparation review"
                      className="m-5 rounded-2xl border border-amber-200 bg-amber-50/40 p-5 sm:m-6 sm:p-6"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                        Check before preparing
                      </p>
                      <h3 className="mt-2 text-lg font-semibold">
                        Review payout for {activeReview.hotel.name}
                      </h3>
                      <div className="my-4 space-y-2 rounded-xl bg-white p-4 text-sm">
                        <p className="flex justify-between gap-4">
                          <span>Hotel amount before deductions</span>
                          <strong>{money(activeReview.grossPaise)}</strong>
                        </p>
                        {categories.map((k) => (
                          <p
                            key={k}
                            className="flex justify-between gap-4 text-slate-600"
                          >
                            <span>{labels[k]}</span>
                            <span>{money(activeReview.deductions[k])}</span>
                          </p>
                        ))}
                        <p className="flex justify-between gap-4">
                          <span>Total deductions</span>
                          <span>{money(activeReview.deductionsPaise)}</span>
                        </p>
                        <p className="flex justify-between gap-4 border-t border-slate-100 pt-3 text-base font-semibold">
                          <span>Final hotel payment</span>
                          <span>{money(activeReview.finalPaise)}</span>
                        </p>
                      </div>
                      <p className="text-xs leading-5 text-slate-600">
                        Commission is already accounted for. Current minimum:{" "}
                        {money(activeReview.minimumPayoutPaise)}. Preparing
                        reserves the selected bookings; it does not send money.
                      </p>
                      <details className="mt-4 text-sm">
                        <summary className={disclosure}>
                          Included bookings ({activeReview.bookings.length})
                          <ChevronDown className="size-4" />
                        </summary>
                        <div className="mt-3 space-y-2">
                          {activeReview.bookings.map((b) => (
                            <p
                              key={b.bookingId}
                              className="flex justify-between gap-3"
                            >
                              <span>{b.reference}</span>
                              <strong>{money(b.finalPaise)}</strong>
                            </p>
                          ))}
                        </div>
                      </details>
                      <div className="mt-5 flex flex-wrap gap-3">
                        <button
                          className={primary}
                          disabled={busy}
                          onClick={() =>
                            void command({
                              action: "prepare",
                              bookingIds: activeReview.bookings.map(
                                (b) => b.bookingId,
                              ),
                              expectedReviewFingerprint:
                                activeReview.reviewFingerprint,
                            })
                          }
                        >
                          {busy && <Loader2 className="size-4 animate-spin" />}
                          Confirm preparation
                        </button>
                        <button
                          className={button}
                          disabled={busy}
                          onClick={() => setReview(null)}
                        >
                          Back to bookings
                        </button>
                      </div>
                    </section>
                  )}
                  {activeTab === "ready" && (
                    <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-5 py-5 sm:px-6">
                      <div>
                        <p className="text-sm font-semibold">
                          {selectedRows.length}{" "}
                          {selectedRows.length === 1 ? "booking" : "bookings"}{" "}
                          selected{" "}
                          <span className="mx-2 text-slate-300">/</span>{" "}
                          {money(selectedTotal)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {minimum === undefined
                            ? "Set a minimum payout in Finance Settings before preparing."
                            : selectedRows.length > 0 && selectedTotal < minimum
                              ? `Select more bookings to reach the ${money(minimum)} minimum.`
                              : "Preparing reserves these funds. Payment is recorded separately."}
                        </p>
                      </div>
                      <button
                        className={primary}
                        disabled={
                          busy ||
                          !selectedRows.length ||
                          minimum === undefined ||
                          selectedTotal < minimum
                        }
                        onClick={() => void reviewPayout()}
                      >
                        {busy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Check className="size-4" />
                        )}
                        Review payout
                        <ArrowRight className="size-4" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <p className="flex items-start gap-2 px-1 text-xs leading-5 text-slate-400">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            {owner
              ? "Only your hotel’s payout records are shown. Contact Helpkey if a payment needs clarification."
              : "Preparing a payout does not send money. Pay the hotel externally, then record the completed payment in History."}
          </p>
        </>
      )}
    </section>
  );
}
