"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  History,
  Info,
  Loader2,
  Lock,
  Printer,
  Receipt,
  RefreshCw,
  Wallet,
  X,
} from "lucide-react";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { formatPaise } from "@/lib/currency";
import { PartnerShell } from "./partner-shell";
import { useHotelCapabilities } from "./hotel-capabilities";
import { Drawer } from "./drawer";
import {
  describeCashTransaction,
  formatFriendlyTimezone,
  isDefinitiveClosingError,
  parseRupeesToPaise,
  tryParseRupeesToPaise,
  type ShiftDetailResponse,
  type ShiftListResponse,
} from "@/lib/partner/closing/client-types";

const money = (paise: number | undefined | null) =>
  formatPaise(paise ?? 0, { withFractions: true });

export function PartnerCashierShiftsPage() {
  return (
    <PartnerShell>
      {({ selectedProperty, user }) =>
        selectedProperty && user ? (
          <CashierShiftsView
            key={`${user.uid}:${selectedProperty.id}`}
            hotel={selectedProperty.id}
            hotelName={selectedProperty.name}
            userId={user.uid}
          />
        ) : (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-8 text-center shadow-xs">
            <Wallet className="mx-auto h-8 w-8 text-slate-400" />
            <h2 className="mt-2 text-base font-bold text-[#061224]">No hotel selected</h2>
            <p className="mt-1 text-xs text-slate-500">Select a hotel from the top dropdown to manage cashier shifts.</p>
          </div>
        )
      }
    </PartnerShell>
  );
}

