"use client";

import Link from "next/link";
import { PartnerDatePicker } from "./partner-date-picker";
import { pageRange, shiftDay, validPageRange } from "@/lib/partner/date-range";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  BedDouble,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  IndianRupee,
  Layers,
  RefreshCw,
  Send,
  Star,
  UsersRound,
} from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import type { Overview, Range } from "@/lib/partner/dashboard/domain";
import { formatPaise } from "@/lib/currency";
import type { Property } from "./types";
import { DashboardCard, MetricCard } from "./shared";
import { ReservationWorkspace } from "./reservation-workspace";
import { ManualBookingDialog } from "./manual-booking-dialog";
import { PropertyImage } from "./property-image";
import { Drawer } from "./drawer";
import { OverviewFinancialChart } from "./overview-financial-chart";
import { reportingGrouping, type Grouping } from "@/lib/partner/dashboard/ux";
import { localParts } from "@/lib/booking/domain";

type Row = Overview["upcomingReservations"][number];
type View = keyof Overview["operations"] | "upcoming";

const money = (value: number) => formatPaise(value, { withFractions: true });
const shortDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00Z`));
const weekday = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00Z`));
const label = (value: string) => value.replaceAll("_", " ");

const viewLabels: Record<View, string> = {
  arrivals: "Arrivals",
  departures: "Departures",
  in_house: "In-house",
  requests: "Guest requests",
  overdue: "Overdue arrivals",
  overdue_departures: "Late checkouts",
  balances: "Balances",
  upcoming: "Upcoming",
};

const lifecycleViews: View[] = [
  "arrivals",
  "in_house",
  "departures",
  "upcoming",
];
const exceptionViews: View[] = [
  "overdue",
  "overdue_departures",
  "requests",
  "balances",
];

