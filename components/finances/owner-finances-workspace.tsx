"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  FilterX,
  History,
  Info,
  Landmark,
  Loader2,
  Paperclip,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import type {
  OwnerActivityRowDto,
  OwnerBookingRowDto,
  OwnerFinancesOverviewDto,
} from "@/lib/finances/service";
import type { OwnerDuesReportDto } from "@/lib/dues/report-domain";
import {
  formatCurrency,
  formatHotelDate,
  formatHotelDateTime,
  formatMethod,
  reportStatusPresentation,
  stagePresentation,
} from "./format";
import {
  ActivityDetailDrawer,
  BookingSettlementDetailDrawer,
  ReportDetailDrawer,
} from "./detail-drawers";
import {
  ReportPaymentDrawer,
  type ReportDraftSeed,
} from "./report-payment-drawer";

type Tab = "bookings" | "payments" | "reports";

type PaginatedBookings = {
  timezone: string;
  items: OwnerBookingRowDto[];
  nextCursor: string | null;
};

type PaginatedActivity = {
  timezone: string;
  items: OwnerActivityRowDto[];
  nextCursor: string | null;
};

type PaginatedReports = {
  items: OwnerDuesReportDto[];
  nextCursor: string | null;
};

function StageIcon({
  kind,
}: {
  kind: ReturnType<typeof stagePresentation>["icon"];
}) {
  switch (kind) {
    case "ready":
      return <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />;
    case "prepared":
      return <Clock3 className="h-3.5 w-3.5 shrink-0" />;
    case "paid":
      return <History className="h-3.5 w-3.5 shrink-0" />;
    case "dues":
      return <ArrowDownLeft className="h-3.5 w-3.5 shrink-0" />;
    case "waiting":
      return <Clock3 className="h-3.5 w-3.5 shrink-0" />;
    case "review":
      return <AlertTriangle className="h-3.5 w-3.5 shrink-0" />;
    case "historical":
      return <FileText className="h-3.5 w-3.5 shrink-0" />;
  }
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading hotel finances">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-3 w-28 rounded bg-slate-200" />
          <div className="h-8 w-52 rounded bg-slate-200" />
        </div>
        <div className="h-11 w-32 rounded-xl bg-slate-200" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-44 rounded-2xl border border-slate-200/80 bg-white p-5"
          >
            <div className="h-4 w-32 rounded bg-slate-200" />
            <div className="mt-4 h-8 w-36 rounded bg-slate-200" />
            <div className="mt-4 h-4 w-48 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <div className="h-24 rounded-2xl border border-slate-200/80 bg-white p-5" />
    </div>
  );
}