function CashierShiftsView({
  hotel,
  hotelName,
  userId,
}: {
  hotel: string;
  hotelName: string;
  userId: string;
}) {
  const permits = useHotelCapabilities();
  const client = useQueryClient();
  const url = "/api/partner/cashier-shifts";

  // Navigation & inspection state
  const [historyCursor, setHistoryCursor] = useState("");
  const [historyPages, setHistoryPages] = useState<string[]>([]);
  const [inspectShiftId, setInspectShiftId] = useState<string | null>(null);
  const [sourceCursor, setSourceCursor] = useState("");
  const [historyFilter, setHistoryFilter] = useState<"all" | "open" | "differences">("all");

  // Form input state
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reviewVersion, setReviewVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Offline / interrupted crash-recovery state
  const [pending, setPending] = useState<{
    key: string;
    body: string;
    uncertain?: boolean;
  } | null>(null);
  const [storageReady, setStorageReady] = useState(false);

  const storageKey = `helpkey-closing:${userId}:${hotel}:shift`;

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (typeof parsed.key === "string" && typeof parsed.body === "string") {
            setPending({ ...parsed, uncertain: true });
          }
        }
      } catch {
        // LocalStorage access issues handled gracefully
      } finally {
        setStorageReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, [storageKey]);

  // Query: Shifts history list (polls every 30s)
  const historyQuery = useQuery<ShiftListResponse>({
    queryKey: ["partner", hotel, "cashier-shifts", historyCursor],
    queryFn: () =>
      apiFetch(
        `${url}?${new URLSearchParams({
          propertyId: hotel,
          ...(historyCursor ? { before: historyCursor } : {}),
        })}`,
      ),
    refetchInterval: 30000,
    retry: false,
  });

  const activeShiftId = historyQuery.data?.activeId || "";

  // Query: Active shift detail (auto-loaded when an active shift exists)
  const activeShiftQuery = useQuery<ShiftDetailResponse>({
    queryKey: ["partner", hotel, "cashier-shift-active", activeShiftId],
    enabled: Boolean(activeShiftId),
    queryFn: () =>
      apiFetch(
        `${url}?${new URLSearchParams({
          propertyId: hotel,
          id: activeShiftId,
          sources: "true",
        })}`,
      ),
    refetchInterval: 15000,
    retry: false,
  });

  // Query: Inspected shift detail in Slide-Over Drawer
  const inspectShiftQuery = useQuery<ShiftDetailResponse>({
    queryKey: ["partner", hotel, "cashier-shift-inspect", inspectShiftId, sourceCursor],
    enabled: Boolean(inspectShiftId),
    queryFn: () =>
      apiFetch(
        `${url}?${new URLSearchParams({
          propertyId: hotel,
          id: inspectShiftId!,
          sources: "true",
          ...(sourceCursor ? { before: sourceCursor } : {}),
        })}`,
      ),
    // Immutable closed shifts are NEVER polled!
    refetchInterval: (query) =>
      query.state.data?.shift.status === "open" ? 15000 : false,
    retry: false,
  });

  const refreshAll = async () => {
    await client.invalidateQueries({ queryKey: ["partner", hotel] });
  };

  // Submit action (open or close)
  async function handleSubmit() {
    setErrorMessage("");
    setSuccessMessage("");
    setBusy(true);

    let request = pending;
    try {
      if (!request) {
        const parsedAmount = parseRupeesToPaise(amount);
        const body = activeShiftId
          ? {
              propertyId: hotel,
              action: "close",
              shiftId: activeShiftId,
              revision: reviewVersion ?? activeShiftQuery.data?.shift.revision ?? 0,
              countedPaise: parsedAmount,
              reason: reason.trim(),
            }
          : {
              propertyId: hotel,
              action: "open",
              openingPaise: parsedAmount,
            };
        request = { key: crypto.randomUUID(), body: JSON.stringify(body) };
      }

      // Try persisting to storage before sending
      try {
        localStorage.setItem(storageKey, JSON.stringify({ ...request, uncertain: true }));
      } catch {
        // Storage quota/privacy error - proceed with network request
      }
      setPending(request);

      await apiFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": request.key,
        },
        body: request.body,
      });

      try {
        localStorage.removeItem(storageKey);
      } catch {}
      setPending(null);
      setAmount("");
      setReason("");
      setReviewVersion(null);
      setSuccessMessage(
        activeShiftId
          ? "Shift closed and permanent summary saved."
          : "Shift recorded.",
      );
      await refreshAll();
    } catch (err) {
      const isDefinitive =
        err instanceof ApiClientError && isDefinitiveClosingError(err.code);

      if (!pending?.uncertain && isDefinitive) {
        try {
          localStorage.removeItem(storageKey);
        } catch {}
        setPending(null);
        setReviewVersion(null);
        void refreshAll();
      } else if (request) {
        setPending({ ...request, uncertain: true });
      }

      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Submission outcome is uncertain. Retry the saved request.",
      );
    } finally {
      setBusy(false);
    }
  }

  // Live variance calculations when closing active shift
  const liveVariance = useMemo(() => {
    if (!activeShiftId || !activeShiftQuery.data) return null;
    const parsed = tryParseRupeesToPaise(amount);
    if (!parsed.ok) return null;
    const expected = activeShiftQuery.data.review.expectedPaise;
    const diff = parsed.paise - expected;
    return {
      countedPaise: parsed.paise,
      expectedPaise: expected,
      differencePaise: diff,
      isBalanced: diff === 0,
      isShortage: diff < 0,
      isSurplus: diff > 0,
    };
  }, [activeShiftId, activeShiftQuery.data, amount]);

  const timezone =
    historyQuery.data?.timezone ||
    activeShiftQuery.data?.shift.timezone ||
    "Asia/Kolkata";

  const formatDateTime = (v?: string | null) => {
    if (!v || !Number.isFinite(Date.parse(v))) return "—";
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(v));
  };

  const formatDateOnly = (v?: string | null) => {
    if (!v) return "—";
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeZone: timezone,
    }).format(new Date(`${v}T12:00:00Z`));
  };

  // Filtered shift history
  const filteredShifts = useMemo(() => {
    const list = historyQuery.data?.shifts || [];
    if (historyFilter === "open") return list.filter((s) => s.status === "open");
    if (historyFilter === "differences")
      return list.filter((s) => (s.snapshot?.differencePaise ?? 0) !== 0);
    return list;
  }, [historyQuery.data?.shifts, historyFilter]);

  return (
    <section className="space-y-5 pb-12">
      {/* 1. Header with Title, Timezone Pill, and Refresh */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#061224]">
              My shift and shift history
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700 shadow-2xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
              {formatFriendlyTimezone(timezone)}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{hotelName}</span>
            <span className="text-slate-300">•</span>
            <span>Physical cash desk &amp; drawer accountability</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={historyQuery.isFetching || activeShiftQuery.isFetching}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#061224] shadow-xs transition-all hover:border-[#c89b3c] hover:bg-[#fbf5e8]/50 active:scale-95 disabled:opacity-50"
            title="Refresh shift data"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-slate-600 ${
                historyQuery.isFetching || activeShiftQuery.isFetching ? "animate-spin text-[#c89b3c]" : ""
              }`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* 2. Feedback Banners: Errors, Success, and Interrupted Submissions */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-xs font-medium text-rose-900 shadow-2xs"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Unable to process shift</p>
            <p className="mt-0.5">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage("")}
            className="text-rose-500 hover:text-rose-800"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs font-medium text-emerald-900 shadow-2xs"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">{successMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage("")}
            className="text-emerald-500 hover:text-emerald-800"
            aria-label="Dismiss message"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {pending && (
        <div
          role="status"
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 shadow-2xs text-xs"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
            <div>
              <p className="font-bold text-amber-900">Previous shift request needs confirmation</p>
              <p className="text-amber-800 mt-0.5">
                Your last request was interrupted before server confirmation. Retry safely without creating a duplicate.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSubmit()}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-amber-800 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-amber-900 active:scale-95 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              <span>Retry saved request</span>
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem(storageKey);
                } catch {}
                setPending(null);
              }}
              className="inline-flex min-h-9 items-center justify-center rounded-xl border border-amber-300 bg-white/70 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* 3. HERO SECTION: Focused Drawer Action */}
      {!activeShiftId ? (
        /* State A: NO OPEN SHIFT -> Clean "Start Your Shift" Card */
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-50 text-[#c89b3c] border border-[#f5ebda]">
                <Wallet className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-bold text-[#061224]">Start your cashier shift</h2>
                <p className="text-xs text-slate-500">
                  Open your cash drawer to record cash payments and issue receipts for hotel guests.
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              Drawer closed
            </span>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            className="mt-6 max-w-xl space-y-4"
          >
            <div>
              <label
                htmlFor="opening-cash-input"
                className="block text-xs font-bold uppercase tracking-wider text-slate-600"
              >
                Opening cash physically counted (₹)
              </label>
              <div className="relative mt-2">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-sm font-bold text-slate-400">
                  ₹
                </span>
                <input
                  id="opening-cash-input"
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="0.00"
                  value={amount}
                  disabled={busy}
                  onChange={(e) => setAmount(e.target.value)}
                  className="block h-12 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-4 text-base font-bold text-[#061224] shadow-2xs outline-none transition focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/20"
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Opening cash is the physical money in your drawer before service begins. It does not count as guest revenue.
              </p>
            </div>

            <button
              type="submit"
              disabled={busy || !storageReady}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#061224] px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#061224]/90 active:scale-95 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4 text-[#c89b3c]" />}
              <span>{busy ? "Opening shift…" : "Open my shift"}</span>
            </button>
          </form>
        </div>
      ) : (
        /* State B: SHIFT ACTIVE -> Active Shift Workspace */
        activeShiftQuery.data && (
          <div className="space-y-4">
            {/* Live Shift Header & KPI Strip */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-600" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-[#061224]">Active cashier shift</h2>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200/60 uppercase">
                        Live drawer
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Opened by <strong className="text-slate-700">{activeShiftQuery.data.shift.openerName}</strong> at{" "}
                      {formatDateTime(activeShiftQuery.data.shift.openedAt)}
                    </p>
                  </div>
                </div>

                <div className="text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">
                    {activeShiftQuery.data.review.sourceCount}
                  </span>{" "}
                  cash transaction{activeShiftQuery.data.review.sourceCount === 1 ? "" : "s"}
                </div>
              </div>

              {/* 4 KPI Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-4">
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Opening float
                  </span>
                  <p className="mt-1 text-lg font-bold text-[#061224] tabular-nums">
                    {money(activeShiftQuery.data.shift.openingPaise)}
                  </p>
                </div>

                <div className="rounded-xl border border-emerald-100/80 bg-emerald-50/40 p-3.5">
                  <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">
                    Cash collected
                  </span>
                  <p className="mt-1 text-lg font-bold text-emerald-900 tabular-nums">
                    {money(activeShiftQuery.data.review.collectedPaise)}
                  </p>
                </div>

                <div className="rounded-xl border border-rose-100/80 bg-rose-50/40 p-3.5">
                  <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider block">
                    Cash refunded
                  </span>
                  <p className="mt-1 text-lg font-bold text-rose-900 tabular-nums">
                    {money(activeShiftQuery.data.review.returnedPaise)}
                  </p>
                </div>

                <div className="rounded-xl border border-[#f5ebda] bg-[#fbf5e8]/70 p-3.5">
                  <span className="text-[11px] font-semibold text-[#c89b3c] uppercase tracking-wider block">
                    Expected in drawer
                  </span>
                  <p className="mt-1 text-lg font-black text-[#061224] tabular-nums">
                    {money(activeShiftQuery.data.review.expectedPaise)}
                  </p>
                </div>
              </div>

              {activeShiftQuery.data.review.correctionsPaise > 0 && (
                <p className="mt-3 text-xs text-slate-500">
                  <Info className="inline h-3.5 w-3.5 mr-1 text-slate-400" />
                  Past-shift corrections ({money(activeShiftQuery.data.review.correctionsPaise)}) have zero physical cash impact on this drawer.
                </p>
              )}
            </div>

            {/* Split View: Left = Transactions / Right = Close Shift Form */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left Column: Recent Cash Transactions */}
              <div className="lg:col-span-7 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-[#c89b3c]" />
                    <h3 className="text-sm font-bold text-[#061224]">Current cash transactions</h3>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    {activeShiftQuery.data.sources.length} record{activeShiftQuery.data.sources.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="mt-3 flex-1 overflow-y-auto max-h-[360px] divide-y divide-slate-100">
                  {activeShiftQuery.data.sources.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      No cash transactions recorded during this shift yet.
                    </div>
                  ) : (
                    activeShiftQuery.data.sources.map((receipt) => {
                      const descriptor = describeCashTransaction(receipt);
                      return (
                        <div key={receipt.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                  descriptor.tone === "emerald"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                                    : descriptor.tone === "rose"
                                      ? "bg-rose-50 text-rose-700 border border-rose-200/60"
                                      : descriptor.tone === "amber"
                                        ? "bg-amber-50 text-amber-700 border border-amber-200/60"
                                        : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {descriptor.label}
                              </span>
                              {receipt.bookingReference && (
                                <span className="font-semibold text-slate-700">
                                  Ref #{receipt.bookingReference}
                                </span>
                              )}
                              {receipt.guestName && (
                                <span className="text-slate-500 truncate max-w-[140px]">
                                  ({receipt.guestName})
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-400">
                              {formatDateTime(receipt.createdAt)}
                              {receipt.reason && ` · ${receipt.reason}`}
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            <span
                              className={`font-bold tabular-nums block ${
                                descriptor.tone === "emerald"
                                  ? "text-emerald-700"
                                  : descriptor.tone === "rose" || descriptor.tone === "amber"
                                    ? "text-rose-700"
                                    : "text-slate-600"
                              }`}
                            >
                              {descriptor.signedCashEffect}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column: Close Shift Drawer Action */}
              <div className="lg:col-span-5 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                  <Lock className="h-4 w-4 text-[#c89b3c]" />
                  <h3 className="text-sm font-bold text-[#061224]">Close shift &amp; reconcile drawer</h3>
                </div>

                {activeShiftQuery.data.shift.actorId !== userId ? (
                  /* Opener-only notice if viewing another staff member's drawer */
                  <div className="mt-4 rounded-xl bg-amber-50/70 p-4 text-xs text-amber-900 border border-amber-200/70">
                    <p className="font-bold">Opener authorization required</p>
                    <p className="mt-1 text-slate-600">
                      Only <strong>{activeShiftQuery.data.shift.openerName}</strong> can close this shift. Drawer accountability remains with the staff member who opened it.
                    </p>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleSubmit();
                    }}
                    className="mt-4 space-y-4"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="counted-cash-input"
                          className="text-xs font-bold uppercase tracking-wider text-slate-600"
                        >
                          Counted cash (₹)
                        </label>
                        <span className="text-[11px] text-slate-500">
                          Expected: {money(activeShiftQuery.data.review.expectedPaise)}
                        </span>
                      </div>
                      <div className="relative mt-1.5">
                        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-sm font-bold text-slate-400">
                          ₹
                        </span>
                        <input
                          id="counted-cash-input"
                          type="text"
                          inputMode="decimal"
                          required
                          placeholder="0.00"
                          value={amount}
                          disabled={busy}
                          onChange={(e) => {
                            setAmount(e.target.value);
                            if (reviewVersion === null) {
                              setReviewVersion(activeShiftQuery.data?.shift.revision ?? 0);
                            }
                          }}
                          className="block h-11 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-4 text-base font-bold text-[#061224] shadow-2xs outline-none transition focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/20"
                        />
                      </div>
                    </div>

                    {/* Live Variance Callout */}
                    {liveVariance && (
                      <div
                        className={`rounded-xl p-3 text-xs flex items-center justify-between border ${
                          liveVariance.isBalanced
                            ? "bg-emerald-50/80 border-emerald-200 text-emerald-900"
                            : liveVariance.isSurplus
                              ? "bg-blue-50/80 border-blue-200 text-blue-900"
                              : "bg-rose-50/80 border-rose-200 text-rose-900"
                        }`}
                      >
                        <span className="font-semibold">
                          {liveVariance.isBalanced
                            ? "Drawer is perfectly balanced"
                            : liveVariance.isSurplus
                              ? "Drawer surplus counted"
                              : "Drawer shortage counted"}
                        </span>
                        <span className="font-extrabold tabular-nums">
                          {liveVariance.isBalanced
                            ? "₹0.00 difference"
                            : `${liveVariance.isSurplus ? "+" : ""}${money(liveVariance.differencePaise)}`}
                        </span>
                      </div>
                    )}

                    {/* Discrepancy Reason Field */}
                    <div>
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="discrepancy-reason-input"
                          className="text-xs font-bold text-slate-700"
                        >
                          Discrepancy explanation (required for a difference)
                        </label>
                        {liveVariance && !liveVariance.isBalanced && (
                          <span className="text-[10px] font-bold uppercase rounded bg-rose-100 text-rose-700 px-1.5 py-0.5">
                            Required
                          </span>
                        )}
                      </div>
                      <textarea
                        id="discrepancy-reason-input"
                        rows={2}
                        maxLength={1000}
                        placeholder={
                          liveVariance && !liveVariance.isBalanced
                            ? "Explain why the physical drawer count differs from expected..."
                            : "Optional notes about this shift closing..."
                        }
                        value={reason}
                        disabled={busy}
                        onChange={(e) => {
                          setReason(e.target.value);
                          if (reviewVersion === null) {
                            setReviewVersion(activeShiftQuery.data?.shift.revision ?? 0);
                          }
                        }}
                        className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-[#061224] shadow-2xs outline-none transition focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/20"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#061224] px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#061224]/90 active:scale-95 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      <span>{busy ? "Reconciling shift…" : "Confirm shift closing"}</span>
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        )
      )}

      {/* 4. SHIFT HISTORY SECTION */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-[#c89b3c]" />
              <h2 className="text-base font-bold text-[#061224]">
                {permits("shift.history") ? "Hotel shift history and differences" : "My shift history"}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {permits("shift.history")
                ? "All cashier shifts across hotel staff"
                : "Your personal shift closing history"}
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl self-start sm:self-auto">
            {(
              [
                ["all", "All shifts"],
                ["open", "Open"],
                ["differences", "Differences"],
              ] as const
            ).map(([fKey, fLabel]) => (
              <button
                key={fKey}
                type="button"
                onClick={() => setHistoryFilter(fKey)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  historyFilter === fKey
                    ? "bg-white text-[#061224] shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {fLabel}
              </button>
            ))}
          </div>
        </div>

        {/* History Table (Desktop) / Cards (Mobile) */}
        <div className="mt-4">
          {historyQuery.isLoading ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading shift history…</div>
          ) : filteredShifts.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              {historyFilter === "all"
                ? "No shifts recorded yet."
                : `No ${historyFilter} shifts found.`}
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="pb-2.5">Date &amp; Time</th>
                      <th className="pb-2.5">Cashier</th>
                      <th className="pb-2.5">Status</th>
                      <th className="pb-2.5 text-right">Opening</th>
                      <th className="pb-2.5 text-right">Expected</th>
                      <th className="pb-2.5 text-right">Counted</th>
                      <th className="pb-2.5 text-right">Variance</th>
                      <th className="pb-2.5 text-right pr-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredShifts.map((shift) => {
                      const diff = shift.snapshot?.differencePaise ?? 0;
                      return (
                        <tr
                          key={shift.id}
                          onClick={() => {
                            setInspectShiftId(shift.id);
                            setSourceCursor("");
                          }}
                          className="cursor-pointer hover:bg-slate-50/80 transition group"
                        >
                          <td className="py-3 font-semibold text-[#061224]">
                            <div>{formatDateOnly(shift.openedDate)}</div>
                            <span className="text-[11px] font-normal text-slate-400">
                              {formatDateTime(shift.openedAt)}
                            </span>
                          </td>
                          <td className="py-3 font-medium text-slate-700">
                            {shift.openerName}
                          </td>
                          <td className="py-3">
                            <span
                              className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                                shift.status === "open"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {shift.status === "open" ? "Open" : "Closed"}
                            </span>
                          </td>
                          <td className="py-3 text-right tabular-nums text-slate-600">
                            {money(shift.openingPaise)}
                          </td>
                          <td className="py-3 text-right tabular-nums text-slate-600">
                            {shift.snapshot ? money(shift.snapshot.expectedPaise) : "—"}
                          </td>
                          <td className="py-3 text-right tabular-nums text-slate-600">
                            {shift.snapshot ? money(shift.snapshot.countedPaise) : "—"}
                          </td>
                          <td className="py-3 text-right tabular-nums font-bold">
                            {shift.status === "open" ? (
                              <span className="text-slate-400">—</span>
                            ) : diff === 0 ? (
                              <span className="text-emerald-700 font-semibold">₹0.00</span>
                            ) : diff > 0 ? (
                              <span className="text-blue-700">+{money(diff)}</span>
                            ) : (
                              <span className="text-rose-700">{money(diff)}</span>
                            )}
                          </td>
                          <td className="py-3 text-right pr-2">
                            <span className="inline-flex items-center text-xs font-semibold text-[#c89b3c] group-hover:translate-x-0.5 transition-transform">
                              View <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List View */}
              <div className="md:hidden space-y-2.5">
                {filteredShifts.map((shift) => {
                  const diff = shift.snapshot?.differencePaise ?? 0;
                  return (
                    <button
                      key={shift.id}
                      type="button"
                      onClick={() => {
                        setInspectShiftId(shift.id);
                        setSourceCursor("");
                      }}
                      className="w-full text-left rounded-xl border border-slate-200/80 p-3.5 hover:border-[#c89b3c] transition active:scale-[0.99] bg-white"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs text-[#061224]">
                          {formatDateOnly(shift.openedDate)}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            shift.status === "open"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {shift.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Cashier: {shift.openerName} · {formatDateTime(shift.openedAt)}
                      </p>
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="text-slate-500">
                          Expected: {shift.snapshot ? money(shift.snapshot.expectedPaise) : "—"}
                        </span>
                        <span
                          className={`font-bold tabular-nums ${
                            diff === 0
                              ? "text-emerald-700"
                              : diff > 0
                                ? "text-blue-700"
                                : "text-rose-700"
                          }`}
                        >
                          {shift.status === "open"
                            ? "Active"
                            : diff === 0
                              ? "Balanced (₹0.00)"
                              : `Diff: ${money(diff)}`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* History Pagination */}
          {(historyQuery.data?.nextCursor || historyPages.length > 0) && (
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <button
                type="button"
                disabled={historyPages.length === 0}
                onClick={() => {
                  const prev = historyPages.slice(0, -1);
                  setHistoryPages(prev);
                  setHistoryCursor(prev.at(-1) || "");
                }}
                className="inline-flex min-h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Previous page
              </button>
              <button
                type="button"
                disabled={!historyQuery.data?.nextCursor}
                onClick={() => {
                  if (historyQuery.data?.nextCursor) {
                    setHistoryPages([...historyPages, historyCursor]);
                    setHistoryCursor(historyQuery.data.nextCursor);
                  }
                }}
                className="inline-flex min-h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Next page
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 5. SLIDE-OVER DRAWER: Inspected Shift Detail */}
      <Drawer
        open={Boolean(inspectShiftId)}
        onClose={() => setInspectShiftId(null)}
        title={
          inspectShiftQuery.data
            ? `${formatDateOnly(inspectShiftQuery.data.shift.openedDate)} · ${inspectShiftQuery.data.shift.openerName}`
            : "Shift details"
        }
        description={
          inspectShiftQuery.data
            ? `Shift #${inspectShiftQuery.data.shift.id.slice(0, 8)}`
            : undefined
        }
        badge={
          inspectShiftQuery.data ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                inspectShiftQuery.data.shift.status === "open"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-100 text-slate-700 border border-slate-200"
              }`}
            >
              {inspectShiftQuery.data.shift.status === "open" ? "Open drawer" : "Closed"}
            </span>
          ) : undefined
        }
        headerExtra={
          inspectShiftQuery.data?.shift.status === "closed" ? (
            <button
              type="button"
              onClick={() =>
                window.open(
                  `${url}/print?${new URLSearchParams({
                    propertyId: hotel,
                    id: inspectShiftId!,
                  })}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#061224] shadow-xs hover:bg-slate-50"
              title="Print permanent summary"
            >
              <Printer className="h-3.5 w-3.5 text-slate-600" />
              <span className="hidden sm:inline">Print summary</span>
            </button>
          ) : undefined
        }
        spacious
      >
        {inspectShiftQuery.isLoading ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading shift details…</div>
        ) : inspectShiftQuery.data ? (
          <div className="space-y-5 text-xs text-[#061224]">
            {/* Opening & Closing Timestamps */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Opened
                  </span>
                  <p className="mt-0.5 font-semibold text-slate-800">
                    {formatDateTime(inspectShiftQuery.data.shift.openedAt)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    By {inspectShiftQuery.data.shift.openerName}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Closed
                  </span>
                  <p className="mt-0.5 font-semibold text-slate-800">
                    {inspectShiftQuery.data.shift.closedAt
                      ? formatDateTime(inspectShiftQuery.data.shift.closedAt)
                      : "Still open"}
                  </p>
                  {inspectShiftQuery.data.shift.closerName && (
                    <p className="text-[11px] text-slate-500">
                      By {inspectShiftQuery.data.shift.closerName}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Reconciliation Breakdown */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-4">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider pb-3 border-b border-slate-100">
                Cash balance breakdown
              </h4>
              <dl className="mt-3 divide-y divide-slate-100">
                <div className="py-2 flex items-center justify-between">
                  <dt className="text-slate-500">Opening cash float</dt>
                  <dd className="font-bold tabular-nums text-slate-800">
                    {money(inspectShiftQuery.data.shift.openingPaise)}
                  </dd>
                </div>
                <div className="py-2 flex items-center justify-between">
                  <dt className="text-slate-500">Cash collections</dt>
                  <dd className="font-bold tabular-nums text-emerald-700">
                    +{money(inspectShiftQuery.data.review.collectedPaise)}
                  </dd>
                </div>
                <div className="py-2 flex items-center justify-between">
                  <dt className="text-slate-500">Cash refunds returned</dt>
                  <dd className="font-bold tabular-nums text-rose-700">
                    -{money(inspectShiftQuery.data.review.returnedPaise)}
                  </dd>
                </div>
                {inspectShiftQuery.data.review.correctionsPaise > 0 && (
                  <div className="py-2 flex items-center justify-between">
                    <dt className="text-slate-500">Past-shift corrections (no cash effect)</dt>
                    <dd className="font-bold tabular-nums text-slate-500">
                      {money(inspectShiftQuery.data.review.correctionsPaise)}
                    </dd>
                  </div>
                )}
                <div className="py-2.5 flex items-center justify-between border-t-2 border-slate-100 text-sm">
                  <dt className="font-extrabold text-[#061224]">Expected in drawer</dt>
                  <dd className="font-black tabular-nums text-[#061224]">
                    {money(inspectShiftQuery.data.review.expectedPaise)}
                  </dd>
                </div>
                {inspectShiftQuery.data.shift.status === "closed" && (
                  <>
                    <div className="py-2 flex items-center justify-between">
                      <dt className="font-semibold text-slate-700">Physical counted cash</dt>
                      <dd className="font-bold tabular-nums text-slate-900">
                        {money(inspectShiftQuery.data.review.countedPaise)}
                      </dd>
                    </div>
                    <div className="py-2 flex items-center justify-between">
                      <dt className="font-semibold text-slate-700">Variance (Surplus / Shortage)</dt>
                      <dd
                        className={`font-black tabular-nums ${
                          (inspectShiftQuery.data.review.differencePaise ?? 0) === 0
                            ? "text-emerald-700"
                            : (inspectShiftQuery.data.review.differencePaise ?? 0) > 0
                              ? "text-blue-700"
                              : "text-rose-700"
                        }`}
                      >
                        {(inspectShiftQuery.data.review.differencePaise ?? 0) === 0
                          ? "Balanced (₹0.00)"
                          : `${(inspectShiftQuery.data.review.differencePaise ?? 0) > 0 ? "+" : ""}${money(
                              inspectShiftQuery.data.review.differencePaise,
                            )}`}
                      </dd>
                    </div>
                  </>
                )}
              </dl>

              {inspectShiftQuery.data.shift.status === "closed" && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Discrepancy explanation
                  </span>
                  <p className="mt-1 text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200/60">
                    {inspectShiftQuery.data.review.reason || "No discrepancy recorded"}
                  </p>
                </div>
              )}
            </div>

            {/* Enriched Cash Transactions List */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-[#c89b3c]" />
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Cash transactions ({inspectShiftQuery.data.review.sourceCount})
                  </h4>
                </div>
              </div>

              <div className="mt-2 divide-y divide-slate-100">
                {inspectShiftQuery.data.sources.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-400">
                    No transactions recorded during this shift.
                  </p>
                ) : (
                  inspectShiftQuery.data.sources.map((receipt) => {
                    const descriptor = describeCashTransaction(receipt);
                    return (
                      <div key={receipt.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                descriptor.tone === "emerald"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                                  : descriptor.tone === "rose"
                                    ? "bg-rose-50 text-rose-700 border border-rose-200/60"
                                    : descriptor.tone === "amber"
                                      ? "bg-amber-50 text-amber-700 border border-amber-200/60"
                                      : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {descriptor.label}
                            </span>
                            {receipt.bookingReference && (
                              <span className="font-semibold text-slate-700">
                                Ref #{receipt.bookingReference}
                              </span>
                            )}
                            {receipt.guestName && (
                              <span className="text-slate-500 truncate max-w-[140px]">
                                ({receipt.guestName})
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {formatDateTime(receipt.createdAt)}
                            {receipt.reason && ` · ${receipt.reason}`}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`font-bold tabular-nums block ${
                              descriptor.tone === "emerald"
                                ? "text-emerald-700"
                                : descriptor.tone === "rose" || descriptor.tone === "amber"
                                  ? "text-rose-700"
                                  : "text-slate-600"
                            }`}
                          >
                            {descriptor.signedCashEffect}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Transactions Pagination inside drawer */}
              {(inspectShiftQuery.data.nextCursor || sourceCursor) && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    disabled={!sourceCursor}
                    onClick={() => setSourceCursor("")}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    First page
                  </button>
                  <button
                    type="button"
                    disabled={!inspectShiftQuery.data.nextCursor}
                    onClick={() => setSourceCursor(inspectShiftQuery.data!.nextCursor || "")}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Next page
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Drawer>
    </section>
  );
}