export function PartnerOverviewView({
  selectedProperty,
  propertyName,
  businessName,
  reportingDate,
  onInitialLoadingChange,
}: {
  selectedProperty?: Property;
  propertyName: string;
  businessName: string;
  isLive: boolean;
  health: number;
  reportingDate: string;
  onInitialLoadingChange?: (loading: boolean) => void;
}) {
  const params = useSearchParams();
  const dates = pageRange(
    params.get("from"),
    params.get("to"),
    reportingDate,
    6,
  );
  const grouping: Grouping = ["daily", "weekly", "monthly"].includes(
    params.get("range") || "",
  )
    ? (params.get("range") as Range)
    : "auto";
  const range = reportingGrouping(dates.from, dates.to, grouping);
  const periodLabel = `${shortDate(dates.from)} – ${shortDate(dates.to)} ${dates.to.slice(0, 4)}`;
  useEffect(() => {
    if (
      validPageRange(params.get("from"), params.get("to")) &&
      params.get("date") !== dates.to
    ) {
      const url = new URL(window.location.href);
      url.searchParams.set("date", dates.to);
      window.history.replaceState(null, "", url);
    }
  }, [params, dates.to]);
  const propertyId = selectedProperty?.id || "";
  const client = useQueryClient();

  const query = useQuery({
    queryKey: [
      "partner",
      propertyId,
      "overview",
      dates.to,
      range,
      dates.from,
      dates.to,
    ],
    enabled: !!propertyId,
    queryFn: ({ signal }) =>
      apiFetch<Overview>(
        `/api/partner/dashboard/overview?${new URLSearchParams({
          propertyId,
          date: dates.to,
          range,
          from: dates.from,
          to: dates.to,
        })}`,
        { signal, cache: "no-store", timeoutMs: 20_000 },
      ),
    refetchInterval: () =>
      typeof document !== "undefined" && document.visibilityState === "visible"
        ? 60_000
        : false,
    refetchOnWindowFocus: "always",
    refetchOnMount: "always",
    staleTime: 10_000,
  });

  const data = query.data;
  const loading = query.isPending && !!propertyId;
  const initial = useRef(false);

  useLayoutEffect(() => {
    if (!initial.current) {
      onInitialLoadingChange?.(loading);
      if (!loading) initial.current = true;
    }
  }, [loading, onInitialLoadingChange]);

  const [manual, setManual] = useState(false);
  const [actionCenterOpen, setActionCenterOpen] = useState(false);
  const requestedView = params.get("view");
  const view: View =
    requestedView && Object.hasOwn(viewLabels, requestedView)
      ? (requestedView as View)
      : "arrivals";
  const bookingId = params.get("bookingId");

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const url = new URL(window.location.href);
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
      url.searchParams.set("propertyId", propertyId);
      window.history.pushState(null, "", url);
    },
    [propertyId],
  );

  const setView = (next: View) => {
    setParam("view", next);
    document
      .getElementById("operations")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  const refresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: ["partner", propertyId] });
    void client.invalidateQueries({ queryKey: ["partner", "shell"] });
  }, [client, propertyId]);

  useEffect(() => {
    window.addEventListener("stay-request-updated", refresh);
    return () => window.removeEventListener("stay-request-updated", refresh);
  }, [refresh]);

  const href = (path: string, extra: Record<string, string> = {}) =>
    `${path}?${new URLSearchParams({ propertyId, date: dates.to, ...(path === "/partner/reservations" ? { scope: "range", from: dates.from, to: dates.to } : path === "/partner/rooms" ? { calendarStart: dates.from, calendarEnd: dates.to } : {}), ...extra })}`;
  const applyDates = (from: string, to: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    url.searchParams.set("date", to);
    url.searchParams.set("propertyId", propertyId);
    url.searchParams.delete("bookingId");
    window.history.pushState({}, "", url);
  };
  const open = (id: string) => setParam("bookingId", id);
  const lastSeven = () => {
    const today = localParts(
      Date.now(),
      selectedProperty?.timezone || "Asia/Kolkata",
    ).date;
    applyDates(shiftDay(today, -6), today);
  };

  if (!selectedProperty) {
    return (
      <DashboardCard className="p-8">
        <h1 className="text-2xl font-bold text-[#061224]">
          Start welcoming guests
        </h1>
        <p className="my-3 text-slate-600">
          Add your first property to manage reservations, availability and
          performance.
        </p>
        <Link
          href="/partner/onboarding"
          className="font-semibold text-[#c89b3c] underline hover:text-[#061224]"
        >
          Add a property
        </Link>
      </DashboardCard>
    );
  }

  const metrics = data?.metrics;
  const rows = data
    ? view === "upcoming"
      ? data.upcomingReservations
      : data.operations[view]
    : [];
  const val = (value: number | undefined, financial = false) =>
    !data ? "—" : financial ? money(value ?? 0) : String(value ?? 0);

  const pendingAttentionTotal = data?.attention?.uniqueReservationCount ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Dashboard</h2>
        <div className="w-full sm:w-auto">
          <PartnerDatePicker
            aria-label="Dashboard date range"
            timezone={selectedProperty.timezone}
            range
            value={dates.from}
            endValue={dates.to}
            maxDays={31}
            onChange={() => {}}
            onRangeChange={applyDates}
          />
          <p
            aria-live="polite"
            className="mt-1 text-right text-xs text-slate-500"
          >
            {query.isFetching
              ? loading
                ? "Loading selected period…"
                : "Updating dashboard…"
              : query.isError
                ? "Update failed"
                : selectedProperty.timezone || "Asia/Kolkata"}
          </p>
        </div>
      </div>
      {/* Property Hero Banner - Option 1: Luxury Panoramic Banner (Unstretched) */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800/10 bg-[#061224] p-6 sm:p-7 text-white shadow-md">
        {/* Right-aligned Unstretched Hotel Cover Photo with Smooth Gradient Fade */}
        <div className="absolute right-0 top-0 bottom-0 w-full sm:w-1/2 lg:w-5/12 overflow-hidden pointer-events-none z-0">
          <PropertyImage
            src={selectedProperty.coverImageUrl}
            name={propertyName}
            className="h-full w-full object-cover object-center"
          />
          {/* Dual Multi-stop Gradient Overlays to smoothly blend photo into #061224 */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#061224] via-[#061224]/85 to-transparent z-1" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#061224]/90 via-transparent to-[#061224]/30 z-1" />
        </div>

        {/* Banner Content (Relative z-10 for crisp clickability & readability) */}
        <div className="relative z-10 flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            {/* Status & Alerts Row */}
            <div className="flex flex-wrap items-center gap-2.5">
              {data ? (
                data.property.isLive ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white shadow-2xs backdrop-blur-md">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Live on Helpkey
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-400/15 px-2.5 py-0.5 text-xs font-semibold text-amber-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    {label(data.property.status)} ·{" "}
                    {label(data.property.approvalStatus)}
                  </span>
                )
              ) : (
                <span className="text-xs text-slate-400">Checking status…</span>
              )}
              {data && !data.property.isLive && (
                <span className="rounded-md bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-200 border border-amber-400/20">
                  Approval pending
                </span>
              )}
            </div>

            {/* Hotel Name */}
            <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-white drop-shadow-xs">
              {propertyName}
            </h1>

            {/* Subtitle with Ownership & Completeness */}
            <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-xs text-slate-300">
              <span className="font-medium text-slate-200">{businessName}</span>
              <span className="text-white/30">•</span>
              <Link
                href={href("/partner/listing")}
                className="inline-flex items-center gap-1.5 font-medium text-slate-300 hover:text-white transition-colors"
                title="Click to view and complete listing requirements"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" />
                <span>
                  Listing completeness{" "}
                  {data ? `${data.readiness.percentage}%` : "—"}
                </span>
                <ArrowUpRight className="h-3 w-3 text-slate-400 opacity-80" />
              </Link>
            </div>
          </div>

          {/* Clean 2-Button Action Dock: Just New Reservation & Public Listing */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 pt-2 lg:pt-0">
            <button
              onClick={() => setManual(true)}
              className="inline-flex items-center justify-center rounded-xl bg-white hover:bg-slate-100 text-[#061224] px-4.5 py-2.5 text-xs font-bold shadow-md transition-all active:scale-95"
            >
              + New reservation
            </button>
            {data?.property.isLive && selectedProperty.slug && (
              <Link
                href={`/hotels/${selectedProperty.slug}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 px-4 py-2.5 text-xs font-semibold text-white shadow-2xs backdrop-blur-md transition-all hover:border-white/30"
              >
                <span>Public listing</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-300" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* System & Listing Alerts */}
      {query.isError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
            <span>
              {query.error.message}{" "}
              {data && "Showing the last successful update."}
            </span>
          </div>
          <button
            onClick={() => void query.refetch()}
            className="rounded-lg bg-white px-3 py-1 font-bold text-red-700 shadow-xs border border-red-200 hover:bg-red-50"
          >
            Retry
          </button>
        </div>
      )}

      {data && !data.property.isLive && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <span>
              Your listing is {label(data.property.status)} /{" "}
              {label(data.property.approvalStatus)}
              {!data.property.isBookable
                ? " and closed to new bookings"
                : ""}. {data.property.rejectionReason}
            </span>
          </div>
          <Link
            href={href("/partner/listing")}
            className="rounded-lg bg-white px-3 py-1 text-xs font-bold text-amber-800 shadow-xs border border-amber-200 hover:bg-amber-100/50"
          >
            Review listing
          </Link>
        </div>
      )}

      {/* Operational KPI Strip */}
      <div className="space-y-2">
        <div
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
          aria-busy={loading}
        >
          <button
            type="button"
            onClick={() => setView("arrivals")}
            className="text-left transition-transform active:scale-[0.99] rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b78929]"
          >
            <MetricCard
              loading={loading}
              icon={UsersRound}
              title="Arrivals"
              value={val(metrics?.arrivals)}
              trend={
                data
                  ? `${metrics?.expectedArrivals} expected · ${metrics?.completedArrivals} checked in`
                  : "Awaiting data"
              }
              trendType="neutral"
              isActive={view === "arrivals"}
              accent="blue"
            />
          </button>

          <button
            type="button"
            onClick={() => setView("departures")}
            className="text-left transition-transform active:scale-[0.99] rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b78929]"
          >
            <MetricCard
              loading={loading}
              icon={Send}
              title="Departures"
              value={val(metrics?.departures)}
              trend={
                data
                  ? `${metrics?.expectedDepartures} expected · ${metrics?.completedDepartures} checked out`
                  : "Awaiting data"
              }
              trendType="neutral"
              isActive={view === "departures"}
              accent="purple"
            />
          </button>

          <button
            type="button"
            onClick={() => setView("in_house")}
            className="text-left transition-transform active:scale-[0.99] rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b78929]"
          >
            <MetricCard
              loading={loading}
              icon={Clock3}
              title="Room utilization"
              value={data ? `${metrics?.occupancy}%` : "—"}
              trend={
                data
                  ? `${metrics?.stayingTonight} checked-in stays in period`
                  : "Awaiting data"
              }
              trendType="neutral"
              isActive={view === "in_house"}
              tooltip="Booked room hours divided by configured room capacity hours across the selected range. Includes hourly and overnight stays."
              accent="teal"
            />
          </button>

          <a
            href="#financial-report"
            className="block text-left transition-transform active:scale-[0.99] rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b78929]"
          >
            <MetricCard
              loading={loading}
              icon={IndianRupee}
              title="Net collections"
              value={val(metrics?.netPaise, true)}
              trend={
                data
                  ? `${shortDate(data.period.start)} – ${shortDate(data.period.end)}`
                  : "Awaiting data"
              }
              trendType="neutral"
              accent="emerald"
            />
          </a>

          <button
            type="button"
            onClick={() => setActionCenterOpen(true)}
            className="block text-left transition-transform active:scale-[0.99] rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b78929] w-full"
            aria-label="Needs attention now - Open action center drawer"
          >
            <MetricCard
              loading={loading}
              icon={Bell}
              title="Needs attention now"
              value={data ? String(pendingAttentionTotal) : "—"}
              trend={
                data ? "Current requests & overdue stays" : "Awaiting data"
              }
              trendType={pendingAttentionTotal > 0 ? "attention" : "neutral"}
              isActive={
                actionCenterOpen || view === "overdue" || view === "requests"
              }
              tooltip="Current-stay requests requiring hotel action, overdue arrivals and overdue departures. Each reservation is counted once, even when it appears in more than one category."
              accent={pendingAttentionTotal > 0 ? "rose" : "amber"}
            />
          </button>
        </div>
      </div>

      {/* Sales & Collections Overview (Full Width with Generous Space) */}
      <DashboardCard className="min-w-0 p-5 sm:p-6 bg-white">
        <section id="financial-report">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#061224]">
                  Booking value &amp; collections
                </h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600">
                  Financial breakdown
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {data ? periodLabel : "Loading reporting period…"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div
                className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1"
                aria-label="Chart grouping"
              >
                {(["auto", "daily", "weekly", "monthly"] as Grouping[]).map(
                  (r) => (
                    <button
                      key={r}
                      aria-pressed={grouping === r}
                      onClick={() => setParam("range", r === "auto" ? null : r)}
                      className={`min-h-11 rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-all ${
                        grouping === r
                          ? "bg-[#061224] text-white shadow-xs"
                          : "text-slate-600 hover:bg-white hover:text-[#061224]"
                      }`}
                    >
                      {r}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>

          {/* Revenue Chart */}
          <p className="mt-3 text-xs text-slate-500">
            {grouping === "auto"
              ? `Auto · ${range === "weekly" ? "weekly" : "daily"} totals`
              : `${label(range)} totals`}{" "}
            within the selected dates. Net collections = payments received minus
            completed refunds.
          </p>
          <OverviewFinancialChart
            key={`${propertyId}-${dates.from}-${dates.to}-${range}`}
            data={data?.series}
            loading={loading}
            period={periodLabel}
            onLastSeven={lastSeven}
          />

          {/* Core Financial Totals: Clean, Open Stat Bar (No Nested Boxes) */}
          <div className="mt-6 border-t border-slate-100 pt-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
              {[
                {
                  title: "Booking value",
                  value: metrics?.bookedPaise,
                  desc: "Value of bookings created in period",
                },
                {
                  title: "Payments received",
                  value: metrics?.paidPaise,
                  desc: "Total collected",
                },
                {
                  title: "Refunds issued",
                  value: metrics?.refundedPaise,
                  desc: "Completed refunds",
                },
                {
                  title: "Net collections",
                  value: metrics?.netPaise,
                  desc: "Payments minus refunds",
                  highlight: true,
                },
              ].map(({ title, value, desc, highlight }) => (
                <div key={title} className="space-y-1">
                  <p className="text-xs font-medium text-slate-500">{title}</p>
                  <p
                    className={`text-2xl font-bold tracking-tight ${
                      highlight ? "text-[#061224]" : "text-slate-800"
                    }`}
                  >
                    {val(value, true)}
                  </p>
                  <p className="text-[11px] text-slate-400">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Unified Financial Breakdown: Single Sleek Panel with Dividers */}
          <div className="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/40 p-5 sm:p-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-0 md:divide-x md:divide-slate-200/80">
              {/* Column 1: Payment Sources */}
              <div className="md:pr-6">
                <div className="mb-3.5 flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-[#c89b3c] border border-amber-200/60">
                    <CreditCard className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-xs font-bold text-[#061224]">
                    Payment Sources
                  </h3>
                </div>
                <div className="space-y-2.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Online Payments:</span>
                    <b className="font-semibold text-slate-900">
                      {val(metrics?.platformCollectedPaise, true)}
                    </b>
                  </div>
                  <div className="flex justify-between">
                    <span>At Hotel (Front Desk):</span>
                    <b className="font-semibold text-slate-900">
                      {val(metrics?.propertyCollectedPaise, true)}
                    </b>
                  </div>
                  <div className="flex justify-between">
                    <span>Of which, extra services:</span>
                    <b className="font-semibold text-slate-900">
                      {val(metrics?.serviceCollectedPaise, true)}
                    </b>
                  </div>
                </div>
              </div>

              {/* Column 2: Booking Activity */}
              <div className="pt-6 md:pt-0 md:px-6 border-t md:border-t-0 border-slate-200/70">
                <div className="mb-3.5 flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-600 border border-blue-200/60">
                    <Layers className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-xs font-bold text-[#061224]">
                    Booking Activity
                  </h3>
                </div>
                <div className="space-y-2.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>New Bookings:</span>
                    <b className="font-semibold text-slate-900">
                      {val(metrics?.bookingCount)}
                    </b>
                  </div>
                  <div className="flex justify-between">
                    <span>Cancellations &amp; No-shows:</span>
                    <b className="font-semibold text-slate-900">
                      {val(metrics?.cancellationCount)}
                    </b>
                  </div>
                  <div className="flex justify-between">
                    <span>Completed Stays:</span>
                    <b className="font-semibold text-slate-900">
                      {val(metrics?.completedArrivals)}
                    </b>
                  </div>
                </div>
              </div>

              {/* Column 3: Room Usage & Balances */}
              <div className="pt-6 md:pt-0 md:pl-6 border-t md:border-t-0 border-slate-200/70">
                <div className="mb-3.5 flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60">
                    <Clock3 className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-xs font-bold text-[#061224]">
                    Room Usage &amp; Balances
                  </h3>
                </div>
                <div className="space-y-2.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Total Room-Hours:</span>
                    <b className="font-semibold text-slate-900">
                      {data ? metrics?.roomHours.toFixed(1) : "—"} hrs
                    </b>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Room-Nights:</span>
                    <b className="font-semibold text-slate-900">
                      {val(metrics?.roomNights)}
                    </b>
                  </div>
                  <div className="border-t border-slate-200/80 pt-2">
                    <button
                      type="button"
                      className="flex w-full justify-between font-semibold text-[#061224] hover:text-[#c89b3c] transition-colors"
                      onClick={() => setView("balances")}
                    >
                      <span className="underline">Unpaid Guest Balances:</span>
                      <b className="text-amber-800">
                        {val(metrics?.outstandingPaise, true)}
                      </b>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </DashboardCard>

      {/* Daily Operations Table & Navigation */}
      <DashboardCard className="overflow-hidden bg-white">
        <section id="operations">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/90 p-5 sm:p-6 bg-slate-50/50">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#061224]">
                  Selected-period operations
                </h2>
                <span className="rounded-md bg-[#061224] px-2 py-0.5 text-[11px] font-semibold text-white">
                  {viewLabels[view]}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {view === "overdue" || view === "overdue_departures"
                  ? "Current overdue reservations · independent of report dates."
                  : `${periodLabel} · Select a reservation to view details or take action.`}
              </p>
            </div>
            <Link
              href={href("/partner/reservations")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#061224] underline underline-offset-4 hover:text-[#c89b3c] transition-colors"
            >
              <span>All reservations</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Operations View Tabs: Unified Sleek Segmented Bar */}
          <div className="border-b border-slate-100 bg-white px-4 py-3 sm:px-6">
            <div
              className="flex items-center gap-2 overflow-x-auto no-scrollbar"
              aria-label="Operations view"
            >
              {/* Primary Lifecycle Views */}
              {lifecycleViews.map((v) => {
                const count = data
                  ? v === "upcoming"
                    ? data.upcomingReservations.length
                    : data.operations[v].length
                  : 0;
                const isSelected = view === v;
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setView(v)}
                    className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                      isSelected
                        ? "bg-[#061224] text-white shadow-xs"
                        : "bg-slate-100/80 text-slate-700 hover:bg-slate-200/80"
                    }`}
                  >
                    {viewLabels[v]} {data ? `(${count})` : ""}
                  </button>
                );
              })}

              <div
                className="h-5 w-px bg-slate-200 shrink-0 mx-1"
                aria-hidden="true"
              />

              {/* Exception & Attention Views */}
              {exceptionViews.map((v) => {
                const count = data
                  ? v === "upcoming"
                    ? data.upcomingReservations.length
                    : data.operations[v].length
                  : 0;
                const isSelected = view === v;
                const isUrgent =
                  count > 0 && (v === "overdue" || v === "overdue_departures");
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setView(v)}
                    className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition-all border ${
                      isSelected
                        ? "bg-[#061224] text-white border-[#061224] shadow-xs"
                        : isUrgent
                          ? "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100 font-bold"
                          : count > 0
                            ? "bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100"
                            : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-800"
                    }`}
                  >
                    {viewLabels[v]} {data ? `(${count})` : ""}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Overdue Arrivals Context Banner (Shown when viewing Arrivals but Overdue Check-ins Exist) */}
          {data &&
            data.operations.overdue.length > 0 &&
            view === "arrivals" && (
              <div className="mx-4 my-3 flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 p-3 sm:mx-6 text-xs">
                <div className="flex items-center gap-2.5 text-rose-950 min-w-0">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-rose-200 text-rose-800">
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate">
                    <strong className="font-bold">
                      {data.operations.overdue.length} arrival
                      {data.operations.overdue.length === 1 ? "" : "s"}
                    </strong>{" "}
                    past scheduled arrival time.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setView("overdue")}
                  className="shrink-0 rounded-xl bg-rose-600 px-3.5 py-1.5 font-bold text-white shadow-xs hover:bg-rose-700 transition-colors"
                >
                  Review overdue ({data.operations.overdue.length})
                </button>
              </div>
            )}

          <ReservationTable
            rows={rows}
            loading={loading}
            available={!!data}
            timezone={data?.timezone || "Asia/Kolkata"}
            onOpen={open}
            view={view}
            onSwitchView={setView}
            overdueCount={data?.operations.overdue.length ?? 0}
          />
        </section>
      </DashboardCard>

      {/* Room Availability (Full Width) */}
      <DashboardCard className="p-5 sm:p-6 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-lg font-bold text-[#061224]">
              Room availability
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Available rooms in the selected range, accounting for reservations
              and blocked dates.
            </p>
          </div>
          <Link
            href={href("/partner/rooms", { tab: "inventory" })}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#061224] underline hover:text-[#c89b3c] transition-colors"
          >
            <span>Update availability</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {!data ? (
          <p className="mt-4 text-sm text-slate-500">
            Availability {loading ? "loading…" : "unavailable."}
          </p>
        ) : !data.availability.some((d) => d.total) ? (
          <p className="mt-4 text-sm text-slate-500">
            Add active room inventory to start selling.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {data.availability.map((day, idx) => {
              const isToday = data.today ? day.date === data.today : idx === 0;
              const isZero = day.remaining === 0;
              const isLow = day.remaining > 0 && day.remaining <= 2;

              return (
                <Link
                  key={day.date}
                  href={href("/partner/rooms", {
                    date: day.date,
                    calendarStart: day.date,
                    calendarEnd: day.date,
                    tab: "inventory",
                  })}
                  className={`group flex flex-col items-center justify-center rounded-2xl border px-3 py-3.5 text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs ${
                    isToday
                      ? "border-[#c89b3c]/80 bg-[#fbf5e8]/40 ring-1 ring-[#c89b3c]/20"
                      : isZero
                        ? "border-rose-200 bg-rose-50/40 hover:bg-rose-50"
                        : isLow
                          ? "border-amber-200 bg-amber-50/40 hover:bg-amber-50"
                          : "border-slate-100 bg-slate-50/50 hover:border-slate-200 hover:bg-white"
                  }`}
                >
                  {/* Date & Weekday */}
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-slate-600 transition-colors">
                    {isToday ? (
                      <span className="text-[#c89b3c] font-black">Today</span>
                    ) : (
                      weekday(day.date)
                    )}
                  </span>
                  <span className="text-xs font-semibold text-slate-700 mt-0.5">
                    {shortDate(day.date)}
                  </span>

                  {/* Available Units Count */}
                  <p
                    className={`mt-2 text-2xl font-black tracking-tight ${
                      isZero
                        ? "text-rose-600"
                        : isLow
                          ? "text-amber-800"
                          : "text-[#061224]"
                    }`}
                  >
                    {day.remaining.toLocaleString("en-IN")}
                  </p>

                  {/* Clean Status Subtitle */}
                  <span
                    className={`mt-0.5 text-[11px] font-medium ${
                      isZero
                        ? "font-bold text-rose-700"
                        : isLow
                          ? "font-bold text-amber-700"
                          : "text-slate-400"
                    }`}
                  >
                    {isZero ? "Sold out" : isLow ? "Low stock" : "available"}
                  </span>

                  {/* Only show held/blocked if actually present */}
                  {(day.blocked > 0 || day.reserved > 0) && (
                    <div className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-slate-500 border-t border-slate-100 pt-1.5 w-full">
                      {day.reserved > 0 && (
                        <span className="text-amber-800 font-semibold">
                          {day.reserved} held
                        </span>
                      )}
                      {day.blocked > 0 && (
                        <span className="text-rose-800 font-semibold">
                          {day.blocked} blocked
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </DashboardCard>

      {/* Guest Reviews & Reputation Pulse (Option 2) */}
      <DashboardCard className="overflow-hidden bg-white">
        <section aria-labelledby="reviews-pulse-heading">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/90 p-5 sm:p-6 bg-slate-50/50">
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="reviews-pulse-heading"
                  className="text-lg font-bold text-[#061224]"
                >
                  Guest reviews &amp; reputation
                </h2>
                {data?.review.summary.count ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-200/70">
                    <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                    {data.review.summary.average.toFixed(1)}
                    <span className="text-amber-600 font-normal">
                      ({data.review.summary.count}{" "}
                      {data.review.summary.count === 1 ? "review" : "reviews"})
                    </span>
                  </span>
                ) : (
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 border border-slate-200">
                    No reviews yet
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Verified feedback from guests who completed stays at your
                property.
              </p>
            </div>

            <Link
              href={href("/partner/reviews")}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-[#061224] transition-colors"
            >
              <span>View all reviews</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
            </Link>
          </div>

          <div className="p-5 sm:p-6">
            {data?.review.latest ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-100 bg-[#fbfbfb] p-4 sm:p-5">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`h-3.5 w-3.5 ${
                            i < Math.round(data.review.latest?.rating ?? 5)
                              ? "fill-amber-400 text-amber-400"
                              : "text-slate-200"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-bold text-slate-700">
                      {data.review.latest.rating.toFixed(1)} / 5.0
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-xs text-slate-500">
                      {data.review.latest.submittedAt
                        ? shortDate(data.review.latest.submittedAt.slice(0, 10))
                        : "Recent stay"}
                    </span>
                  </div>

                  {data.review.latest.text ? (
                    <blockquote className="text-sm font-medium italic text-slate-800 line-clamp-2">
                      &ldquo;{data.review.latest.text}&rdquo;
                    </blockquote>
                  ) : (
                    <p className="text-xs text-slate-500 italic">
                      Guest provided a rating without written comments.
                    </p>
                  )}

                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">
                      {data.review.latest.reviewerName}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-emerald-700 font-medium">
                      Verified Helpkey guest
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-3 pt-2 sm:pt-0">
                  {typeof data.metrics.unansweredReviews === "number" &&
                    data.metrics.unansweredReviews > 0 && (
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 border border-amber-200">
                        {data.metrics.unansweredReviews}{" "}
                        {data.metrics.unansweredReviews === 1
                          ? "review needs reply"
                          : "reviews need reply"}
                      </span>
                    )}
                  <Link
                    href={href("/partner/reviews")}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#061224] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#061224]/90 active:scale-95 transition"
                  >
                    <span>Reply to guest</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-[#fbfbfb] p-5">
                <div className="flex items-start gap-3.5">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200/60">
                    <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#061224]">
                      No guest reviews yet
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500 max-w-xl">
                      Guests automatically receive a review invitation after
                      their checkout. Prompt replies to guest feedback help
                      build trust and increase your property ranking.
                    </p>
                  </div>
                </div>
                <Link
                  href={href("/partner/reviews")}
                  className="inline-flex items-center gap-1.5 self-start sm:self-center rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                >
                  <span>Review portal</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
                </Link>
              </div>
            )}
          </div>
        </section>
      </DashboardCard>

      {/* Footer Status & Manual Refresh Trigger */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-3 text-xs text-slate-500 shadow-xs">
        <span aria-live="polite" className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${query.isError ? "bg-amber-500" : query.isFetching ? "bg-blue-500 animate-pulse" : "bg-emerald-500"}`}
          />
          {data
            ? `${query.isError ? "Last successful update" : "Updated"} ${new Intl.DateTimeFormat(
                "en-IN",
                {
                  timeStyle: "medium",
                  timeZone: data.timezone,
                },
              ).format(
                new Date(data.generatedAt),
              )} · Auto-refreshes every minute`
            : "No successful update yet"}
        </span>

        <button
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-xs hover:bg-slate-50 active:scale-95 disabled:opacity-50 transition-all"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin text-[#c89b3c]" : "text-slate-400"}`}
          />
          <span>{query.isFetching ? "Refreshing…" : "Refresh dashboard"}</span>
        </button>
      </div>

      <Drawer
        open={actionCenterOpen}
        onClose={() => setActionCenterOpen(false)}
        title="Action center"
        description="Live operational work is independent of your reporting dates."
      >
        <div className="space-y-5">
          {!data ? (
            <p role="status">
              {loading
                ? "Checking current tasks…"
                : "Current tasks unavailable. Retry the dashboard update."}
            </p>
          ) : (
            <>
              <section className="space-y-3" aria-label="Needs attention now">
                <h3 className="font-bold">Needs attention now</h3>
                <p className="text-xs text-slate-500">
                  {pendingAttentionTotal} unique reservation
                  {pendingAttentionTotal === 1 ? " needs" : "s need"} attention.
                  Category counts may overlap.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ["Arrivals overdue", data.attention?.overdueArrivals],
                    ["Departures overdue", data.attention?.overdueDepartures],
                    ["Stays with requests", data.attention?.requestStays],
                  ].map(([name, count]) => (
                    <div
                      key={String(name)}
                      className="rounded-xl border border-amber-100 bg-amber-50 p-3"
                    >
                      <p className="text-xs text-slate-600">{name}</p>
                      <p className="mt-1 text-xl font-bold">{count ?? "—"}</p>
                    </div>
                  ))}
                </div>
                {data.alerts
                  .filter((a) =>
                    ["overdue", "overdue_departures", "requests"].includes(
                      a.type,
                    ),
                  )
                  .map((alert, i) => (
                    <Link
                      key={`${alert.type}-${i}`}
                      href={alert.href}
                      className="block rounded-xl border border-slate-200 p-4 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-[#b78929]"
                    >
                      <b className="text-sm">{alert.title}</b>
                      <p className="mt-1 text-xs text-slate-500">
                        {alert.detail}
                      </p>
                      <span className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-semibold">
                        Open current workload{" "}
                        <ChevronRight className="h-3 w-3" />
                      </span>
                    </Link>
                  ))}
                {!pendingAttentionTotal && (
                  <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
                    No current-stay requests or overdue arrivals or departures
                    need attention.
                  </p>
                )}
              </section>
              <section
                className="space-y-3"
                aria-label="Property and availability"
              >
                <h3 className="font-bold">Property &amp; availability</h3>
                <p className="text-xs text-slate-500">
                  Listing and review tasks are current. Availability notices
                  follow {periodLabel}.
                </p>
                {data.alerts
                  .filter(
                    (a) =>
                      !["overdue", "overdue_departures", "requests"].includes(
                        a.type,
                      ),
                  )
                  .map((alert, i) => (
                    <Link
                      key={`${alert.type}-${i}`}
                      href={alert.href}
                      className="block rounded-xl border border-slate-200 p-4 text-sm hover:bg-slate-50"
                    >
                      <b>{alert.title}</b>
                      <p className="mt-1 text-xs text-slate-500">
                        {alert.detail}
                      </p>
                    </Link>
                  ))}
              </section>
            </>
          )}
        </div>
      </Drawer>

      <ReservationWorkspace
        key={`${propertyId}-${bookingId}`}
        bookingId={bookingId}
        propertyId={propertyId}
        onClose={() => setParam("bookingId", null)}
        onChanged={refresh}
      />

      <ManualBookingDialog
        open={manual}
        propertyId={propertyId}
        propertyName={propertyName}
        onClose={() => setManual(false)}
        onCreated={() => {
          setManual(false);
          refresh();
        }}
      />
    </div>
  );
}