export function OwnerFinancesWorkspace({
  propertyId,
}: {
  propertyId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const tab: Tab = (() => {
    const raw = searchParams.get("tab");
    if (raw === "payments" || raw === "reports") return raw;
    return "bookings";
  })();

  const statusFilter = searchParams.get("status") || "all";
  const awaitingCategoryFilter =
    searchParams.get("awaitingCategory") || "all";
  const directionFilter = searchParams.get("direction") || "all";
  const typeFilter = searchParams.get("type") || "all";
  const reportStatusFilter = searchParams.get("reportStatus") || "all";
  const qParam = searchParams.get("q") || "";
  const fromParam = searchParams.get("from") || "";
  const toParam = searchParams.get("to") || "";

  const selectedBookingId = searchParams.get("bookingId");
  const selectedActivityId = searchParams.get("activityId");
  const selectedReportId = searchParams.get("reportId");
  const actionParam = searchParams.get("action");

  const [searchDraft, setSearchDraft] = useState<string | null>(null);
  const [fromDraft, setFromDraft] = useState<string | null>(null);
  const [toDraft, setToDraft] = useState<string | null>(null);
  const [reportSheetOpen, setReportSheetOpen] = useState(false);
  const [reportSeed, setReportSeed] = useState<ReportDraftSeed | null>(null);
  const [bannerNotice, setBannerNotice] = useState("");

  const searchInput = searchDraft ?? qParam;
  const fromInput = fromDraft ?? fromParam;
  const toInput = toDraft ?? toParam;
  const effectiveReportSheetOpen = reportSheetOpen || actionParam === "report";

  const updateUrl = useCallback(
    (
      patch: Record<string, string | null | undefined>,
      mode: "push" | "replace" = "push",
    ) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("propertyId", propertyId);
      for (const [k, v] of Object.entries(patch)) {
        if (!v || v === "all") next.delete(k);
        else next.set(k, v);
      }
      const target = `${pathname}?${next.toString()}`;
      if (mode === "push") router.push(target, { scroll: false });
      else router.replace(target, { scroll: false });
    },
    [pathname, propertyId, router, searchParams],
  );

  // Clear stale detail selections when switching properties.
  useEffect(() => {
    const urlProp = searchParams.get("propertyId");
    if (urlProp && urlProp !== propertyId) {
      updateUrl({
        bookingId: null,
        activityId: null,
        reportId: null,
        action: null,
      }, "replace");
    }
  }, [propertyId, searchParams, updateUrl]);

  const overviewQuery = useQuery({
    queryKey: ["owner-finances-overview", propertyId],
    queryFn: () =>
      apiFetch<OwnerFinancesOverviewDto>(
        `/api/partner/properties/${encodeURIComponent(propertyId)}/finances`,
        { cache: "no-store" },
      ),
    retry: false,
    refetchInterval: 30_000,
  });

  const validDatePair =
    (!fromParam && !toParam) ||
    (!!fromParam && !!toParam && fromParam <= toParam);

  const bookingsQuery = useInfiniteQuery({
    queryKey: [
      "owner-finances-bookings",
      propertyId,
      statusFilter,
      awaitingCategoryFilter,
      directionFilter,
      qParam,
      fromParam,
      toParam,
    ],
    enabled: validDatePair && (tab === "bookings" || !!selectedBookingId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        status: statusFilter,
        awaitingCategory: awaitingCategoryFilter,
        direction: directionFilter,
        limit: "20",
      });
      if (qParam) params.set("q", qParam);
      if (fromParam && toParam) {
        params.set("from", fromParam);
        params.set("to", toParam);
      }
      if (pageParam) params.set("cursor", pageParam);
      return apiFetch<PaginatedBookings>(
        `/api/partner/properties/${encodeURIComponent(propertyId)}/finances/bookings?${params.toString()}`,
        { cache: "no-store" },
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    retry: false,
    refetchInterval: 30_000,
  });

  const activityQuery = useInfiniteQuery({
    queryKey: [
      "owner-finances-activity",
      propertyId,
      typeFilter,
      qParam,
      fromParam,
      toParam,
    ],
    enabled: validDatePair && (tab === "payments" || !!selectedActivityId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        type: typeFilter,
        limit: "20",
      });
      if (qParam) params.set("q", qParam);
      if (fromParam && toParam) {
        params.set("from", fromParam);
        params.set("to", toParam);
      }
      if (pageParam) params.set("cursor", pageParam);
      return apiFetch<PaginatedActivity>(
        `/api/partner/properties/${encodeURIComponent(propertyId)}/finances/activity?${params.toString()}`,
        { cache: "no-store" },
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    retry: false,
    refetchInterval: 30_000,
  });

  const reportsQuery = useInfiniteQuery({
    queryKey: [
      "owner-finances-reports",
      propertyId,
      reportStatusFilter,
      qParam,
      fromParam,
      toParam,
    ],
    enabled: validDatePair && (tab === "reports" || !!selectedReportId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        status: reportStatusFilter,
        limit: "20",
      });
      if (qParam) params.set("q", qParam);
      if (fromParam && toParam) {
        params.set("from", fromParam);
        params.set("to", toParam);
      }
      if (pageParam) params.set("cursor", pageParam);
      return apiFetch<PaginatedReports>(
        `/api/partner/properties/${encodeURIComponent(propertyId)}/finances/reports?${params.toString()}`,
        { cache: "no-store" },
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    retry: false,
    refetchInterval: 30_000,
  });

  const bookingItems = useMemo(
    () => bookingsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [bookingsQuery.data],
  );
  const activityItems = useMemo(
    () => activityQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [activityQuery.data],
  );
  const reportItems = useMemo(
    () => reportsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [reportsQuery.data],
  );

  // Deep links must work even when the selected item is outside the loaded page.
  const detailKind = selectedReportId ? "reports" : selectedActivityId ? "activity" : "bookings";
  const detailId = selectedReportId || selectedActivityId || selectedBookingId;
  const detailQuery = useQuery({
    queryKey: ["owner-finances-detail", propertyId, detailKind, detailId],
    enabled: !!detailId,
    retry: false,
    refetchInterval: 30_000,
    queryFn: () => apiFetch<{ items: (OwnerBookingRowDto | OwnerActivityRowDto | OwnerDuesReportDto)[] }>(
      `/api/partner/properties/${encodeURIComponent(propertyId)}/finances/${detailKind}?${new URLSearchParams({ detailId: detailId!, limit: "1" })}`,
      { cache: "no-store" },
    ),
  });
  const selectedBooking = selectedBookingId && detailKind === "bookings"
    ? (detailQuery.data?.items[0] as OwnerBookingRowDto | undefined) ?? bookingItems.find((b) => b.bookingId === selectedBookingId) ?? null
    : null;
  const selectedActivity = selectedActivityId && detailKind === "activity"
    ? (detailQuery.data?.items[0] as OwnerActivityRowDto | undefined) ?? activityItems.find((a) => a.id === selectedActivityId) ?? null
    : null;
  const selectedReport = selectedReportId && detailKind === "reports"
    ? (detailQuery.data?.items[0] as OwnerDuesReportDto | undefined) ?? reportItems.find((r) => r.id === selectedReportId) ?? null
    : null;

  const pendingReports = useMemo(
    () => reportItems.filter((r) => r.status === "awaiting_verification"),
    [reportItems],
  );
  const outcomeReports = useMemo(
    () => reportItems.filter((r) => r.status !== "awaiting_verification"),
    [reportItems],
  );

  const hasActiveFilters =
    !!qParam ||
    !!fromParam ||
    !!toParam ||
    statusFilter !== "all" ||
    awaitingCategoryFilter !== "all" ||
    directionFilter !== "all" ||
    typeFilter !== "all" ||
    reportStatusFilter !== "all";

  function clearAllFilters() {
    setSearchDraft(null);
    setFromDraft(null);
    setToDraft(null);
    updateUrl({
      status: null,
      awaitingCategory: null,
      direction: null,
      type: null,
      reportStatus: null,
      q: null,
      from: null,
      to: null,
    });
  }

  function applySearchAndDates(e?: React.FormEvent) {
    e?.preventDefault();
    const hasPartialDate =
      (!!fromInput && !toInput) || (!fromInput && !!toInput);
    if (hasPartialDate) return;
    if (fromInput && toInput && fromInput > toInput) return;
    setSearchDraft(null);
    setFromDraft(null);
    setToDraft(null);
    updateUrl({
      q: searchInput.trim() || null,
      from: fromInput || null,
      to: toInput || null,
    });
  }

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["owner-finances-detail", propertyId] }),
      queryClient.invalidateQueries({
        queryKey: ["owner-finances-overview", propertyId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["owner-finances-bookings", propertyId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["owner-finances-activity", propertyId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["owner-finances-reports", propertyId],
      }),
    ]);
  }

  const overview = overviewQuery.data;
  const timezone = overview?.hotel.timezone ?? "Asia/Kolkata";

  if (overviewQuery.isPending) {
    return (
      <section className="mx-auto max-w-7xl px-1 py-2 sm:px-2">
        <OverviewSkeleton />
      </section>
    );
  }

  if (overviewQuery.error || !overview) {
    return (
      <section
        role="alert"
        className="mx-auto max-w-3xl rounded-2xl border border-rose-200 bg-white p-6 shadow-xs"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-[#061224]">
              Unable to load hotel finances
            </h2>
            <p className="text-sm text-slate-600">
              {overviewQuery.error instanceof Error
                ? overviewQuery.error.message
                : "A temporary error occurred while loading your settlement summary."}
            </p>
            <button
              type="button"
              onClick={() => void overviewQuery.refetch()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#061224] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b1f3a]"
            >
              <RefreshCw className="h-4 w-4 text-[#c89b3c]" />
              Retry
            </button>
          </div>
        </div>
      </section>
    );
  }

  const dateRangeInvalid =
    (!!fromInput && !toInput) ||
    (!fromInput && !!toInput) ||
    (!!fromInput && !!toInput && fromInput > toInput);

  return (
    <section
      className="mx-auto min-w-0 max-w-7xl space-y-6 pb-8 text-[#061224] [overflow-wrap:anywhere]"
      aria-label="Hotel finances"
    >
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9a6b18]">
            Hotel finances
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-[#061224] sm:text-3xl">
              Finances
            </h1>
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#ede7dc] bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              <Building2 className="h-3.5 w-3.5 text-[#9a6b18]" />
              {overview.hotel.name}
            </span>
          </div>
          <p className="text-sm text-slate-600">
            Overview balances show all-time current totals. Date filters apply
            only to the list tabs below.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={overviewQuery.isFetching}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#061224] shadow-2xs transition hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 text-[#9a6b18] ${overviewQuery.isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
          <button
            type="button"
            disabled={!overview.youOweHelpkey.canReportPayment}
            onClick={() => {
              setReportSeed(null);
              setReportSheetOpen(true);
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#061224] px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-[#0b1f3a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowDownLeft className="h-4 w-4 text-[#c89b3c]" />
            Report payment
          </button>
        </div>
      </header>

      {/* Freshness / Stale-data Notice */}
      {overview.freshness.message && (
        <div
          role="status"
          className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs font-medium ${
            overview.freshness.status === "updating"
              ? "border-sky-200 bg-sky-50 text-sky-950"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Clock3 className="h-4 w-4 shrink-0" />
            <span>{overview.freshness.message}</span>
          </div>
          <span className="text-[11px] font-semibold opacity-80">
            Updated {formatHotelDateTime(overview.freshness.lastUpdatedAt, timezone)}
          </span>
        </div>
      )}

      {bannerNotice && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-950"
        >
          <span>{bannerNotice}</span>
          <button
            type="button"
            onClick={() => setBannerNotice("")}
            className="text-xs font-bold underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* 1. Ready for payment */}
        <article className="flex flex-col justify-between rounded-2xl bg-[#061224] p-5 text-white shadow-[0_8px_24px_rgba(6,18,36,0.12)]">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#e6c277]">
                Ready for payment
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 text-[#c89b3c]">
                <Wallet className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight">
              {formatCurrency(overview.readyForPayment.amountPaise)}
            </p>
            <p className="mt-1.5 text-xs text-slate-300">
              {overview.readyForPayment.bookingsCount} verified unreserved booking
              {overview.readyForPayment.bookingsCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
            <p className="text-xs leading-5 text-slate-300">
              {overview.readyForPayment.explanation}
            </p>
            {overview.readyForPayment.bookingsCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  updateUrl({
                    tab: "bookings",
                    status: "ready",
                    awaitingCategory: null,
                  })
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#fed88b] hover:underline"
              >
                View ready bookings
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </article>

        {/* 2. Awaiting clearance */}
        <article className="flex flex-col justify-between rounded-2xl border border-[#ede7dc] bg-white p-5 shadow-2xs">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Awaiting clearance
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-sky-50 text-sky-700">
                <Clock3 className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight text-[#061224]">
              {formatCurrency(overview.awaitingClearance.totalKnownPaise)}
            </p>
            {overview.awaitingClearance.deductionReviewBeforeAssessment && (
              <p className="mt-1 text-[11px] font-semibold text-amber-800">
                Includes amounts before unassessed deductions
              </p>
            )}
          </div>
          <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-xs">
            {(
              [
                [
                  "checkout",
                  "Checkout",
                  overview.awaitingClearance.checkoutPaise,
                  null,
                ],
                [
                  "waiting_period",
                  "Waiting period",
                  overview.awaitingClearance.waitingPeriodPaise,
                  null,
                ],
                [
                  "deduction_review",
                  "Deduction review",
                  overview.awaitingClearance.deductionReviewPaise,
                  overview.awaitingClearance.deductionReviewBeforeAssessment
                    ? "Before deductions"
                    : null,
                ],
                [
                  "evidence_review",
                  "Evidence review",
                  overview.awaitingClearance.evidenceReviewPaise,
                  overview.awaitingClearance.evidenceReviewUnknownCount > 0
                    ? `+${overview.awaitingClearance.evidenceReviewUnknownCount} uncomputed`
                    : null,
                ],
              ] as const
            ).map(([cat, label, val, note]) => (
              <div key={cat} className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    updateUrl({
                      tab: "bookings",
                      status: "awaiting",
                      awaitingCategory: cat,
                    })
                  }
                  className="text-left font-medium text-slate-600 hover:text-[#061224] hover:underline"
                >
                  {label}
                  {note ? (
                    <span className="ml-1 text-[10px] font-semibold text-amber-800">
                      ({note})
                    </span>
                  ) : null}
                </button>
                <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-[#061224]">
                  {formatCurrency(val)}
                </span>
              </div>
            ))}
          </dl>
        </article>

        {/* 3. You owe Helpkey */}
        <article className="flex flex-col justify-between rounded-2xl border border-[#ede7dc] bg-white p-5 shadow-2xs">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                You owe Helpkey
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-50 text-amber-800">
                <ArrowDownLeft className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight text-[#061224]">
              {formatCurrency(overview.youOweHelpkey.amountPaise)}
            </p>
            <p className="mt-1.5 text-xs text-slate-600">
              {overview.youOweHelpkey.bookingsCount} verified collectible booking
              {overview.youOweHelpkey.bookingsCount === 1 ? "" : "s"}
            </p>
            {overview.youOweHelpkey.pendingReportsCount > 0 && (
              <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900">
                {overview.youOweHelpkey.pendingReportsCount} report
                {overview.youOweHelpkey.pendingReportsCount === 1 ? "" : "s"}{" "}
                awaiting verification (
                {formatCurrency(overview.youOweHelpkey.pendingReportsAmountPaise)}
                )
              </p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              disabled={!overview.youOweHelpkey.canReportPayment}
              onClick={() => {
                setReportSeed(null);
                setReportSheetOpen(true);
              }}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#061224] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0b1f3a] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Report payment
            </button>
            {overview.youOweHelpkey.bookingsCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  updateUrl({
                    tab: "bookings",
                    status: "dues",
                    awaitingCategory: null,
                  })
                }
                className="text-xs font-semibold text-[#755a1a] hover:underline"
              >
                View dues bookings
              </button>
            )}
          </div>
        </article>

        {/* 4. Prepared · payment not yet recorded */}
        <article className="flex flex-col justify-between rounded-2xl border border-[#e6c277]/60 bg-[#fbf5e8]/60 p-5 shadow-2xs">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#755a1a]">
                Prepared · payment not yet recorded
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-white text-[#9a6b18]">
                <FileText className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight text-[#061224]">
              {formatCurrency(overview.preparedPayouts.totalPaise)}
            </p>
            <p className="mt-1.5 text-xs text-[#755a1a]">
              {overview.preparedPayouts.count} reserved payout batch
              {overview.preparedPayouts.count === 1 ? "" : "es"} excluded from
              Ready for payment
            </p>
          </div>
          <div className="mt-4 space-y-1.5 border-t border-[#e6c277]/40 pt-3 text-xs">
            {overview.preparedPayouts.items.length === 0 ? (
              <p className="text-slate-600">
                No prepared payout batches awaiting payment recording.
              </p>
            ) : (
              overview.preparedPayouts.items.slice(0, 2).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate font-semibold text-[#061224]">
                    {p.reference} · {formatCurrency(p.finalPaise)}
                  </span>
                  <a
                    href={p.statementUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 font-semibold text-[#755a1a] underline hover:text-[#061224]"
                  >
                    Statement
                  </a>
                </div>
              ))
            )}
          </div>
        </article>
      </div>

      {/* Contextual Action Panel + Advisory Bank Readiness */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section
          aria-label="Recommended next step"
          className="flex flex-col items-stretch justify-between gap-4 rounded-2xl border border-[#ede7dc] bg-white p-5 shadow-2xs sm:flex-row sm:items-center"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                  overview.actionPanel.priority === "owner_action"
                    ? "bg-[#fbf5e8] text-[#755a1a]"
                    : overview.actionPanel.priority === "helpkey_review"
                      ? "bg-amber-50 text-amber-900"
                      : overview.actionPanel.priority === "automatic_waiting"
                        ? "bg-sky-50 text-sky-900"
                        : "bg-emerald-50 text-emerald-800"
                }`}
              >
                {overview.actionPanel.priority === "owner_action"
                  ? "Owner action"
                  : overview.actionPanel.priority === "helpkey_review"
                    ? "Helpkey review"
                    : overview.actionPanel.priority === "automatic_waiting"
                      ? "Automatic clearance"
                      : "Up to date"}
              </span>
              <h2 className="text-base font-bold text-[#061224]">
                {overview.actionPanel.title}
              </h2>
            </div>
            <p className="text-sm text-slate-600">
              {overview.actionPanel.description}
            </p>
          </div>
          {overview.actionPanel.primaryAction && (
            <div>
              {overview.actionPanel.primaryAction.kind === "report_dues" ? (
                <button
                  type="button"
                  onClick={() => {
                    setReportSeed(null);
                    setReportSheetOpen(true);
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#061224] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b1f3a]"
                >
                  {overview.actionPanel.primaryAction.label}
                </button>
              ) : overview.actionPanel.primaryAction.kind === "bank_setup" &&
                overview.actionPanel.primaryAction.href ? (
                <Link
                  href={overview.actionPanel.primaryAction.href}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#061224] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b1f3a]"
                >
                  {overview.actionPanel.primaryAction.label}
                  <ArrowUpRight className="h-4 w-4 text-[#c89b3c]" />
                </Link>
              ) : overview.actionPanel.primaryAction.kind === "view_reports" ? (
                <button
                  type="button"
                  onClick={() => updateUrl({ tab: "reports" })}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#061224] hover:bg-slate-50"
                >
                  {overview.actionPanel.primaryAction.label}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    updateUrl({
                      tab: "bookings",
                      status:
                        overview.actionPanel.primaryAction?.filterStatus ??
                        "all",
                      awaitingCategory: null,
                    })
                  }
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#061224] hover:bg-slate-50"
                >
                  {overview.actionPanel.primaryAction.label}
                </button>
              )}
            </div>
          )}
        </section>

        {/* Advisory Bank Readiness */}
        <aside
          aria-label="Bank readiness"
          className="flex flex-col justify-between rounded-2xl border border-[#ede7dc] bg-white p-5 shadow-2xs"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-[#9a6b18]" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Bank readiness · advisory
                </span>
              </div>
              <p className="mt-1.5 text-sm font-bold text-[#061224]">
                {overview.bankReadiness.status}
              </p>
              {overview.bankReadiness.maskedBank ? (
                <p className="mt-1 text-xs text-slate-600">
                  {overview.bankReadiness.maskedBank.bankName} ·{" "}
                  {overview.bankReadiness.maskedBank.maskedAccount} (
                  {overview.bankReadiness.maskedBank.ifsc})
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-600">
                  No bank account saved for current owner.
                </p>
              )}
            </div>
            <Link
              href={overview.bankReadiness.href}
              className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#061224] hover:bg-slate-50"
            >
              Bank details
            </Link>
          </div>
          <p className="mt-3 text-[11px] leading-4 text-slate-500">
            {overview.bankReadiness.advisoryNote}
          </p>
        </aside>
      </div>

      {/* Tabs + Filters */}
      <div className="rounded-2xl border border-[#ede7dc] bg-white shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 pt-3 sm:px-6">
          <div
            role="tablist"
            aria-label="Finances sections"
            className="flex flex-wrap gap-2"
          >
            {(
              [
                ["bookings", "Booking settlements"],
                ["payments", "Payments"],
                [
                  "reports",
                  overview.youOweHelpkey.pendingReportsCount > 0
                    ? `Reported payments (${overview.youOweHelpkey.pendingReportsCount})`
                    : "Reported payments",
                ],
              ] as const
            ).map(([key, label]) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => updateUrl({ tab: key })}
                  className={`min-h-11 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                    active
                      ? "border-[#c89b3c] text-[#061224]"
                      : "border-transparent text-slate-500 hover:text-[#061224]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="pb-2 text-xs text-slate-500">
            Confirmed paid out:{" "}
            <strong className="text-[#061224]">
              {formatCurrency(overview.summaryTotals.paidOutTotalPaise)}
            </strong>{" "}
            · Dues cleared:{" "}
            <strong className="text-[#061224]">
              {formatCurrency(overview.summaryTotals.duesClearedTotalPaise)}
            </strong>
          </div>
        </div>

        {/* Shared Filter Bar */}
        <form
          onSubmit={applySearchAndDates}
          className="space-y-3 border-b border-slate-100 bg-[#fbfbf9] px-4 py-4 sm:px-6"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_auto_auto_auto]">
            <label className="relative block">
              <span className="sr-only">Search by reference</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Search booking, payout, or transaction ref…"
                className="min-h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-[#061224] outline-none focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/20"
              />
            </label>

            {tab === "bookings" && (
              <div className="flex flex-wrap gap-2">
                <select
                  aria-label="Filter by settlement status"
                  value={statusFilter}
                  onChange={(e) =>
                    updateUrl({
                      status: e.target.value,
                      awaitingCategory:
                        e.target.value === "awaiting" ||
                        e.target.value === "all"
                          ? awaitingCategoryFilter
                          : null,
                    })
                  }
                  className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#061224] outline-none focus:border-[#c89b3c]"
                >
                  <option value="all">All statuses</option>
                  <option value="ready">Ready for payment</option>
                  <option value="awaiting">Awaiting clearance</option>
                  <option value="prepared">Prepared · unpaid</option>
                  <option value="dues">You owe Helpkey</option>
                  <option value="paid">Settled / paid</option>
                  <option value="historical">Historical</option>
                </select>

                {(statusFilter === "awaiting" || statusFilter === "all") && (
                  <select
                    aria-label="Filter by awaiting clearance stage"
                    value={awaitingCategoryFilter}
                    onChange={(e) =>
                      updateUrl({
                        awaitingCategory: e.target.value,
                        status:
                          e.target.value !== "all" ? "awaiting" : statusFilter,
                      })
                    }
                    className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#061224] outline-none focus:border-[#c89b3c]"
                  >
                    <option value="all">All clearance stages</option>
                    <option value="checkout">Awaiting checkout</option>
                    <option value="waiting_period">Waiting period</option>
                    <option value="deduction_review">Deduction review</option>
                    <option value="evidence_review">Evidence review</option>
                  </select>
                )}

                <select
                  aria-label="Filter by balance direction"
                  value={directionFilter}
                  onChange={(e) => updateUrl({ direction: e.target.value })}
                  className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#061224] outline-none focus:border-[#c89b3c]"
                >
                  <option value="all">All directions</option>
                  <option value="payable">Payable to hotel</option>
                  <option value="dues">Owed to Helpkey</option>
                </select>
              </div>
            )}

            {tab === "payments" && (
              <select
                aria-label="Filter by payment type"
                value={typeFilter}
                onChange={(e) => updateUrl({ type: e.target.value })}
                className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#061224] outline-none focus:border-[#c89b3c]"
              >
                <option value="all">All payment types</option>
                <option value="payouts">Hotel payouts</option>
                <option value="dues_receipts">Dues receipts</option>
                <option value="collections">Guest collections</option>
                <option value="refunds">Refunds</option>
              </select>
            )}

            {tab === "reports" && (
              <select
                aria-label="Filter by report status"
                value={reportStatusFilter}
                onChange={(e) => updateUrl({ reportStatus: e.target.value })}
                className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#061224] outline-none focus:border-[#c89b3c]"
              >
                <option value="all">All report statuses</option>
                <option value="awaiting_verification">
                  Awaiting verification
                </option>
                <option value="recorded">Recorded</option>
                <option value="rejected">Rejected</option>
                <option value="withdrawn">Withdrawn</option>
              </select>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <span>From</span>
                <input
                  type="date"
                  aria-label="From date"
                  value={fromInput}
                  onChange={(e) => setFromDraft(e.target.value)}
                  className="min-h-11 rounded-xl border border-slate-200 bg-white px-2.5 text-sm font-normal text-[#061224] outline-none focus:border-[#c89b3c]"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <span>To</span>
                <input
                  type="date"
                  aria-label="To date"
                  value={toInput}
                  onChange={(e) => setToDraft(e.target.value)}
                  className="min-h-11 rounded-xl border border-slate-200 bg-white px-2.5 text-sm font-normal text-[#061224] outline-none focus:border-[#c89b3c]"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={dateRangeInvalid}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#061224] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b1f3a] disabled:opacity-50"
              >
                Apply
              </button>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <FilterX className="h-4 w-4" />
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Dates are evaluated in <strong>{timezone}</strong> and filter the
              list below, not the all-time overview above.
            </span>
            {dateRangeInvalid && (
              <span className="font-semibold text-rose-700">
                Select both From and To dates in chronological order.
              </span>
            )}
          </div>
        </form>

        {/* Tab 1: Booking settlements */}
        {tab === "bookings" && (
          <div role="tabpanel" aria-label="Booking settlements">
            {bookingsQuery.isPending ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-xl bg-slate-100"
                  />
                ))}
              </div>
            ) : bookingsQuery.error ? (
              <div className="p-6 text-sm text-rose-700" role="alert">
                Unable to load booking settlements.{" "}
                <button
                  type="button"
                  onClick={() => void bookingsQuery.refetch()}
                  className="font-semibold underline"
                >
                  Retry
                </button>
              </div>
            ) : bookingItems.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <FileText className="mb-3 h-7 w-7 text-slate-400" />
                <h3 className="text-base font-bold text-[#061224]">
                  No matching bookings
                </h3>
                <p className="mt-1.5 max-w-md text-sm text-slate-500">
                  {hasActiveFilters
                    ? "No bookings match your current search or filters."
                    : "Booking settlements will appear here once stays are recorded."}
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#061224] hover:bg-slate-50"
                  >
                    <FilterX className="h-4 w-4" />
                    Reset filters
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {bookingItems.map((b) => {
                  const stage = stagePresentation(b.stage);
                  const primaryAmount =
                    b.stage === "ready_for_payment"
                      ? formatCurrency(b.readyForPaymentPaise)
                      : b.stage === "prepared_payout"
                        ? formatCurrency(b.reservedPaise)
                        : b.stage === "dues_outstanding"
                          ? formatCurrency(b.duesPaise)
                          : b.awaitingClearanceAmountPaise !== null
                            ? formatCurrency(b.awaitingClearanceAmountPaise)
                            : b.amounts.grossPayablePaise !== null
                              ? formatCurrency(b.amounts.grossPayablePaise)
                              : "Under review";

                  return (
                    <div
                      key={b.bookingId}
                      className="flex flex-col items-stretch justify-between gap-4 px-4 py-4 transition hover:bg-[#fbfbf9] sm:flex-row sm:items-center sm:px-6"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() =>
                              updateUrl({ bookingId: b.bookingId }, "push")
                            }
                            className="min-w-0 max-w-full break-all text-left text-sm font-bold text-[#061224] underline decoration-slate-300 underline-offset-4 hover:text-[#9a6b18]"
                          >
                            {b.reference}
                          </button>
                          <span
                            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${stage.tone}`}
                          >
                            <StageIcon kind={stage.icon} />
                            {stage.label}
                          </span>
                          <span className="text-xs text-slate-500">
                            {formatHotelDate(b.relevantDate, timezone)}
                          </span>
                        </div>
                        <p className="text-xs leading-5 text-slate-600">
                          {b.ownerSummary}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-4 sm:justify-start">
                        <div className="text-right">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            {b.direction === "dues"
                              ? "Hotel owes"
                              : b.direction === "payable"
                                ? b.beforeUnassessedDeductions
                                  ? "Before deductions"
                                  : "Payable to hotel"
                                : b.direction === "settled"
                                  ? "Settled"
                                  : b.direction === "excluded"
                                    ? "Excluded"
                                    : "Pending"}
                          </p>
                          <p className="text-base font-bold text-[#061224]">
                            {primaryAmount}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            updateUrl({ bookingId: b.bookingId }, "push")
                          }
                          aria-label={`Inspect ${b.reference}`}
                          className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#061224] hover:bg-slate-50"
                        >
                          Details
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {bookingsQuery.hasNextPage && (
              <div className="border-t border-slate-100 p-4 text-center">
                <button
                  type="button"
                  disabled={bookingsQuery.isFetchingNextPage}
                  onClick={() => void bookingsQuery.fetchNextPage()}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#061224] hover:bg-slate-50 disabled:opacity-50"
                >
                  {bookingsQuery.isFetchingNextPage ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading more…
                    </>
                  ) : (
                    "Load more bookings"
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Payments */}
        {tab === "payments" && (
          <div role="tabpanel" aria-label="Payments">
            {activityQuery.isPending ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-xl bg-slate-100"
                  />
                ))}
              </div>
            ) : activityQuery.error ? (
              <div className="p-6 text-sm text-rose-700" role="alert">
                Unable to load payments.{" "}
                <button
                  type="button"
                  onClick={() => void activityQuery.refetch()}
                  className="font-semibold underline"
                >
                  Retry
                </button>
              </div>
            ) : activityItems.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <History className="mb-3 h-7 w-7 text-slate-400" />
                <h3 className="text-base font-bold text-[#061224]">
                  No confirmed payments yet
                </h3>
                <p className="mt-1.5 max-w-md text-sm text-slate-500">
                  {hasActiveFilters
                    ? "No payments match your current search or filters."
                    : "Confirmed guest collections, refunds, hotel payouts, and dues receipts appear here."}
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#061224] hover:bg-slate-50"
                  >
                    <FilterX className="h-4 w-4" />
                    Reset filters
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {activityItems.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-col items-stretch justify-between gap-4 px-4 py-4 transition hover:bg-[#fbfbf9] sm:flex-row sm:items-center sm:px-6"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => updateUrl({ activityId: a.id }, "push")}
                          className="text-left text-sm font-bold text-[#061224] hover:text-[#9a6b18]"
                        >
                          {a.title}
                        </button>
                        <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                          {a.status}
                        </span>
                        <span className="text-xs text-slate-500">
                          {formatHotelDate(a.localDate, timezone)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">
                        {a.purpose}
                        {a.payoutReference ? ` · ${a.payoutReference}` : ""}
                        {a.receiptReference ? ` · ${a.receiptReference}` : ""}
                        {a.transactionReference
                          ? ` · Ref: ${a.transactionReference}`
                          : ""}
                        {" · "}
                        {a.bookingReferences.length} booking
                        {a.bookingReferences.length === 1 ? "" : "s"} (
                        {a.bookingReferences
                          .slice(0, 3)
                          .map((b) => b.reference)
                          .join(", ")}
                        {a.bookingReferences.length > 3
                          ? ` +${a.bookingReferences.length - 3}`
                          : ""}
                        )
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {a.statementUrl && (
                        <a
                          href={a.statementUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#061224] hover:bg-slate-50"
                        >
                          <Printer className="h-3.5 w-3.5 text-[#9a6b18]" />
                          Statement
                        </a>
                      )}
                      <div className="text-right">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {a.direction === "in"
                            ? "Received"
                            : a.direction === "out"
                              ? "Paid / refunded"
                              : "Record only"}
                        </p>
                        <p className="text-base font-bold text-[#061224]">
                          {formatCurrency(a.amountPaise)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateUrl({ activityId: a.id }, "push")}
                        aria-label={`Inspect payment ${a.title}`}
                        className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#061224] hover:bg-slate-50"
                      >
                        Details
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {activityQuery.hasNextPage && (
              <div className="border-t border-slate-100 p-4 text-center">
                <button
                  type="button"
                  disabled={activityQuery.isFetchingNextPage}
                  onClick={() => void activityQuery.fetchNextPage()}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#061224] hover:bg-slate-50 disabled:opacity-50"
                >
                  {activityQuery.isFetchingNextPage ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading more…
                    </>
                  ) : (
                    "Load more payments"
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Reported payments */}
        {tab === "reports" && (
          <div role="tabpanel" aria-label="Reported payments">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-[#fbf5e8]/40 px-4 py-3 text-xs text-[#755a1a] sm:px-6">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 shrink-0" />
                <span>
                  Reported payments are pending owner submissions and remain
                  separate from confirmed receipts until verified by Helpkey.
                </span>
              </div>
              <button
                type="button"
                disabled={!overview.youOweHelpkey.canReportPayment}
                onClick={() => {
                  setReportSeed(null);
                  setReportSheetOpen(true);
                }}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-[#061224] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0b1f3a] disabled:opacity-45"
              >
                Report payment
              </button>
            </div>

            {reportsQuery.isPending ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-xl bg-slate-100"
                  />
                ))}
              </div>
            ) : reportsQuery.error ? (
              <div className="p-6 text-sm text-rose-700" role="alert">
                Unable to load reported payments.{" "}
                <button
                  type="button"
                  onClick={() => void reportsQuery.refetch()}
                  className="font-semibold underline"
                >
                  Retry
                </button>
              </div>
            ) : reportItems.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <FileText className="mb-3 h-7 w-7 text-slate-400" />
                <h3 className="text-base font-bold text-[#061224]">
                  No reported payments
                </h3>
                <p className="mt-1.5 max-w-md text-sm text-slate-500">
                  {hasActiveFilters
                    ? "No reported payments match your current filters."
                    : "When you transfer dues to Helpkey, report the payment here for verification."}
                </p>
              </div>
            ) : (
              <div className="space-y-6 p-4 sm:p-6">
                {pendingReports.length > 0 && (
                  <section className="space-y-3" aria-label="Pending reports">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                      Pending verification ({pendingReports.length})
                    </h3>
                    <div className="divide-y divide-amber-100 rounded-2xl border border-amber-200 bg-amber-50/30">
                      {pendingReports.map((r) => {
                        const badge = reportStatusPresentation(r.status);
                        return (
                          <div
                            key={r.id}
                            className="flex flex-col items-stretch justify-between gap-4 p-4 sm:flex-row sm:items-center"
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateUrl({ reportId: r.id }, "push")
                                  }
                                  className="text-sm font-bold text-[#061224] underline decoration-slate-300 underline-offset-4 hover:text-[#9a6b18]"
                                >
                                  {r.reference}
                                </button>
                                <span
                                  className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.tone}`}
                                >
                                  {badge.label}
                                </span>
                                {r.attachment && (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                                    <Paperclip className="h-3.5 w-3.5" />
                                    Proof attached
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-600">
                                {formatHotelDate(r.paymentDate, timezone)} ·{" "}
                                {formatMethod(r.method)} · Ref:{" "}
                                {r.transactionReference}
                              </p>
                            </div>
                            <div className="flex items-center justify-between gap-3 sm:justify-start">
                              <strong className="text-base font-bold text-[#061224]">
                                {formatCurrency(r.amountPaise)}
                              </strong>
                              <button
                                type="button"
                                onClick={() =>
                                  updateUrl({ reportId: r.id }, "push")
                                }
                                className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#061224] hover:bg-slate-50"
                              >
                                Details
                                <ChevronRight className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {outcomeReports.length > 0 && (
                  <section
                    className="space-y-3"
                    aria-label="Verification outcomes"
                  >
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Verification history ({outcomeReports.length})
                    </h3>
                    <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
                      {outcomeReports.map((r) => {
                        const badge = reportStatusPresentation(r.status);
                        return (
                          <div
                            key={r.id}
                            className="flex flex-col items-stretch justify-between gap-4 p-4 sm:flex-row sm:items-center"
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateUrl({ reportId: r.id }, "push")
                                  }
                                  className="text-sm font-bold text-[#061224] underline decoration-slate-300 underline-offset-4 hover:text-[#9a6b18]"
                                >
                                  {r.reference}
                                </button>
                                <span
                                  className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.tone}`}
                                >
                                  {badge.label}
                                </span>
                                {r.linkedReceipt && (
                                  <span className="text-xs font-semibold text-emerald-800">
                                    Receipt: {r.linkedReceipt.reference}
                                    {r.linkedReceipt.corrected
                                      ? " (Corrected)"
                                      : ""}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-600">
                                {formatHotelDate(r.paymentDate, timezone)} ·{" "}
                                {formatMethod(r.method)} · Ref:{" "}
                                {r.transactionReference}
                                {r.rejectionReason
                                  ? ` · Reason: ${r.rejectionReason}`
                                  : ""}
                              </p>
                            </div>
                            <div className="flex items-center justify-between gap-3 sm:justify-start">
                              <strong className="text-base font-bold text-[#061224]">
                                {formatCurrency(r.amountPaise)}
                              </strong>
                              <button
                                type="button"
                                onClick={() =>
                                  updateUrl({ reportId: r.id }, "push")
                                }
                                className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#061224] hover:bg-slate-50"
                              >
                                Details
                                <ChevronRight className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>
            )}

            {reportsQuery.hasNextPage && (
              <div className="border-t border-slate-100 p-4 text-center">
                <button
                  type="button"
                  disabled={reportsQuery.isFetchingNextPage}
                  onClick={() => void reportsQuery.fetchNextPage()}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#061224] hover:bg-slate-50 disabled:opacity-50"
                >
                  {reportsQuery.isFetchingNextPage ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading more…
                    </>
                  ) : (
                    "Load more reports"
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {detailId && detailQuery.isPending && !selectedBooking && !selectedActivity && !selectedReport && (
        <p role="status" className="rounded-xl bg-white p-4 text-sm">Loading finance details…</p>
      )}
      {detailId && (detailQuery.error || (detailQuery.isSuccess && !detailQuery.data.items.length)) && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          Unable to open this finance record. It may no longer be available.
          <button className="ml-3 underline" onClick={() => void detailQuery.refetch()}>Retry</button>
          <button className="ml-3 underline" onClick={() => updateUrl({ bookingId: null, activityId: null, reportId: null })}>Dismiss</button>
        </div>
      )}
      {/* Responsive Detail Drawers */}
      <BookingSettlementDetailDrawer
        booking={selectedBooking}
        propertyId={propertyId}
        timezone={timezone}
        onClose={() => updateUrl({ bookingId: null })}
      />

      <ActivityDetailDrawer
        activity={selectedActivity}
        propertyId={propertyId}
        timezone={timezone}
        onClose={() => updateUrl({ activityId: null })}
      />

      <ReportDetailDrawer
        report={selectedReport}
        propertyId={propertyId}
        timezone={timezone}
        onClose={() => updateUrl({ reportId: null })}
        onWithdrawn={() => {
          setBannerNotice("Payment report withdrawn.");
          updateUrl({ reportId: null });
          void refreshAll();
        }}
        onCopyToDraft={(seed) => {
          setReportSeed(seed);
          updateUrl({ reportId: null });
          setReportSheetOpen(true);
        }}
      />

      <ReportPaymentDrawer
        open={effectiveReportSheetOpen}
        onClose={() => {
          setReportSheetOpen(false);
          if (actionParam === "report") updateUrl({ action: null });
        }}
        propertyId={propertyId}
        hotelName={overview.hotel.name}
        timezone={timezone}
        totalDuesPaise={overview.youOweHelpkey.amountPaise}
        maxSingleReportPaise={overview.youOweHelpkey.maxSingleReportPaise}
        maxSingleReportBookingsCount={
          overview.youOweHelpkey.maxSingleReportBookingsCount
        }
        seed={reportSeed}
        onSubmitted={(reportId, reference) => {
          setReportSheetOpen(false);
          setReportSeed(null);
          setBannerNotice(
            `Reported payment ${reference} submitted and awaiting Helpkey verification.`,
          );
          updateUrl({ tab: "reports", reportId, action: null });
          void refreshAll();
        }}
      />
    </section>
  );
}

export function OwnerFinancesPermissionDenied() {
  return (
    <section
      role="alert"
      className="mx-auto max-w-2xl rounded-2xl border border-[#ede7dc] bg-white p-8 text-center shadow-2xs"
    >
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-800">
        <ShieldAlert className="h-6 w-6" />
      </div>
      <h1 className="text-xl font-bold text-[#061224]">
        Owner permission required
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Only the active hotel owner can view hotel finances, settlement
        balances, and reported dues payments.
      </p>
      <div className="mt-5">
        <Link
          href="/partner/dashboard"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#061224] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0b1f3a]"
        >
          Back to overview
        </Link>
      </div>
    </section>
  );
}
