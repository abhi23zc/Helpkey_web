"use client";

import { ServiceReview } from "./service-review";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Info,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import type { readAccount, reconcileAccount } from "@/lib/accounting/service";

type AccountView = Awaited<ReturnType<typeof readAccount>>;
type Position = AccountView["positions"][number];
type Tab = "bookings" | "attention" | "transactions";
const money = (n: number | null | undefined) =>
  n == null
    ? "Not available"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
      }).format(n / 100);
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Date unavailable";
const labels: Record<string, string> = {
  dues_payment: "Payment received from hotel",
  dues_correction: "Hotel payment recording corrected",
  payout: "Hotel payment recorded",
  capture: "Online payment received",
  hotel_collection: "Payment collected by hotel",
  hotel_reversal: "Hotel collection reversed",
  hotel_refund: "Hotel refund recorded",
  online_refund: "Online refund recorded",
  recognition: "Settlement calculation updated",
  recognition_reversal: "Previous calculation replaced",
  assessment: "Booking assessed",
  review_evidence: "Booking change awaiting review",
};
const accountLabels: Record<string, string> = {
  external_payment_clearing: "External payment clearing",
  deduction_commissionTax: "Commission tax clearing",
  deduction_statutory: "Statutory deductions clearing",
  deduction_gatewayFees: "Gateway fees clearing",
  deduction_other: "Other deductions clearing",
  online_clearing: "Online collection clearing",
  hotel_collection_clearing: "Hotel collection clearing",
  pending_online: "Pending online funds",
  pending_hotel: "Pending hotel funds",
  commission_unallocated: "Commission awaiting allocation",
  commission_income: "Earned commission",
  hotel_payable: "Hotel payable",
  hotel_dues: "Hotel dues",
  hotel_dues_receipt_clearing: "Hotel dues receipt clearing",
  review_online: "Online funds requiring review",
  review_hotel: "Hotel funds requiring review",
};
const button =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} !border-[#0b2038] !bg-[#0b2038] !text-white hover:!bg-[#173550]`;
const disclosure =
  "flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-600 [&::-webkit-details-marker]:hidden";
const needsReview = (p: Position) =>
  p.status === "review" ||
  !!p.lastError ||
  (!!p.summary && (p.summary.payablePaise < 0 || p.summary.duesPaise < 0));
function status(p: Position) {
  if (p.status === "historical")
    return {
      label: "Historical · excluded",
      description: "Not included in current balances.",
      tone: "bg-slate-100 text-slate-600",
    };
  if (p.lastError)
    return {
      label: "Update failed",
      description: "Accounting needs another processing attempt.",
      tone: "bg-amber-50 text-amber-900",
    };
  if (p.status === "processing")
    return {
      label: "Updating",
      description:
        "Excluded from totals until its latest changes are processed.",
      tone: "bg-blue-50 text-blue-800",
    };
  if (needsReview(p))
    return {
      label: "Review required",
      description:
        "Check this booking before using its balance for settlement.",
      tone: "bg-amber-50 text-amber-900",
    };
  if (p.status === "recognized")
    return {
      label: "Stay accounted for",
      description:
        "Settlement recorded. Final deductions and payout checks are managed in Payouts.",
      tone: "bg-emerald-50 text-emerald-800",
    };
  return {
    label: "Pending settlement",
    description:
      "Collections stay pending until checkout and accounting checks are complete.",
    tone: "bg-blue-50 text-blue-800",
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
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-4 rounded-full bg-slate-50 p-4">
        <FileText className="size-6 text-slate-400" />
      </span>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
        {children}
      </p>
    </div>
  );
}
function BookingRow({
  position: p,
  owner,
  busy,
  findings,
  bookingLink,
  command,
}: {
  position: Position;
  owner: boolean;
  busy: boolean;
  findings: string[];
  bookingLink: string;
  command: (action: string, bookingId: string) => Promise<void>;
}) {
  const state = status(p);
  return (
    <article className="border-b border-slate-100 px-5 py-5 last:border-b-0 sm:px-6">
      <div className="grid items-start gap-4 md:grid-cols-[1fr_1.2fr_auto]">
        <div>
          <Link
            className="text-sm font-semibold underline decoration-slate-200 underline-offset-4 hover:text-amber-800"
            href={bookingLink}
          >
            {p.reference}
          </Link>
          <p className="mt-1 text-xs text-slate-500">
            {p.summary
              ? "Included in current balances"
              : "Excluded from current balances"}
          </p>
        </div>
        <div>
          <span
            className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${state.tone}`}
          >
            {state.label}
          </span>
          <p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">
            {state.description}
          </p>
        </div>
        <div className="md:text-right">
          <p className="text-xs text-slate-500">
            {p.status === "pending"
              ? "Collected · awaiting settlement"
              : p.status === "review" &&
                  p.summary &&
                  p.summary.reviewOnlinePaise + p.summary.reviewHotelPaise > 0
                ? "Held for review"
                : "Hotel balance"}
          </p>
          <p className="mt-1 text-lg font-semibold">
            {money(
              p.summary
                ? p.status === "pending"
                  ? p.summary.pendingOnlinePaise + p.summary.pendingHotelPaise
                  : p.status === "review" &&
                      p.summary.reviewOnlinePaise + p.summary.reviewHotelPaise >
                        0
                    ? p.summary.reviewOnlinePaise + p.summary.reviewHotelPaise
                    : p.summary.payablePaise
                : null,
            )}
          </p>
          {p.summary && p.summary.duesPaise !== 0 && (
            <p className="mt-1 text-xs text-amber-800">
              Hotel dues {money(p.summary.duesPaise)}
            </p>
          )}
        </div>
      </div>
      {(needsReview(p) || findings.length > 0) && (
        <div className="mt-4 rounded-xl bg-amber-50/70 px-4 py-3 text-xs leading-5 text-amber-900">
          <p className="font-semibold">
            {p.lastError
              ? "An accounting update failed. Open details to inspect it."
              : p.status === "processing"
                ? "An update is pending. Refresh to see its progress."
                : (findings[0] ??
                  p.reasons[0] ??
                  "Review the booking’s collections and settlement details.")}
          </p>
        </div>
      )}
      <details className="mt-4">
        <summary className={`${disclosure} justify-start text-xs`}>
          View booking details
          <ChevronDown className="size-3.5" />
        </summary>
        <div className="mt-3 space-y-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          <div className="grid gap-2 sm:grid-cols-2">
            <p>Calculated commission: {money(p.calculatedCommissionPaise)}</p>
            <p>Guest balance due: {money(p.guestOutstandingPaise)}</p>
            <p>Guest taxes: {money(p.guestTaxPaise)}</p>
            <p>Hotel dues: {money(p.summary?.duesPaise)}</p>
            {p.summary && (
              <>
                <p>
                  Pending online collections:{" "}
                  {money(p.summary.pendingOnlinePaise)}
                </p>
                <p>
                  Pending hotel collections:{" "}
                  {money(p.summary.pendingHotelPaise)}
                </p>
              </>
            )}
          </div>
          {!p.summary && (
            <p className="rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5">
              Excluded from totals. Last recorded hotel balance:{" "}
              {money(p.lastRecordedSummary.payablePaise)} · Last recorded hotel
              dues: {money(p.lastRecordedSummary.duesPaise)}. These are
              reference amounts, not current balances.
            </p>
          )}
          {(p.reasons.length > 0 || p.lastError || findings.length > 0) && (
            <div className="space-y-1 border-t border-slate-200 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider">
                Accounting notes
              </p>
              {p.lastError && (
                <p className="break-words text-xs text-amber-900">
                  Processing failed: {p.lastError}
                </p>
              )}
              {[...new Set([...p.reasons, ...findings])].map((r) => (
                <p key={r} className="text-xs leading-5">
                  {r}
                </p>
              ))}
            </div>
          )}
          {!owner && (
            <details className="border-t border-slate-200 pt-3">
              <summary className={`${disclosure} justify-start text-xs`}>
                <SlidersHorizontal className="size-3.5" />
                Accounting tools
                <ChevronDown className="size-3.5" />
              </summary>
              <p className="my-3 text-xs leading-5">
                {p.status === "historical"
                  ? "Including this booking uses its original saved agreement and adds it to accounting processing. Review the agreement before continuing."
                  : "Use these tools to retry processing or rebuild a cached balance from recorded transactions. They do not transfer money or resolve source discrepancies."}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={busy || p.historicalAgreementAvailable === false}
                  className={button}
                  onClick={() =>
                    void command(
                      p.status === "historical" ? "reconcile_booking" : "retry",
                      p.bookingId,
                    )
                  }
                >
                  {p.status === "historical"
                    ? "Include original booking"
                    : "Retry accounting"}
                </button>
                <button
                  disabled={busy}
                  className={button}
                  onClick={() => void command("rebuild_summary", p.bookingId)}
                >
                  Rebuild summary
                </button>
              </div>
              {p.historicalAgreementAvailable === false && (
                <p className="mt-2 text-xs text-amber-900">
                  The original saved agreement is unavailable. This booking
                  cannot be included.
                </p>
              )}
            </details>
          )}
        </div>
      </details>
    </article>
  );
}
export function AccountingWorkspace({
  propertyId,
  owner = false,
}: {
  propertyId?: string;
  owner?: boolean;
}) {
  const [selected, setSelected] = useState(propertyId ?? ""),
    [cursor, setCursor] = useState<string | null>(null);
  const [paymentsCursor, setPaymentsCursor] = useState<string | null>(null);
  const [hotels, setHotels] = useState<{ id: string; name: string }[]>([]),
    [hotelCursor, setHotelCursor] = useState<string | null>(null),
    [loadingHotels, setLoadingHotels] = useState(false);
  const [notice, setNotice] = useState(""),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState<Tab>("bookings"),
    [search, setSearch] = useState("");
  const [check, setCheck] = useState<Awaited<
    ReturnType<typeof reconcileAccount>
  > | null>(null);
  const lock = useRef(false),
    request = useRef<{ payload: string; id: string } | null>(null);
  const hotelQuery = useQuery({
    queryKey: ["accounting-hotels"],
    enabled: !owner,
    queryFn: ({ signal }) =>
      apiFetch<{
        hotels: { id: string; name: string }[];
        nextCursor: string | null;
      }>("/api/admin/accounting", { signal, cache: "no-store" }),
    retry: false,
  });
  const url = owner
    ? `/api/partner/properties/${encodeURIComponent(selected)}/accounting`
    : `/api/admin/accounting?propertyId=${encodeURIComponent(selected)}`;
  const query = useQuery({
    queryKey: ["hotel-accounting", owner, selected, cursor, paymentsCursor],
    enabled: !!selected,
    queryFn: ({ signal }) =>
      apiFetch<AccountView>(
        `${url}${cursor || paymentsCursor ? `${owner ? "?" : "&"}${new URLSearchParams({ ...(cursor ? { after: cursor } : {}), ...(paymentsCursor ? { paymentsAfter: paymentsCursor } : {}) })}` : ""}`,
        { signal, cache: "no-store" },
      ),
    retry: false,
    refetchInterval: busy ? false : 15000,
  });
  const directory = [
    ...new Map(
      [...(hotelQuery.data?.hotels ?? []), ...hotels].map((h) => [h.id, h]),
    ).values(),
  ];
  const nextHotel =
    hotelCursor ?? (hotels.length ? null : hotelQuery.data?.nextCursor);
  function selectHotel(value: string) {
    setSelected(value);
    setCursor(null);
    setPaymentsCursor(null);
    setCheck(null);
    setNotice("");
    setTab("bookings");
    setSearch("");
  }
  async function moreHotels() {
    if (!nextHotel || loadingHotels) return;
    setLoadingHotels(true);
    try {
      const next = await apiFetch<{
        hotels: { id: string; name: string }[];
        nextCursor: string | null;
      }>(`/api/admin/accounting?after=${encodeURIComponent(nextHotel)}`, {
        cache: "no-store",
      });
      setHotels((old) => [...old, ...next.hotels]);
      setHotelCursor(next.nextCursor);
    } catch (e) {
      setFailed(true);
      setNotice(e instanceof Error ? e.message : "Unable to load more hotels.");
    } finally {
      setLoadingHotels(false);
    }
  }
  async function command(action: string, bookingId: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    setFailed(false);
    setCheck(null);
    const payload = JSON.stringify([selected, action, bookingId]);
    if (request.current?.payload !== payload)
      request.current = { payload, id: crypto.randomUUID() };
    try {
      await apiFetch(
        `/api/admin/accounting/commands?propertyId=${encodeURIComponent(selected)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            bookingId,
            requestId: request.current.id,
          }),
        },
      );
      request.current = null;
      setNotice(
        action === "rebuild_summary"
          ? "Summary rebuilt from recorded transactions. Any source discrepancies still need review."
          : "Accounting update queued. Refresh shortly to see its progress.",
      );
      await query.refetch();
    } catch (e) {
      setFailed(true);
      setNotice(e instanceof Error ? e.message : "Unable to process request.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  async function reconcile() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    setFailed(false);
    setCheck(null);
    try {
      setCheck(
        await apiFetch(
          `/api/admin/accounting/reconciliation?propertyId=${encodeURIComponent(selected)}`,
          { cache: "no-store" },
        ),
      );
    } catch (e) {
      setFailed(true);
      setNotice(e instanceof Error ? e.message : "Unable to check accounting.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  const data = query.data;
  const bookingLink = (id: string) =>
    owner
      ? `/partner/reservations?propertyId=${encodeURIComponent(selected)}&bookingId=${encodeURIComponent(id)}`
      : `/admin/bookings?bookingId=${encodeURIComponent(id)}`;
  const payoutLink = owner
    ? `/partner/payouts?propertyId=${encodeURIComponent(selected)}`
    : `/admin/payouts${selected ? `?propertyId=${encodeURIComponent(selected)}` : ""}`;
  const findings = [
    ...(data?.findings ?? []),
    ...(check?.findings ?? []),
  ].filter(
    (f, i, all) =>
      all.findIndex(
        (x) => x.bookingId === f.bookingId && x.message === f.message,
      ) === i,
  );
  const active = data?.positions.filter((p) => p.status !== "historical") ?? [];
  const historical =
    data?.positions.filter((p) => p.status === "historical") ?? [];
  const attention =
    data?.positions.filter(
      (p) =>
        needsReview(p) || findings.some((f) => f.bookingId === p.bookingId),
    ) ?? [];
  const orphanFindings = findings.filter(
    (f) => !data?.positions.some((p) => p.bookingId === f.bookingId),
  );
  const visible = (tab === "attention" ? attention : active).filter((p) =>
    p.reference.toLowerCase().includes(search.toLowerCase()),
  );
  const oldBookings = historical.filter((p) =>
    p.reference.toLowerCase().includes(search.toLowerCase()),
  );
  const payments = (data?.payments ?? []).filter((e) =>
    `${e.bookingIds.map((id) => data?.positions.find((p) => p.bookingId === id)?.reference ?? id).join(" ")} ${e.title} ${e.purpose}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const transactions =
    data?.transactions.filter((e) =>
      `${data.positions.find((p) => p.bookingId === e.bookingId)?.reference ?? e.bookingId} ${labels[e.type] ?? e.type}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  const transactionBalance = (p: Position) => (
    <div key={p.bookingId}>
      <BookingRow
        key={p.bookingId}
        position={p}
        owner={owner}
        busy={busy}
        findings={findings
          .filter((f) => f.bookingId === p.bookingId)
          .map((f) => f.message)}
        bookingLink={bookingLink(p.bookingId)}
        command={command}
      />
      {!owner && p.hasServices && needsReview(p) && (
        <div className="px-5 pb-4 sm:px-6">
          <ServiceReview
            bookingId={p.bookingId}
            propertyId={selected}
            refresh={() => query.refetch()}
          />
        </div>
      )}
    </div>
  );
  return (
    <section
      className="mx-auto min-w-0 max-w-7xl space-y-6 p-4 text-slate-900 sm:p-6 lg:p-8"
      aria-label="Hotel accounting"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
            Hotel finances
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Hotel Accounting
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Understand hotel balances and see the bookings behind them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            className={button}
            href={
              owner
                ? `/partner/dues?propertyId=${encodeURIComponent(selected)}`
                : `/admin/dues?propertyId=${encodeURIComponent(selected)}`
            }
          >
            View dues
          </Link>
          <Link className={primary} href={payoutLink}>
            View payouts
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </header>
      {!owner && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="accounting-hotel"
              className="text-xs font-semibold uppercase tracking-wider text-slate-500"
            >
              Hotel
            </label>
            <div className="mt-2 flex items-center gap-3">
              <Building2 className="size-5 shrink-0 text-amber-700" />
              <select
                id="accounting-hotel"
                aria-label="Hotel"
                className="min-h-11 w-full rounded-xl border-0 bg-slate-50 px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-200"
                value={selected}
                disabled={busy}
                onChange={(e) => selectHotel(e.target.value)}
              >
                <option value="">Select a hotel to get started</option>
                {selected && !directory.some((h) => h.id === selected) && (
                  <option value={selected}>
                    {data?.hotel.name ?? "Selected hotel"}
                  </option>
                )}
                {directory.map((h) => (
                  <option value={h.id} key={h.id}>
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
              Refresh
            </button>
          )}
          {nextHotel && (
            <button
              className={button}
              disabled={busy || loadingHotels}
              onClick={() => void moreHotels()}
            >
              {loadingHotels ? "Loading…" : "Load more hotels"}
            </button>
          )}
        </div>
      )}
      {(query.error || (!owner && hotelQuery.error)) && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p>
            Unable to load accounting.{" "}
            {(query.error || hotelQuery.error)?.message}
          </p>
          <button
            className={button}
            onClick={() => {
              if (selected) void query.refetch();
              if (!owner) void hotelQuery.refetch();
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
          Loading hotel accounting…
        </div>
      )}
      {!selected && !owner && (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="font-semibold">Your hotels</h2>
            <p className="mt-1 text-sm text-slate-500">
              Choose a hotel to view its balances and transactions.
            </p>
          </div>
          {hotelQuery.isPending ? (
            <p className="p-6 text-sm text-slate-500">Loading hotels…</p>
          ) : directory.length ? (
            directory.map((h) => (
              <button
                className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-6 py-5 text-left last:border-0 hover:bg-slate-50"
                key={h.id}
                onClick={() => selectHotel(h.id)}
              >
                <span className="flex items-center gap-3">
                  <span className="rounded-xl bg-amber-50 p-3">
                    <Building2 className="size-5 text-amber-700" />
                  </span>
                  <span className="text-sm font-medium">{h.name}</span>
                </span>
                <ArrowRight className="size-4 text-slate-400" />
              </button>
            ))
          ) : (
            <Empty title="No hotels available">
              Hotels will appear here when they are available.
            </Empty>
          )}
        </div>
      )}
      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{data.hotel.name}</h2>
            {owner ? (
              <button
                className={button}
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                <RefreshCw className="size-4" />
                Refresh
              </button>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <span
                  className={`size-1.5 rounded-full ${data.enabled ? "bg-emerald-500" : "bg-amber-500"}`}
                />
                {data.enabled
                  ? "Accounting active"
                  : "Accounting not activated"}
              </span>
            )}
          </div>
          {!data.enabled && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Accounting has not been activated. Historical bookings remain
              excluded until explicitly included using their original
              agreements.
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-[#0b2038] p-6 text-white shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-300">Hotel balance</p>
                <Wallet className="size-5 text-amber-300" />
              </div>
              <p className="mt-4 text-3xl font-semibold tracking-tight">
                {money(data.summary.payablePaise)}
              </p>
              <p className="mt-3 text-xs leading-5 text-slate-300">
                {data.summary.payablePaise < 0
                  ? "A negative balance requires review before settlement."
                  : "Owed to the hotel before final deductions. Check Payouts for availability."}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">Hotel dues</p>
                <ArrowRight className="size-5 text-amber-600" />
              </div>
              <p className="mt-4 text-3xl font-semibold tracking-tight">
                {money(data.summary.duesPaise)}
              </p>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                {data.summary.duesPaise < 0
                  ? "A negative dues balance requires review."
                  : "Owed by the hotel to Helpkey before final adjustments."}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">Pending collections</p>
                <Clock3 className="size-5 text-blue-600" />
              </div>
              <p className="mt-4 text-3xl font-semibold tracking-tight">
                {money(
                  data.summary.pendingOnlinePaise +
                    data.summary.pendingHotelPaise,
                )}
              </p>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Online {money(data.summary.pendingOnlinePaise)} · Hotel{" "}
                {money(data.summary.pendingHotelPaise)}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Collected funds awaiting settlement accounting.
              </p>
            </div>
          </div>
          <p className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-xs leading-5 text-amber-900">
            <Info className="mt-0.5 size-4 shrink-0" />
            Balances may change after deduction review. They are not the amount
            ready to pay. Commission is already included in the settlement
            calculation.
          </p>
          {(attention.length > 0 || orphanFindings.length > 0) && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-5 py-4">
              <p className="text-sm text-slate-700">
                <span className="font-semibold">
                  {attention.length}{" "}
                  {attention.length === 1 ? "booking needs" : "bookings need"}{" "}
                  attention
                </span>
                {orphanFindings.length > 0
                  ? " · Additional transaction issues found"
                  : " · Review accounting updates or discrepancies"}
              </p>
              <button
                className="inline-flex items-center gap-2 text-sm font-semibold text-amber-800"
                onClick={() => {
                  setTab("attention");
                  setSearch("");
                }}
              >
                Review issues
                <ArrowRight className="size-4" />
              </button>
            </div>
          )}
          <details className="rounded-xl border border-slate-200 bg-white px-5 py-4">
            <summary className={disclosure}>
              <span className="flex items-center gap-2">
                <Info className="size-4" />
                Balance details & accounting settings
              </span>
              <ChevronDown className="size-4" />
            </summary>
            <div className="mt-4 space-y-4 text-sm text-slate-600">
              <div className="grid gap-3 sm:grid-cols-2">
                <p>
                  Earned commission: {money(data.summary.earnedCommissionPaise)}
                </p>
                <p>
                  Commission awaiting allocation:{" "}
                  {money(data.summary.unallocatedCommissionPaise)}
                </p>
                <p>
                  Online funds requiring review:{" "}
                  {money(data.summary.reviewOnlinePaise)}
                </p>
                <p>
                  Hotel funds requiring review:{" "}
                  {money(data.summary.reviewHotelPaise)}
                </p>
              </div>
              <p className="border-t border-slate-100 pt-3 text-xs leading-5">
                Not yet assessed in these accounting balances:{" "}
                {data.unassessedItems.join(", ")}. Final deduction assessments
                are recorded in Payouts. Amounts awaiting review are not
                included in pending collections.
              </p>
              <p className="text-xs leading-5">
                Accounting start:{" "}
                {data.cutover ? date(data.cutover) : "Not activated"}. Older
                bookings stay excluded until explicitly included using their
                original agreements. Hotel balances and hotel dues are kept
                separate; no automatic offsets are applied.
              </p>
            </div>
          </details>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div
              role="tablist"
              aria-label="Accounting sections"
              className="flex gap-4 overflow-x-auto border-b border-slate-100 px-5 pt-5 sm:gap-6 sm:px-6"
            >
              {(
                [
                  ["bookings", "Bookings", active.length],
                  [
                    "attention",
                    "Needs attention",
                    attention.length + orphanFindings.length,
                  ],
                  ["transactions", "Payment history", null],
                ] as const
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  id={`accounting-tab-${key}`}
                  role="tab"
                  aria-controls="accounting-panel"
                  aria-selected={tab === key}
                  tabIndex={tab === key ? 0 : -1}
                  data-accounting-tab={key}
                  onKeyDown={(e) => {
                    const keys: Tab[] = [
                        "bookings",
                        "attention",
                        "transactions",
                      ],
                      index = keys.indexOf(tab);
                    const next =
                      e.key === "ArrowRight"
                        ? keys[(index + 1) % keys.length]
                        : e.key === "ArrowLeft"
                          ? keys[(index + 2) % keys.length]
                          : e.key === "Home"
                            ? keys[0]
                            : e.key === "End"
                              ? keys[2]
                              : null;
                    if (next) {
                      e.preventDefault();
                      setTab(next);
                      setSearch("");
                      e.currentTarget.parentElement
                        ?.querySelector<HTMLButtonElement>(
                          `[data-accounting-tab="${next}"]`,
                        )
                        ?.focus();
                    }
                  }}
                  onClick={() => {
                    setTab(key);
                    setSearch("");
                  }}
                  className={`flex shrink-0 items-center gap-2 border-b-2 pb-4 text-sm font-semibold transition ${tab === key ? "border-amber-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                >
                  {label}
                  {count !== null && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${tab === key ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-500"}`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id="accounting-panel"
              aria-labelledby={`accounting-tab-${tab}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
                <p className="max-w-lg text-sm leading-6 text-slate-500">
                  {tab === "bookings"
                    ? "See how each current booking contributes to the hotel’s account."
                    : tab === "attention"
                      ? "Review updates and discrepancies. Excluded amounts are shown inside booking details."
                      : "Actual payments and refunds, newest first. Open Accounting activity only if you need calculation details."}
                </p>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                  <Search className="size-4 text-slate-400" />
                  <input
                    aria-label={
                      tab === "transactions"
                        ? "Search this transaction page"
                        : "Search bookings"
                    }
                    className="w-44 min-w-0 text-sm outline-none"
                    placeholder={
                      tab === "transactions"
                        ? "Search this page…"
                        : "Search booking…"
                    }
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              {tab === "transactions" ? (
                <>
                  <div>
                    {payments.length ? (
                      payments.map((p) => (
                        <article
                          key={p.id}
                          className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {p.title}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {p.bookingIds.map((id, index) => (
                                <span key={id}>
                                  {index > 0 && ", "}
                                  <Link
                                    className="underline underline-offset-4"
                                    href={bookingLink(id)}
                                  >
                                    {data.positions.find(
                                      (b) => b.bookingId === id,
                                    )?.reference ?? id}
                                  </Link>
                                </span>
                              ))}{" "}
                              · {p.purpose} · {date(p.occurredAt)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-semibold">
                              {money(p.amountPaise)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {p.status}
                            </p>
                          </div>
                        </article>
                      ))
                    ) : (
                      <Empty
                        title={
                          search
                            ? "No matching payments on this page"
                            : "No payments recorded"
                        }
                      >
                        Only actual collections, refunds and hotel payouts
                        appear here. Calculation updates are kept in Accounting
                        activity below.
                      </Empty>
                    )}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 p-4">
                    {paymentsCursor && (
                      <button
                        className={button}
                        disabled={query.isFetching}
                        onClick={() => {
                          setPaymentsCursor(null);
                          setSearch("");
                        }}
                      >
                        Newest payments
                      </button>
                    )}
                    {data.nextPaymentsCursor && (
                      <button
                        className={button}
                        disabled={query.isFetching}
                        onClick={() => {
                          setPaymentsCursor(data.nextPaymentsCursor);
                          setSearch("");
                        }}
                      >
                        Older payments
                      </button>
                    )}
                  </div>
                  <details className="m-4 rounded-xl border border-slate-200 p-4">
                    <summary className={disclosure}>
                      Accounting activity
                      <ChevronDown className="size-4" />
                    </summary>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      These are calculation updates, not additional payments or
                      refunds. Replaced calculations stay here for audit
                      history.
                    </p>
                    <div>
                      {!transactions.length ? (
                        <Empty
                          title={
                            search
                              ? "No matching transactions on this page"
                              : "No transactions yet"
                          }
                        >
                          {search
                            ? "Try another reference or load a different transaction page."
                            : "Collections and settlement activity will appear here when recorded."}
                        </Empty>
                      ) : (
                        transactions.map((e) => (
                          <details
                            className="border-b border-slate-100 px-5 py-5 last:border-b-0 sm:px-6"
                            key={e.id}
                          >
                            <summary className={`${disclosure} items-start`}>
                              <span className="flex min-w-0 items-start gap-3">
                                <span className="mt-1 rounded-xl bg-slate-50 p-2.5">
                                  <FileText className="size-4 text-slate-500" />
                                </span>
                                <span>
                                  <span className="block font-medium text-slate-900">
                                    {labels[e.type] ?? "Accounting activity"}
                                  </span>
                                  <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">
                                    {data.positions.find(
                                      (p) => p.bookingId === e.bookingId,
                                    )?.reference ?? "Booking unavailable"}{" "}
                                    · {date(e.occurredAt ?? e.recordedAt)}
                                  </span>
                                </span>
                              </span>
                              <span className="flex shrink-0 items-center gap-3">
                                <span className="text-right">
                                  <span className="block font-semibold text-slate-900">
                                    {[
                                      "recognition",
                                      "recognition_reversal",
                                      "assessment",
                                      "review_evidence",
                                    ].includes(e.type)
                                      ? "No payment"
                                      : money(e.amountPaise)}
                                  </span>
                                  <span className="mt-1 block text-xs font-normal text-slate-500">
                                    {e.status === "review"
                                      ? "Needs review"
                                      : e.status === "recognized"
                                        ? "Recorded"
                                        : e.status === "reversed"
                                          ? "Reversed"
                                          : "Pending when recorded"}
                                  </span>
                                </span>
                                <ChevronDown className="size-4 text-slate-400" />
                              </span>
                            </summary>
                            <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                              <Link
                                className="font-semibold underline decoration-slate-300 underline-offset-4"
                                href={bookingLink(e.bookingId)}
                              >
                                Booking{" "}
                                {data.positions.find(
                                  (p) => p.bookingId === e.bookingId,
                                )?.reference ?? e.bookingId}
                              </Link>
                              <p className="text-xs">
                                Recorded {date(e.recordedAt)} · {e.currency} ·{" "}
                                {e.agreementScope === "service"
                                  ? "Separate service agreement"
                                  : "Original accommodation agreement"}
                              </p>
                              {e.reviewReasons?.map((reason) => (
                                <p
                                  className="text-xs text-amber-900"
                                  key={reason}
                                >
                                  {reason}
                                </p>
                              ))}
                              <details>
                                <summary
                                  className={`${disclosure} justify-start text-xs`}
                                >
                                  Journal & source details
                                  <ChevronDown className="size-3.5" />
                                </summary>
                                <div className="mt-3 space-y-2 break-words text-xs leading-5">
                                  <p>Source: {e.sourcePath}</p>
                                  {e.serviceAgreementReference && (
                                    <p>
                                      Service agreement:{" "}
                                      {e.serviceAgreementReference}
                                    </p>
                                  )}
                                  <p>
                                    Agreement v{e.agreementVersion ?? "unknown"}{" "}
                                    · Calculation v
                                    {e.calculationVersion ?? "unknown"} · Global
                                    revision {e.globalRevision ?? "unknown"} ·
                                    Hotel revision{" "}
                                    {e.hotelRevision ?? "unknown"}
                                  </p>
                                  {e.sourceReferences && (
                                    <details>
                                      <summary className="cursor-pointer">
                                        Evidence used
                                      </summary>
                                      {e.sourceReferences.map((source) => (
                                        <p key={source}>{source}</p>
                                      ))}
                                    </details>
                                  )}
                                  {e.reverses && (
                                    <p>Reverses journal entry: {e.reverses}</p>
                                  )}
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                      <thead>
                                        <tr className="border-b border-slate-200">
                                          <th className="py-2 pr-3 font-medium">
                                            Account
                                          </th>
                                          <th className="p-2 text-right font-medium">
                                            Debit
                                          </th>
                                          <th className="p-2 text-right font-medium">
                                            Credit
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {e.lines.map((l, i) => (
                                          <tr
                                            className="border-b border-slate-200/60"
                                            key={i}
                                          >
                                            <td className="py-2 pr-3">
                                              {accountLabels[l.account] ??
                                                l.account}
                                            </td>
                                            <td className="p-2 text-right tabular-nums">
                                              {money(l.debitPaise)}
                                            </td>
                                            <td className="p-2 text-right tabular-nums">
                                              {money(l.creditPaise)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  <p>Reference: {e.id}</p>
                                </div>
                              </details>
                            </div>
                          </details>
                        ))
                      )}
                    </div>
                    <div className="flex flex-wrap justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:px-6">
                      <span className="text-xs text-slate-500">
                        {search
                          ? "Matching entries on this page"
                          : `${data.transactions.length} entries on this page`}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {cursor && (
                          <button
                            className={button}
                            disabled={query.isFetching || busy}
                            onClick={() => {
                              setCursor(null);
                              setSearch("");
                            }}
                          >
                            Newest transactions
                          </button>
                        )}
                        {data.nextCursor && (
                          <button
                            className={button}
                            disabled={query.isFetching || busy}
                            onClick={() => {
                              setCursor(data.nextCursor);
                              setSearch("");
                            }}
                          >
                            Older transactions
                            <ArrowRight className="size-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </details>
                </>
              ) : (
                <>
                  {visible.length ? (
                    visible.map(transactionBalance)
                  ) : (
                    <Empty
                      title={
                        search
                          ? "No matching bookings"
                          : tab === "attention"
                            ? "No booking issues to review"
                            : "No current bookings"
                      }
                    >
                      {search
                        ? "Try another booking reference."
                        : tab === "attention"
                          ? "Bookings with processing issues or accounting discrepancies will appear here."
                          : "Included bookings will appear here as accounting begins."}
                    </Empty>
                  )}
                  {tab === "attention" && orphanFindings.length > 0 && (
                    <div
                      role="alert"
                      className="m-5 space-y-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"
                    >
                      <p className="font-semibold">Transaction issues</p>
                      {orphanFindings.map((f, i) => (
                        <p className="break-words text-xs" key={i}>
                          {f.bookingId}: {f.message}
                        </p>
                      ))}
                    </div>
                  )}
                  {tab === "bookings" && historical.length > 0 && (
                    <details className="border-t border-slate-100 px-5 py-4 sm:px-6">
                      <summary className={disclosure}>
                        Historical bookings · {historical.length}
                        <ChevronDown className="size-4" />
                      </summary>
                      <p className="my-3 text-xs leading-5 text-slate-500">
                        Older bookings are excluded from current balances.
                        Review an original saved agreement before including a
                        booking.
                      </p>
                      {oldBookings.length ? (
                        oldBookings.map(transactionBalance)
                      ) : (
                        <p className="py-4 text-sm text-slate-500">
                          No matching historical bookings.
                        </p>
                      )}
                    </details>
                  )}
                </>
              )}
            </div>
          </div>
          {!owner && (
            <details className="rounded-xl border border-slate-200 bg-white px-5 py-4">
              <summary className={disclosure}>
                <span className="flex items-center gap-2">
                  <ShieldCheck className="size-4" />
                  Accounting health check
                </span>
                <ChevronDown className="size-4" />
              </summary>
              <p className="my-3 text-sm leading-6 text-slate-500">
                Compare saved agreements, collections and recorded transactions.
                This checks for discrepancies without moving money.
              </p>
              <button
                disabled={busy}
                className={button}
                onClick={() => void reconcile()}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                Check accounting
              </button>
              {check && (
                <div
                  role="status"
                  className={`mt-4 rounded-xl p-4 text-sm ${check.findings.length ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}
                >
                  <p className="font-semibold">
                    {check.findings.length
                      ? `${check.findings.length} findings to review`
                      : "Sources, journal and summaries reconcile."}
                  </p>
                  <p className="mt-1 text-xs">
                    Checked {check.checkedBookings} bookings ·{" "}
                    {date(check.checkedAt)}
                  </p>
                  {check.findings.length > 0 && (
                    <button
                      className="mt-3 inline-flex items-center gap-2 text-xs font-semibold underline underline-offset-4"
                      onClick={() => {
                        setTab("attention");
                        setSearch("");
                      }}
                    >
                      View findings in Needs attention
                      <ArrowRight className="size-3.5" />
                    </button>
                  )}
                </div>
              )}
            </details>
          )}
          <p className="flex items-start gap-2 px-1 text-xs leading-5 text-slate-500">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            Accounting explains the balances. Payouts handles eligibility and
            recording external hotel payments.
          </p>
        </>
      )}
    </section>
  );
}