function ReservationTable({
  rows,
  loading,
  available,
  timezone,
  onOpen,
  view,
  onSwitchView,
  overdueCount,
}: {
  rows: Row[];
  loading: boolean;
  available: boolean;
  timezone: string;
  onOpen: (id: string) => void;
  view?: View;
  onSwitchView?: (view: View) => void;
  overdueCount?: number;
}) {
  const time = (value?: string) =>
    value
      ? new Intl.DateTimeFormat("en-IN", {
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
          timeZone: timezone,
        }).format(new Date(value))
      : null;

  if (loading || !available) {
    return (
      <p className="p-8 text-sm text-slate-500 text-center">
        {loading
          ? "Loading reservations…"
          : "Reservations unavailable. Retry the dashboard request."}
      </p>
    );
  }

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400 mb-3">
          <BedDouble className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold text-slate-700">
          No reservations in this view.
        </p>
        <p className="mt-1 text-xs text-slate-400 max-w-sm">
          There are no reservations matching this category for the selected
          reporting range or current operational view.
        </p>
        {view === "arrivals" && overdueCount && overdueCount > 0 ? (
          <button
            type="button"
            onClick={() => onSwitchView?.("overdue")}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 transition-colors"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
            <span>Switch to {overdueCount} overdue arrivals</span>
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-left text-xs">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {["Guest / reservation", "Room", "Stay", "Status", "Balance"].map(
              (h) => (
                <th key={h} className="p-4 font-semibold text-slate-600">
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
              <td className="p-4">
                <button
                  type="button"
                  onClick={() => onOpen(row.id)}
                  className="text-left font-bold text-[#061224] hover:text-[#c89b3c] transition-colors underline underline-offset-4"
                >
                  {row.guestName}
                  <span className="mt-1 block font-mono text-[11px] font-normal text-slate-500">
                    {row.confirmationCode}
                  </span>
                </button>
              </td>
              <td className="p-4 font-medium text-slate-800">
                <div className="flex items-center gap-1.5">
                  <BedDouble className="h-3.5 w-3.5 text-slate-400" />
                  <span>{row.roomName}</span>
                </div>
              </td>
              <td className="p-4">
                <p className="font-semibold text-slate-800">
                  {time(row.startAt) || shortDate(row.checkIn)} →{" "}
                  {time(row.endAt) || shortDate(row.checkOut)}
                </p>
                <p className="mt-1 capitalize text-slate-500">
                  {row.bookingMode === "hourly"
                    ? "Hourly stay"
                    : `${row.nights} nights`}{" "}
                  · Pre check-in{" "}
                  {row.preCheckinSubmitted ? "submitted" : "pending"}
                </p>
              </td>
              <td className="p-4">
                <div className="space-y-1">
                  <span
                    className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold capitalize ${
                      row.bookingStatus === "confirmed"
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : row.bookingStatus === "checked_in"
                          ? "bg-blue-50 text-blue-800 border border-blue-200"
                          : row.bookingStatus === "cancelled"
                            ? "bg-rose-50 text-rose-800 border border-rose-200"
                            : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {label(row.bookingStatus)}
                  </span>
                  <p className="text-[11px] capitalize text-slate-500">
                    {label(row.paymentStatus)}
                  </p>
                </div>
              </td>
              <td className="p-4">
                <span
                  className={`font-bold ${row.balanceDuePaise > 0 ? "text-amber-800" : "text-slate-800"}`}
                >
                  {money(row.balanceDuePaise)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
