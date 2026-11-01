"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowDownToLine,
  BedDouble,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { localParts } from "@/lib/booking/domain";
import { formatPaise } from "@/lib/currency";
import type { serializeBooking } from "@/lib/bookings";
import { PartnerShell } from "./partner-shell";
import { ReservationWorkspace } from "./reservation-workspace";
import { PartnerDatePicker } from "./partner-date-picker";
import { pageRange, shiftDay } from "@/lib/partner/date-range";
import { ManualBookingDialog } from "./manual-booking-dialog";
import { PhysicalRoomRegister } from "./reservation-operations";

type Reservation = ReturnType<typeof serializeBooking>;

export type ReservationChoices = {
  roomTypes: { id: string; name: string; status: string }[];
  ratePlans: {
    id: string;
    name: string;
    roomTypeId: string;
    bookingMode: string;
    status: string;
  }[];
};

type Result = ReservationChoices & {
  bookings: Reservation[];
  totalCount: number;
  nextCursor: string | null;
  metrics: Record<string, number>;
  tabCounts: Record<string, number>;
  generatedAt: string;
  timezone: string;
  features: { allocation: boolean; payments: boolean; amendments: boolean };
};

const tabs = [
  ["all", "All"],
  ["arrivals", "Arrivals"],
  ["departures", "Departures"],
  ["in_house", "In house"],
  ["requests", "Guest requests"],
  ["overdue", "Overdue arrivals"],
  ["upcoming", "Upcoming"],
  ["balances", "Balance due"],
  ["pending_payment", "Awaiting payment"],
  ["cancelled", "Cancelled"],
  ["no_show", "No-shows"],
];

const statusOptions = [
  "all",
  "pending_payment",
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
  "expired",
  "payment_failed",
];

const paymentLabels: Record<string, string> = {
  all: "All payment statuses",
  pending: "Pending payment",
  partially_paid: "Partially paid",
  paid: "Paid in full",
  pay_at_property: "Pay at hotel (Cash / Desk)",
  paid_at_property: "Paid at hotel",
  failed: "Payment failed",
  refund_pending: "Refund pending",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
};

const paymentOptions = Object.keys(paymentLabels);

const statusLabels: Record<string, string> = {
  all: "All booking statuses",
  pending_payment: "Awaiting payment",
  confirmed: "Confirmed",
  checked_in: "Checked in (In-house)",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No-show",
  expired: "Expired booking",
  payment_failed: "Payment failed",
};

function formatFriendlyTimezone(tz: string): string {
  if (!tz) return "Hotel local time";
  if (tz.includes("Kolkata")) return "India Time (IST)";
  const city = tz.split("/").pop()?.replaceAll("_", " ") || tz;
  return `Local time (${city})`;
}

const label = (s: string) => s.replaceAll("_", " ");

export const reservationButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#061224] shadow-xs transition-all hover:border-[#c89b3c] hover:bg-[#fbf5e8]/50 active:scale-95 disabled:cursor-wait disabled:opacity-50";

const selectClass =
  "block h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-[#061224] shadow-2xs outline-none transition focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/20";

export function PartnerReservationsPage() {
  return (
    <PartnerShell>
      {({ selectedProperty, reportingDate }) =>
        selectedProperty ? (
          <Reservations
            key={selectedProperty.id}
            propertyId={selectedProperty.id}
            propertyName={selectedProperty.name}
            date={reportingDate}
          />
        ) : (
          <div className="rounded-3xl border border-slate-200/80 bg-white p-8 shadow-xs">
            <h1 className="text-2xl font-bold text-[#061224]">Reservations</h1>
            <p className="mt-2 text-sm text-slate-500">
              Select or add a property to manage reservations.
            </p>
            <a
              href="/partner/onboarding"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#061224] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#061224]/90"
            >
              Add a property
            </a>
          </div>
        )
      }
    </PartnerShell>
  );
}

function Reservations({
  propertyId,
  propertyName,
  date,
}: {
  propertyId: string;
  propertyName: string;
  date: string;
}) {
  const searchParams = useSearchParams(),
    searchString = searchParams.toString();
  const scope =
      searchParams.get("scope") ||
      (["overdue", "overdue_departures"].includes(
        searchParams.get("view") || "",
      )
        ? "all"
        : "range"),
    view = searchParams.get("view") || "all",
    q = searchParams.get("q") || "";
  const dates = pageRange(
    searchParams.get("from"),
    searchParams.get("to"),
    date,
    0,
    scope === "day" ? 0 : 6,
  );
  const selectedId = searchParams.get("bookingId");
  const [manualOpen, setManualOpen] = useState(false),
    [roomsOpen, setRoomsOpen] = useState(false),
    [exporting, setExporting] = useState(false),
    [exportError, setExportError] = useState("");
  const [search, setSearch] = useState(q);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    inputRef = useRef<HTMLInputElement>(null);
  const [previousCursors, setPreviousCursors] = useState<string[]>([]);

  const params = new URLSearchParams(searchString);
  params.set("propertyId", propertyId);
  params.set("date", date);
  params.set("scope", scope);
  if (!params.has("scope") && ["overdue", "overdue_departures"].includes(view))
    params.set("scope", "all");
  if (scope === "range") {
    params.set("from", dates.from);
    params.set("to", dates.to);
  }
  params.delete("bookingId");
  const requestKey = params.toString();

  const query = useQuery({
    queryKey: ["partner", propertyId, "reservations", requestKey],
    queryFn: ({ signal }) =>
      apiFetch<Result>(`/api/partner/bookings?${requestKey}`, { signal }),
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const refetch = query.refetch;
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const update = useCallback(
    (patch: Record<string, string | null>, reset = true) => {
      const next = new URLSearchParams(window.location.search);
      next.set("propertyId", propertyId);
      if (reset) {
        next.delete("cursor");
        setPreviousCursors([]);
      }
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      window.history.pushState(null, "", `${window.location.pathname}?${next}`);
    },
    [propertyId, setPreviousCursors],
  );

  useEffect(() => {
    // Browser back/forward must restore the search text as well as the server query.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearch(q);
  }, [q]);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k" &&
        !(
          event.target instanceof Element &&
          event.target.closest('[role="dialog"]')
        )
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("stay-request-updated", refresh);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("stay-request-updated", refresh);
    };
  }, [refresh]);

  const data = query.data;

  const exportCsv = async () => {
    setExporting(true);
    setExportError("");
    try {
      const filters = new URLSearchParams(requestKey);
      filters.delete("cursor");
      const response = await fetch(`/api/partner/bookings/export?${filters}`);
      if (!response.ok) {
        const body = await response.json();
        throw new Error(
          body.apiError?.message ||
            body.error?.message ||
            body.message ||
            (typeof body.error === "string" ? body.error : "Export failed."),
        );
      }
      const url = URL.createObjectURL(await response.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = `helpkey-reservations-${date}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const select = (key: string, fallback: string) =>
    searchParams.get(key) || fallback;

  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const today = localParts(clock, data?.timezone || "Asia/Kolkata").date;
  const advancedCount = ["status", "bookingMode"].filter(
    (k) => select(k, "all") !== "all",
  ).length;
  const hasActiveFilters = Boolean(
    search ||
      scope === "all" ||
      dates.from !== today ||
      dates.to !== shiftDay(today, 6) ||
      view !== "all" ||
      select("dateBasis", "stay") !== "stay" ||
      searchParams.get("roomTypeId") ||
      select("paymentStatus", "all") !== "all" ||
      advancedCount,
  );

  const reset = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearch("");
    update({
      date: today,
      ...Object.fromEntries(
        [
          "view",
          "scope",
          "dateBasis",
          "from",
          "to",
          "q",
          "status",
          "roomTypeId",
          "paymentStatus",
          "bookingMode",
        ].map((k) => [k, null]),
      ),
    });
  };

  const when = (b: Reservation, start: boolean) => {
    const instant = start ? b.startAt : b.endAt;
    return instant
      ? new Intl.DateTimeFormat("en-IN", {
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
          timeZone: b.timezone,
        }).format(new Date(instant))
      : start
        ? b.checkIn
        : b.checkOut;
  };

  const metricsConfig = [
    {
      id: "arrivals",
      text: "Arrivals",
      sub:
        scope === "range"
          ? "Check-ins in selected range"
          : "Check-ins on selected date",
      icon: LogIn,
      iconColor: "text-emerald-700 bg-emerald-50 border-emerald-200/60",
    },
    {
      id: "departures",
      text: "Departures",
      sub:
        scope === "range"
          ? "Check-outs in selected range"
          : "Check-outs on selected date",
      icon: LogOut,
      iconColor: "text-blue-700 bg-blue-50 border-blue-200/60",
    },
    {
      id: "in_house",
      text: "In-house guests",
      sub:
        scope === "range"
          ? "Checked-in stays overlapping range"
          : "Checked-in stays on selected date",
      icon: BedDouble,
      iconColor: "text-indigo-700 bg-indigo-50 border-indigo-200/60",
    },
    {
      id: "requests",
      text: "Guest requests",
      sub: "Pending guest requests",
      icon: Bell,
      iconColor: "text-amber-700 bg-amber-50 border-amber-200/60",
    },
    {
      id: "overdue",
      text: "Delayed check-ins · now",
      sub: "Confirmed, past check-in time",
      icon: Clock3,
      iconColor: "text-amber-800 bg-amber-100/70 border-amber-300",
    },
  ] as const;

  return (
    <section className="space-y-4 pb-8 text-[#061224]">
      {/* 1. Page Header & Actions Hub */}
      <header className="flex min-w-0 flex-col gap-3 pt-1 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 xl:shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#061224]">
              Reservations
            </h1>
            {data && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700 shadow-2xs">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                {formatFriendlyTimezone(data.timezone)}
              </span>
            )}
          </div>
          <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{propertyName}</span>
            <span className="text-slate-300">•</span>
            <span>
              {scope === "all"
                ? "All dates"
                : scope === "range"
                  ? `${dates.from} – ${dates.to}`
                  : new Intl.DateTimeFormat("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }).format(new Date(`${date}T12:00:00Z`))}
            </span>
          </p>
        </div>

        <div className="grid min-w-0 grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap xl:flex-1 xl:justify-end">
          <button
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#061224] px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#061224]/90 active:scale-95"
            onClick={() => setManualOpen(true)}
          >
            <Plus size={15} />
            New reservation
          </button>

          <div className="col-span-2 flex min-w-0 w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="min-w-0 flex-1 sm:min-w-[260px]">
              <PartnerDatePicker
                displayLabel={scope === "all" ? "Choose dates" : undefined}
                aria-label="Reservation date range"
                range
                value={dates.from}
                endValue={dates.to}
                maxDays={31}
                onChange={() => {}}
                onRangeChange={(from: string, to: string) =>
                  update({ scope: "range", from, to })
                }
                timezone={data?.timezone}
              />
            </div>
            <button
              type="button"
              aria-pressed={scope === "all"}
              className={`shrink-0 rounded-xl border px-3 py-2.5 text-xs font-semibold ${scope === "all" ? "border-[#061224] bg-[#061224] text-white" : "border-slate-200 bg-white text-slate-600"}`}
              onClick={() =>
                update({
                  scope: "all",
                  date: today,
                  from: null,
                  to: null,
                  view: "all",
                })
              }
            >
              All dates
            </button>
          </div>
          <button
            className={reservationButton}
            disabled={query.isFetching}
            onClick={refresh}
            title="Refresh reservations"
          >
            <RefreshCw
              size={15}
              className={`text-slate-500 ${query.isFetching ? "animate-spin text-[#c89b3c]" : ""}`}
            />
            Refresh
          </button>

          <button
            className={reservationButton}
            disabled={exporting || !data}
            onClick={() => void exportCsv()}
          >
            <ArrowDownToLine size={15} className="text-slate-500" />
            {exporting ? "Exporting…" : "Export"}
          </button>
        </div>
      </header>

      {scope === "all" && (
        <p className="text-xs font-semibold text-slate-500">
          Today’s operations · reservation list includes all dates
        </p>
      )}
      {/* 2. Interactive Operational KPI Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {metricsConfig.map(({ id, text, sub, icon: Icon, iconColor }) => {
          const isActive = view === id;
          const count = data?.metrics[id] ?? 0;
          const isOverdueAlert = id === "overdue" && count > 0;

          return (
            <button
              key={id}
              onClick={() =>
                update({
                  view: id,
                  scope:
                    id === "overdue"
                      ? "all"
                      : scope === "range"
                        ? "range"
                        : "day",
                })
              }
              className={`group relative flex flex-col justify-between rounded-2xl border p-3.5 text-left transition-all duration-200 active:scale-[0.98] ${
                id === "overdue" ? "col-span-2 sm:col-span-1" : ""
              } ${
                isActive
                  ? "border-[#061224] bg-white ring-2 ring-[#061224]/10 shadow-sm"
                  : isOverdueAlert
                    ? "border-amber-300 bg-amber-50/40 hover:border-amber-400"
                    : "border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-2xs"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-xs font-semibold text-slate-500 group-hover:text-slate-700">
                  {text}
                </span>
                <div
                  className={`grid h-7 w-7 place-items-center rounded-lg border ${iconColor}`}
                >
                  <Icon size={14} />
                </div>
              </div>

              <div className="mt-2 flex items-baseline gap-2">
                <span
                  className={`text-2xl font-extrabold tracking-tight ${
                    isOverdueAlert
                      ? "text-amber-800"
                      : isActive
                        ? "text-[#061224]"
                        : "text-slate-800"
                  }`}
                >
                  {data ? count : "—"}
                </span>
                {isActive && (
                  <span className="rounded-full bg-[#061224] px-1.5 py-0.5 text-[10px] font-bold text-white">
                    Active
                  </span>
                )}
              </div>

              <span className="mt-1 text-[11px] text-slate-400 font-medium">
                {sub}
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. Streamlined Filter Control Bar */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">
              Quick dates:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {[1, 7, 30].map((days) => {
                const end = new Date(
                  Date.parse(`${today}T12:00Z`) + (days - 1) * 86400000,
                )
                  .toISOString()
                  .slice(0, 10);
                const active =
                  scope !== "all" && dates.from === today && dates.to === end;
                return (
                  <button
                    key={days}
                    aria-pressed={active}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${active ? "bg-[#061224] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                    onClick={() =>
                      update({
                        scope: "range",
                        date: today,
                        from: today,
                        to: end,
                      })
                    }
                  >
                    {days === 1 ? "Today" : `Next ${days} days`}
                  </button>
                );
              })}
            </div>
          </div>

          {hasActiveFilters && (
            <button
              className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:text-rose-800 transition"
              onClick={reset}
            >
              <RotateCcw size={12} />
              Reset filters
            </button>
          )}
        </div>

        <div
          className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${scope === "all" ? "lg:grid-cols-2" : "lg:grid-cols-3"} items-end`}
        >
          {scope !== "all" && (
            <div>
              <label className="text-[11px] font-semibold text-slate-500 mb-1 block">
                Filter by
              </label>
              <select
                aria-label="Filter by"
                className={selectClass}
                value={select("dateBasis", "stay")}
                onChange={(e) => update({ dateBasis: e.target.value })}
              >
                <option value="stay">Stay dates</option>
                <option value="arrival">Arrival date</option>
                <option value="departure">Departure date</option>
              </select>
            </div>
          )}

          <div>
            <label className="text-[11px] font-semibold text-slate-500 mb-1 block">
              Room type
            </label>
            <select
              aria-label="Room type"
              className={selectClass}
              value={select("roomTypeId", "")}
              onChange={(e) => update({ roomTypeId: e.target.value })}
            >
              <option value="">All room types</option>
              {data?.roomTypes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-500 mb-1 block">
              Payment status
            </label>
            <select
              aria-label="Payment status"
              className={selectClass}
              value={select("paymentStatus", "all")}
              onChange={(e) => update({ paymentStatus: e.target.value })}
            >
              {paymentOptions.map((s) => (
                <option key={s} value={s}>
                  {paymentLabels[s] || label(s)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <details className="group pt-1 text-xs">
          <summary className="flex cursor-pointer items-center gap-1.5 font-semibold text-slate-600 hover:text-[#061224] select-none">
            <Filter size={13} className="text-slate-400" />
            <span>
              More filters{advancedCount ? ` (${advancedCount})` : ""}
            </span>
          </summary>
          <div className="mt-2.5 flex flex-wrap gap-3 pt-2 border-t border-slate-100">
            <label className="min-w-40 text-[11px] font-semibold text-slate-500">
              Booking status
              <select
                aria-label="Booking status"
                className={selectClass}
                value={select("status", "all")}
                onChange={(e) => update({ status: e.target.value })}
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {statusLabels[s] || label(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-40 text-[11px] font-semibold text-slate-500">
              Stay type
              <select
                aria-label="Stay type"
                className={selectClass}
                value={select("bookingMode", "all")}
                onChange={(e) => update({ bookingMode: e.target.value })}
              >
                <option value="all">All stay types</option>
                <option value="overnight">Overnight stay</option>
                <option value="hourly">Hourly / Day-use stay</option>
              </select>
            </label>
          </div>
        </details>
      </div>

      {/* 4. Reservations Workspace Card (Search, Tabs & Table) */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        {/* Search & Tabs Top Header */}
        <div className="border-b border-slate-200/80 p-4 space-y-3">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3.5 top-3.5 text-slate-400"
            />
            <input
              ref={inputRef}
              aria-label="Search reservations"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-20 text-xs font-medium text-[#061224] outline-none transition focus:border-[#c89b3c] focus:bg-white focus:ring-2 focus:ring-[#c89b3c]/20"
              placeholder="Guest name, phone, email or booking reference…"
              value={search}
              onChange={(e) => {
                const value = e.target.value;
                setSearch(value);
                if (searchTimer.current) clearTimeout(searchTimer.current);
                searchTimer.current = setTimeout(
                  () => update({ q: value }),
                  300,
                );
              }}
            />
            <div className="absolute right-3 top-3 flex items-center gap-1.5">
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearch("");
                    update({ q: "" });
                  }}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
              <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                ⌘K
              </kbd>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 font-medium">
            Search by guest name, mobile number, email, or booking ID.
          </p>

          <nav
            aria-label="Reservation views"
            className="flex gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar"
          >
            {tabs.map(([id, text]) => {
              const isSelected = view === id;
              const count = data?.tabCounts[id];
              return (
                <button
                  key={id}
                  aria-pressed={isSelected}
                  onClick={() =>
                    update({
                      view: id,
                      ...(id === "upcoming" ? { scope: "all" } : {}),
                    })
                  }
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                    isSelected
                      ? "bg-[#061224] text-white shadow-2xs"
                      : "border border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span>{text}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {count ?? "—"}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Error Notification */}
        {(query.isError || exportError) && (
          <div
            role="alert"
            className="m-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50/80 p-3.5 text-xs font-medium text-red-800"
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-red-600 shrink-0" />
              <span>{exportError || query.error?.message}</span>
            </div>
            <button
              className="ml-3 font-bold underline hover:text-red-900"
              onClick={() => {
                setExportError("");
                refresh();
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Content State */}
        {query.isPending ? (
          <div role="status" className="space-y-3 p-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <RefreshCw size={14} className="animate-spin text-[#c89b3c]" />
              <span>Loading reservations…</span>
            </div>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-xl bg-slate-100"
              />
            ))}
          </div>
        ) : data?.bookings.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
              <CalendarDays size={24} />
            </div>
            <h2 className="mt-3 text-sm font-bold text-slate-800">
              No reservations match this view
            </h2>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              Try adjusting the date range, switching views, or clearing active
              filters.
            </p>
            <button className={reservationButton + " mt-4"} onClick={reset}>
              Clear filters
            </button>
          </div>
        ) : (
          data && (
            <>
              {/* Desktop High-Density Table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Guest &amp; Booking ID</th>
                      <th className="px-4 py-3">Stay &amp; Dates</th>
                      <th className="px-4 py-3">Room &amp; Assigned Unit</th>
                      <th className="px-4 py-3">Payment &amp; Balance</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {data.bookings.map((b) => (
                      <tr
                        key={b.id}
                        className="transition-colors hover:bg-[#fbf5e8]/40"
                      >
                        {/* Guest Column */}
                        <td className="px-4 py-3.5">
                          <button
                            onClick={() => update({ bookingId: b.id }, false)}
                            className="text-left font-bold text-[#061224] hover:text-[#c89b3c] transition-colors"
                          >
                            {b.leadGuest?.name || "Guest"}
                          </button>
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60">
                              {b.confirmationCode || b.id}
                            </span>
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                              {b.source === "manual_partner"
                                ? "Front Desk"
                                : "Helpkey Online"}
                            </span>
                          </div>
                        </td>

                        {/* Stay Column */}
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-slate-800">
                            {when(b, true)}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            to {when(b, false)} ·{" "}
                            <span className="font-semibold text-slate-700">
                              {b.bookingMode === "hourly"
                                ? `${b.billedHours} hr${b.billedHours === 1 ? "" : "s"}`
                                : `${b.nights} night${b.nights === 1 ? "" : "s"}`}
                            </span>
                          </p>
                        </td>

                        {/* Room Column */}
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-slate-800">
                            {b.roomName}
                          </p>
                          <div className="mt-1">
                            {b.physicalUnitLabel ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200/60">
                                <CheckCircle2 size={11} />
                                Room {b.physicalUnitLabel}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200/60">
                                <AlertCircle size={11} />
                                Room not assigned
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Payment Column */}
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-slate-900">
                            {formatPaise(b.totalPaise)}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {paymentLabels[b.paymentStatus] ||
                              label(b.paymentStatus)}
                          </p>
                          {b.balanceDuePaise > 0 && (
                            <p className="mt-0.5 text-[11px] font-bold text-amber-700">
                              {formatPaise(b.balanceDuePaise)} balance due
                            </p>
                          )}
                        </td>

                        {/* Status Column */}
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${
                              b.bookingStatus === "confirmed"
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : b.bookingStatus === "checked_in"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : b.bookingStatus === "checked_out"
                                    ? "bg-slate-100 text-slate-600"
                                    : b.bookingStatus === "cancelled"
                                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                                      : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}
                          >
                            {statusLabels[b.bookingStatus] ||
                              label(b.bookingStatus)}
                          </span>
                        </td>

                        {/* Actions Column */}
                        <td className="px-4 py-3.5 text-right">
                          <button
                            className={reservationButton}
                            onClick={() => update({ bookingId: b.id }, false)}
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List */}
              <div className="divide-y divide-slate-100 md:hidden">
                {data.bookings.map((b) => (
                  <article key={b.id} className="space-y-2.5 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="font-bold text-sm text-[#061224]">
                          {b.leadGuest?.name || "Guest"}
                        </h2>
                        <span className="font-mono text-[11px] text-slate-500">
                          {b.confirmationCode}
                        </span>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold capitalize text-slate-700">
                        {statusLabels[b.bookingStatus] ||
                          label(b.bookingStatus)}
                      </span>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-2.5 text-xs space-y-1">
                      <p className="font-semibold text-slate-800">
                        {b.roomName} ·{" "}
                        {b.physicalUnitLabel
                          ? `Room ${b.physicalUnitLabel}`
                          : "Room not assigned"}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {when(b, true)} → {when(b, false)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div>
                        <span className="text-xs font-bold text-slate-800">
                          {formatPaise(b.totalPaise)}
                        </span>
                        {b.balanceDuePaise > 0 && (
                          <span className="ml-2 text-[11px] font-bold text-amber-700">
                            {formatPaise(b.balanceDuePaise)} balance due
                          </span>
                        )}
                      </div>
                      <button
                        className={reservationButton}
                        onClick={() => update({ bookingId: b.id }, false)}
                      >
                        Manage
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )
        )}

        {/* 5. Pagination & Live Update Status Footer */}
        {data && (
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 px-4 py-3 text-xs text-slate-500 bg-slate-50/50">
            <span>
              <strong className="text-slate-800">{data.totalCount}</strong>{" "}
              reservations found · Updated{" "}
              {new Date(data.generatedAt).toLocaleTimeString("en-IN", {
                hour: "numeric",
                minute: "2-digit",
              })}
              {query.isFetching
                ? " · Refreshing…"
                : " · Auto-refreshes every minute"}
            </span>

            <div className="flex items-center gap-2">
              <button
                aria-label="Previous page"
                className={reservationButton}
                disabled={!searchParams.get("cursor")}
                onClick={() => {
                  const previous = [...previousCursors];
                  const cursor = previous.pop();
                  setPreviousCursors(previous);
                  update({ cursor: cursor || null }, false);
                }}
              >
                <ChevronLeft size={14} />
                Previous
              </button>
              <button
                aria-label="Next page"
                className={reservationButton}
                disabled={!data.nextCursor}
                onClick={() => {
                  setPreviousCursors((v) => [
                    ...v,
                    searchParams.get("cursor") || "",
                  ]);
                  update({ cursor: data.nextCursor }, false);
                }}
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </footer>
        )}
      </div>

      {/* Side Workspace Drawer */}
      <ReservationWorkspace
        key={`${propertyId}/${selectedId || "closed"}`}
        bookingId={selectedId}
        propertyId={propertyId}
        onChanged={refresh}
        onClose={() => update({ bookingId: null }, false)}
      />

      {/* Manual Booking Dialog */}
      {manualOpen && (
        <ManualBookingDialog
          open
          propertyId={propertyId}
          propertyName={propertyName}
          onClose={() => {
            setManualOpen(false);
            refresh();
          }}
          onCreated={(id) => {
            setManualOpen(false);
            refresh();
            if (id) update({ bookingId: id }, false);
          }}
        />
      )}

      {/* Physical Room Register Modal */}
      {roomsOpen && data && (
        <PhysicalRoomRegister
          propertyId={propertyId}
          rooms={data.roomTypes}
          onClose={() => setRoomsOpen(false)}
        />
      )}
    </section>
  );
}
