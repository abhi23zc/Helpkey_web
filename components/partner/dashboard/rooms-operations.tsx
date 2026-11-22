"use client";
import { PartnerDatePicker } from "./partner-date-picker";
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { requestJson } from "@/lib/partner/upload-client";
import { formatPaise } from "@/lib/currency";
import { DurationPriceEditor } from "@/components/partner/duration-price-editor";
import type { DurationPrice } from "@/lib/booking/duration-pricing";
import type { ListingRoomType, ListingRatePlan } from "./use-property-listing";
import { PhysicalRoomRegister } from "./reservation-operations";
import { Drawer } from "./drawer";
import {
  AlertCircle,
  ArrowUpDown,
  BedDouble,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  DoorClosed,
  Layers,
  Loader2,
  Moon,
  Plus,
  Search,
  Wrench,
  X,
} from "lucide-react";
export type RoomsWorkspace = {
  features: { calendar: boolean; housekeeping: boolean };
  interval: boolean;
  timezone: string;
  dates: string[];
  calendars: {
    id: string;
    reserved?: Record<string, number> | number;
    blocked?: Record<string, number>;
    stopSell?: boolean;
  }[];
  prices: {
    ratePlanId: string;
    date: string;
    basePricePaise?: number;
    durationPrices?: DurationPrice[];
  }[];
  units: {
    id: string;
    label: string;
    roomTypeId: string;
    floor?: number | string;
    status: string;
    occupied: boolean;
    bookingId?: string | null;
    housekeepingStatus?: string;
    housekeepingNote?: string;
    revision: number;
    housekeepingUpdatedAt?: string;
    currentStay?: {
      bookingId: string;
      guestName: string;
      guestPhone?: string;
      guestEmail?: string;
      checkIn: string;
      checkOut: string;
      startAt: string;
      endAt: string;
      confirmationCode: string;
      bookingStatus: string;
      totalPaise: number;
      paidPaise: number;
      balanceDuePaise: number;
      guestCount: number;
      source?: string;
    } | null;
    upcomingStay?: {
      bookingId: string;
      guestName: string;
      guestPhone?: string;
      guestEmail?: string;
      checkIn: string;
      checkOut: string;
      startAt: string;
      endAt: string;
      confirmationCode: string;
      bookingStatus: string;
      totalPaise: number;
      paidPaise: number;
      balanceDuePaise: number;
      guestCount: number;
      source?: string;
    } | null;
  }[];
  blocks: {
    id: string;
    unitId?: string;
    roomTypeId: string;
    reason: string;
    startAt: string;
    endAt: string;
    quantity: number;
  }[];
};
const inputClass =
  "w-full min-w-0 h-9 rounded-xl border border-slate-200/90 bg-white px-3 text-[13px] font-medium text-[#061224] outline-none transition-colors focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/15";
const button =
  "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3.5 text-[13px] font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 hover:text-[#061224] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer whitespace-nowrap";
const primary =
  "inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-[#061224] px-4 text-[13px] font-semibold text-white shadow-xs hover:bg-[#0c1f3b] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer whitespace-nowrap";
export const shiftDate = (date: string, amount: number) =>
  new Date(Date.parse(`${date}T00:00Z`) + amount * 86400000)
    .toISOString()
    .slice(0, 10);
export function useRoomsWorkspace(propertyId: string, start: string, end = shiftDate(start, 6)) {
  return useQuery<RoomsWorkspace>({
    queryKey: ["partner", propertyId, "rooms-workspace", start, end],
    queryFn: async ({ signal }) => {
      const r = await fetch(
        `/api/partner/properties/${propertyId}/rooms-workspace?${new URLSearchParams({ start, end })}`,
        { cache: "no-store", signal },
      );
      const body = await r.json();
      if (!r.ok)
        throw new Error(
          body.error?.message ||
            body.message ||
            (typeof body.error === "string"
              ? body.error
              : "Unable to load rooms."),
        );
      return body;
    },
    enabled: !!propertyId && !!start,
    refetchInterval: 30000,
  });
}
export function RoomsOperations({
  propertyId,
  rooms,
  rates,
  start,
  data,
  refresh,
  mode,
}: {
  propertyId: string;
  rooms: ListingRoomType[];
  rates: ListingRatePlan[];
  start: string;
  data: RoomsWorkspace;
  refresh: () => Promise<unknown>;
  mode: "calendar" | "housekeeping";
}) {
  const findDefaultRate = (targetRoomId: string) => {
    const matches = rates.filter((r) => r.roomTypeId === targetRoomId);
    return (
      matches.find((r) => r.bookingMode !== "hourly" && r.status === "active") ||
      matches.find((r) => r.bookingMode !== "hourly") ||
      matches[0]
    );
  };
  const [roomId, setRoomId] = useState(rooms[0]?.id || ""),
    [rateId, setRateId] = useState(() => findDefaultRate(rooms[0]?.id || "")?.id || "");
  const [from, setFrom] = useState(start),
    [to, setTo] = useState(data.dates.at(-1) || start),
    [price, setPrice] = useState(""),
    [durationPrices, setDurationPrices] = useState<DurationPrice[]>(
      () => findDefaultRate(rooms[0]?.id || "")?.durationPrices || [],
    );
  const bulkFormRef = useRef<HTMLFormElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const [operation, setOperation] = useState("price"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState<{
      previewId: string;
      cells: {
        roomTypeId: string;
        ratePlanId?: string;
        date: string;
        stopSell?: boolean;
        clearPrice?: boolean;
        basePricePaise?: number;
        durationPrices?: DurationPrice[];
      }[];
    } | null>(null);
  const [register, setRegister] = useState(false),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [hkRoomType, setHkRoomType] = useState("all"),
    [hkFloor, setHkFloor] = useState("all"),
    [hkSort, setHkSort] = useState<"room" | "priority">("room"),
    [quickCleaningId, setQuickCleaningId] = useState<string | null>(null);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false),
    [maintenanceUnit, setMaintenanceUnit] = useState(""),
    [reason, setReason] = useState(""),
    [quantity, setQuantity] = useState(1);
  const [editingUnit, setEditingUnit] = useState<
      RoomsWorkspace["units"][number] | null
    >(null),
    [houseStatus, setHouseStatus] = useState("clean"),
    [note, setNote] = useState("");
  const [maintenanceKey, setMaintenanceKey] = useState("");
  const history = useQuery<{
    events: { id: string; status: string; note?: string; createdAt?: string }[];
  }>({
    queryKey: ["partner", propertyId, "room-history", editingUnit?.id],
    enabled: !!editingUnit,
    queryFn: async ({ signal }) => {
      const r = await fetch(
        `/api/partner/properties/${propertyId}/rooms-workspace?unitId=${editingUnit?.id}`,
        { signal, cache: "no-store" },
      );
      const b = await r.json();
      if (!r.ok) throw new Error("Unable to load cleaning history.");
      return b;
    },
  });
  const getUnitFloor = (label: string, explicitFloor?: number | string) => {
    if (
      explicitFloor !== undefined &&
      explicitFloor !== null &&
      explicitFloor !== ""
    ) {
      return typeof explicitFloor === "number"
        ? `Floor ${explicitFloor}`
        : String(explicitFloor);
    }
    const clean = label.trim();
    if (/^G-?\d+/i.test(clean)) return "Ground Floor";
    if (/^B-?\d+/i.test(clean)) return "Basement";
    const match = clean.match(/^(\d+)/);
    if (match) {
      const num = match[1];
      return num.length >= 3 ? `Floor ${num.slice(0, -2)}` : `Floor ${num[0]}`;
    }
    return "Main Level";
  };
  const activeUnits = useMemo(
    () => data.units.filter((u) => u.status === "active"),
    [data.units],
  );
  const maintenanceUnitIds = useMemo(
    () => new Set(data.blocks.map((b) => b.unitId).filter(Boolean) as string[]),
    [data.blocks],
  );
  const availableFloors = useMemo(() => {
    const floors = new Set<string>();
    activeUnits.forEach((u) => floors.add(getUnitFloor(u.label, u.floor)));
    return Array.from(floors).sort((a, b) => {
      if (a === "Basement") return -1;
      if (b === "Basement") return 1;
      if (a === "Ground Floor") return -1;
      if (b === "Ground Floor") return 1;
      const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
      return numA - numB || a.localeCompare(b);
    });
  }, [activeUnits]);
  const hkStats = useMemo(() => {
    let clean = 0;
    let dirty = 0;
    let occupied = 0;
    let unknown = 0;
    for (const u of activeUnits) {
      if (u.occupied) occupied += 1;
      if (
        u.housekeepingStatus === "clean" ||
        u.housekeepingStatus === "inspected"
      ) {
        clean += 1;
      } else if (u.housekeepingStatus === "dirty") {
        dirty += 1;
      } else {
        unknown += 1;
      }
    }
    return { total: activeUnits.length, clean, dirty, occupied, unknown };
  }, [activeUnits]);
  const filteredHousekeepingUnits = useMemo(() => {
    const q = search.trim().toLowerCase();
    const statusPriority = (status?: string) => {
      if (status === "dirty") return 0;
      if (!status || status === "unknown") return 1;
      if (status === "clean") return 2;
      return 3;
    };
    return activeUnits
      .filter((u) => {
        if (q && !u.label.toLowerCase().includes(q)) return false;
        if (hkRoomType !== "all" && u.roomTypeId !== hkRoomType) return false;
        if (
          hkFloor !== "all" &&
          getUnitFloor(u.label, u.floor) !== hkFloor
        ) {
          return false;
        }
        if (filter === "all") return true;
        if (filter === "occupied") return u.occupied;
        if (filter === "maintenance") return maintenanceUnitIds.has(u.id);
        if (filter === "clean") {
          return (
            u.housekeepingStatus === "clean" ||
            u.housekeepingStatus === "inspected"
          );
        }
        return filter === (u.housekeepingStatus || "unknown");
      })
      .sort((a, b) => {
        if (hkSort === "priority") {
          const diff =
            statusPriority(a.housekeepingStatus) -
            statusPriority(b.housekeepingStatus);
          if (diff !== 0) return diff;
        }
        return a.label.localeCompare(b.label, undefined, { numeric: true });
      });
  }, [
    activeUnits,
    search,
    hkRoomType,
    hkFloor,
    filter,
    hkSort,
    maintenanceUnitIds,
  ]);
  const hasActiveHkFilters =
    filter !== "all" ||
    hkRoomType !== "all" ||
    hkFloor !== "all" ||
    search.trim() !== "";
  const resetHkFilters = () => {
    setFilter("all");
    setHkRoomType("all");
    setHkFloor("all");
    setSearch("");
  };
  const selectedRate = rates.find((r) => r.id === rateId),
    room = rooms.find((r) => r.id === roomId);
  const todayIso = (() => {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: data.timezone || "Asia/Kolkata",
      }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  })();
  const parsedDayCount =
    from && to
      ? Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1
      : 0;
  const selectedDayCount =
    Number.isFinite(parsedDayCount) && parsedDayCount > 0 ? parsedDayCount : 0;
  const basePriceRupees =
    selectedRate && selectedRate.bookingMode !== "hourly"
      ? selectedRate.basePricePaise / 100
      : null;
  const enteredPriceNum = Number(price);
  const priceDeltaPct =
    basePriceRupees &&
    basePriceRupees > 0 &&
    price.trim() !== "" &&
    Number.isFinite(enteredPriceNum) &&
    enteredPriceNum > 0
      ? Math.round(((enteredPriceNum - basePriceRupees) / basePriceRupees) * 100)
      : null;
  const handleSelectCalendarTarget = (
    targetDate: string,
    targetRate?: ListingRatePlan,
  ) => {
    setFrom(targetDate);
    setTo(targetDate);
    if (targetRate) {
      setOperation("price");
      setRateId(targetRate.id);
      const override = data.prices.find(
        (p) => p.ratePlanId === targetRate.id && p.date === targetDate,
      );
      if (targetRate.bookingMode === "hourly") {
        setDurationPrices(
          override?.durationPrices || targetRate.durationPrices || [],
        );
      } else {
        const effectivePaise =
          override?.basePricePaise ?? targetRate.basePricePaise;
        setPrice(String(effectivePaise / 100));
      }
    }
    bulkFormRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
    if (!targetRate || targetRate.bookingMode !== "hourly") {
      window.setTimeout(() => {
        priceInputRef.current?.focus();
        priceInputRef.current?.select();
      }, 180);
    }
  };
  const call = (action: string, input: unknown) =>
    requestJson(`/api/partner/properties/${propertyId}/rooms-workspace`, {
      action,
      input,
    });
  const perform = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage("");
    try {
      await work();
      await refresh();
      setMessage(success);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  };
  const handleQuickMarkClean = async (
    unit: RoomsWorkspace["units"][number],
  ) => {
    setQuickCleaningId(unit.id);
    setMessage("");
    try {
      await call("housekeeping", {
        unitId: unit.id,
        revision: unit.revision,
        status: "clean",
        note: unit.housekeepingNote || "",
      });
      await refresh();
      setMessage(`Room ${unit.label} marked clean.`);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Unable to update cleaning status.",
      );
    } finally {
      setQuickCleaningId(null);
    }
  };
  const priceContext = useQuery({ queryKey: ["price-context", propertyId], queryFn: () => apiFetch<{ basis: "tax_exclusive" | "tax_inclusive" }>(`/api/partner/properties/${propertyId}/price-context`) });
  const previewBulk = () =>
    perform(async () => {
      const count = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
      if (!Number.isInteger(count) || count < 1 || count > 31)
        throw new Error("Select a range of 1–31 days.");
      if (operation.includes("price") && !selectedRate)
        throw new Error("Select a rate plan.");
      if (operation.includes("price") && !priceContext.data) throw new Error("Load current price basis before reviewing date prices.");
      const cells = Array.from({ length: count }, (_, i) => ({
        roomTypeId: roomId,
        date: shiftDate(from, i),
        ...(operation === "stop" || operation === "open"
          ? { stopSell: operation === "stop" }
          : {
              ratePlanId: rateId,
              priceEntryBasis: priceContext.data?.basis,
              ...(operation === "clear-price"
                ? { clearPrice: true }
                : selectedRate?.bookingMode === "hourly"
                  ? { durationPrices }
                  : { basePricePaise: Math.round(Number(price) * 100) }),
            }),
      }));
      const result = await call("bulk", {
        action: "preview",
        input: { cells },
      });
      setPreview(
        result as {
          previewId: string;
          cells: {
            roomTypeId: string;
            ratePlanId?: string;
            date: string;
            stopSell?: boolean;
            clearPrice?: boolean;
            basePricePaise?: number;
            durationPrices?: DurationPrice[];
          }[];
        },
      );
    }, `Review date prices ${priceContext.data?.basis === "tax_inclusive" ? "including tax" : "before tax"} before confirming.`);
  const prettyPrice = (rate: ListingRatePlan, date: string) => {
    const override = data.prices.find(
      (p) => p.ratePlanId === rate.id && p.date === date,
    );
    return rate.bookingMode === "hourly"
      ? (override?.durationPrices || rate.durationPrices || [])
          .map((p) => `${p.hours}h ${formatPaise(p.pricePaise)}`)
          .join(" · ")
      : formatPaise(override?.basePricePaise ?? rate.basePricePaise);
  };
  function parseDateHeader(dateStr: string) {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    const dayOfWeek = dateObj.toLocaleDateString("en-US", {
      weekday: "short",
      timeZone: "UTC",
    });
    const monthName = dateObj.toLocaleDateString("en-US", {
      month: "short",
      timeZone: "UTC",
    });
    const dayNum = String(d).padStart(2, "0");
    const isWeekend = dateObj.getUTCDay() === 0 || dateObj.getUTCDay() === 6;
    return { dayOfWeek, monthName, dayNum, isWeekend };
  } catch {
    return {
      dayOfWeek: "",
      monthName: "",
      dayNum: dateStr.slice(5),
      isWeekend: false,
    };
  }
}

  return (
    <div className="space-y-4">
      {mode === "housekeeping" && !data.features.housekeeping && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200/80 p-3.5 text-sm font-medium text-amber-900">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>Housekeeping updates are not enabled for this environment.</span>
        </div>
      )}
      {message && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm font-medium text-amber-900 shadow-xs"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>{message}</span>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-xl font-bold tracking-[-0.02em] text-[#061224]">
            {mode === "calendar"
              ? "Availability & rates"
              : "Housekeeping & room register"}
          </h2>
          <span className="rounded-full border border-slate-200/70 bg-white px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
            {mode === "calendar"
              ? `${data.dates.length} days`
              : `${activeUnits.length} units`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={button}
            onClick={() => {
              setMaintenanceUnit("");
              setMaintenanceKey(crypto.randomUUID());
              setMaintenanceOpen(true);
            }}
          >
            <Wrench className="h-4 w-4 text-slate-500" />
            Block rooms for maintenance
          </button>
          <button
            type="button"
            className={button}
            onClick={() => setRegister(true)}
          >
            <Layers className="h-4 w-4 text-slate-500" />
            Manage room numbers
          </button>
        </div>
      </div>
      {mode === "calendar" ? (
        <>
          <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden mb-6">
            {/* Control & Legend Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 p-4 sm:px-5 sm:py-4 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 border border-slate-200/80 text-slate-700 shadow-2xs shrink-0">
                  <BedDouble className="h-5 w-5 text-slate-600" />
                </div>
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-slate-400 shrink-0">
                    Room type
                  </span>
                  <select
                    aria-label="Select room type"
                    className="h-9 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white px-3 text-sm font-bold text-[#061224] outline-none hover:border-slate-300 focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/15 transition-all cursor-pointer shadow-2xs"
                    value={roomId}
                    onChange={(e) => {
                      const nextRoomId = e.target.value;
                      const nextDefault = findDefaultRate(nextRoomId);
                      setRoomId(nextRoomId);
                      setRateId(nextDefault?.id || "");
                      setDurationPrices(nextDefault?.durationPrices || []);
                      setPrice("");
                    }}
                  >
                    {rooms.map((r) => (
                      <option value={r.id} key={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status and Overrides Info */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  title="Indicates rates manually adjusted for a specific date"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50/90 border border-amber-200/80 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-2xs"
                >
                  <span className="text-[#c89b3c] font-bold text-xs">★</span>
                  <span>Date rate override</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-1.5 text-xs font-semibold text-slate-700 tabular-nums">
                  <span className="h-2 w-2 rounded-full bg-emerald-500/80" />
                  <span>
                    {room?.inventory || 0} units in {room?.name || "room type"}
                  </span>
                </span>
              </div>
            </div>

            {!data.interval && (
              <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 text-xs text-amber-800 font-medium">
                This property uses legacy nightly inventory. Time-based maintenance and stop-sell controls require availability setup by Helpkey.
              </div>
            )}

            {/* Responsive Auto-Fill & Scrollable Matrix Table */}
            <div
              className="overflow-x-auto relative border-t border-slate-100"
              tabIndex={0}
            >
              <table
                className="w-full border-collapse text-xs table-fixed"
                style={{
                  minWidth: `${210 + data.dates.length * 116}px`,
                }}
              >
                <colgroup>
                  <col className="w-[176px] sm:w-[228px]" />
                  {data.dates.map((d) => (
                    <col key={d} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="sticky left-0 z-20 bg-slate-50 px-3.5 py-3.5 sm:px-5 sm:py-4 text-left border-r border-slate-200 shadow-[3px_0_6px_-2px_rgba(0,0,0,0.08)]">
                      <div className="flex items-center gap-2.5">
                        <div className="hidden sm:flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50/80 border border-amber-200/60 text-[#c89b3c] shrink-0">
                          <CalendarDays className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <span className="block text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400 truncate">
                            Calendar Metrics
                          </span>
                          <span className="block text-[13px] sm:text-sm font-bold tracking-[-0.01em] text-[#061224] mt-0.5 truncate">
                            Availability &amp; Rates
                          </span>
                        </div>
                      </div>
                    </th>
                    {data.dates.map((d) => {
                      const { dayOfWeek, monthName, dayNum, isWeekend } =
                        parseDateHeader(d);
                      const isInSelectedRange = Boolean(
                        from && to && d >= from && d <= to,
                      );
                      const isToday = d === todayIso;
                      return (
                        <th
                          key={d}
                          className={`p-0 text-center font-medium border-r whitespace-nowrap transition-colors ${
                            isWeekend
                              ? "bg-[#fdf6e7] border-r-amber-200/50"
                              : "bg-slate-50/70 border-r-slate-100"
                          } ${
                            isInSelectedRange
                              ? "shadow-[inset_0_2.5px_0_0_#c89b3c]"
                              : ""
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectCalendarTarget(d)}
                            title={`Select ${dayNum} ${monthName} in bulk editor`}
                            className="w-full py-3 px-2 text-center hover:bg-amber-100/40 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#c89b3c] transition-colors cursor-pointer"
                          >
                            <span
                              className={`flex items-center justify-center gap-1 text-[10px] sm:text-[11px] uppercase font-semibold tracking-[0.06em] ${
                                isWeekend ? "text-amber-700" : "text-slate-400"
                              }`}
                            >
                              <span>{dayOfWeek}</span>
                              {isToday && (
                                <span
                                  aria-label="Today"
                                  className="h-1.5 w-1.5 rounded-full bg-[#c89b3c]"
                                />
                              )}
                            </span>
                            <span
                              className={`block text-[13px] font-bold tabular-nums mt-0.5 ${
                                isWeekend ? "text-amber-950" : "text-[#061224]"
                              }`}
                            >
                              {dayNum} {monthName}
                            </span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* Remaining Capacity Row */}
                  <tr className="hover:bg-slate-50/30 transition-colors">
                    <th className="sticky left-0 z-10 bg-white px-3.5 py-4 sm:px-5 sm:py-4.5 text-left border-r border-slate-200 shadow-[3px_0_6px_-2px_rgba(0,0,0,0.08)] align-middle">
                      <div className="flex items-center gap-2.5 sm:gap-3">
                        <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-200/80 text-slate-600 shrink-0 shadow-2xs">
                          <Layers className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0">
                          <span className="block text-[13px] sm:text-sm font-bold text-[#061224] leading-tight truncate">
                            Remaining capacity
                          </span>
                          <span className="block text-[11px] sm:text-xs font-normal text-slate-400 mt-0.5 truncate">
                            Available inventory
                          </span>
                        </div>
                      </div>
                    </th>
                    {data.dates.map((d) => {
                      const { isWeekend } = parseDateHeader(d);
                      const isInSelectedRange = Boolean(
                        from && to && d >= from && d <= to,
                      );
                      const c = data.calendars.find(
                        (c) => c.id === `${propertyId}_${roomId}_${d}`,
                      );
                      const values =
                        typeof c?.reserved === "object" ? c.reserved : {};
                      const keys = new Set([
                        ...Object.keys(values),
                        ...Object.keys(c?.blocked || {}),
                      ]);
                      const remaining = Math.max(
                        0,
                        (room?.inventory || 0) -
                          (data.interval
                            ? Math.max(
                                0,
                                ...[...keys].map(
                                  (k) =>
                                    (values[k] || 0) + (c?.blocked?.[k] || 0),
                                ),
                              )
                            : Number(c?.reserved || 0)),
                      );
                      return (
                        <td
                          key={d}
                          className={`py-4 px-2 text-center align-middle border-r transition-colors ${
                            isWeekend
                              ? "bg-[#fefcf6] border-r-amber-200/45"
                              : "border-r-slate-100"
                          } ${isInSelectedRange ? "bg-amber-50/25" : ""}`}
                        >
                          {c?.stopSell ? (
                            <span className="inline-flex items-center justify-center rounded-xl px-2.5 py-1 text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              Closed
                            </span>
                          ) : remaining === 0 ? (
                            <span className="inline-flex items-center justify-center rounded-xl px-2.5 py-1 text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              0 left
                            </span>
                          ) : remaining <= 3 ? (
                            <div className="inline-flex flex-col items-center justify-center rounded-xl px-3 py-1 bg-amber-50 border border-amber-200 text-amber-900 shadow-2xs tabular-nums">
                              <span className="text-sm font-bold leading-tight">
                                {remaining}
                              </span>
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mt-0.5">
                                Low
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center tabular-nums">
                              <span className="font-bold text-sm sm:text-[15px] text-[#061224] leading-tight">
                                {remaining}
                              </span>
                              <span className="text-[11px] text-slate-400 font-medium mt-0.5">
                                units left
                              </span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Rate Plans Rows */}
                  {rates
                    .filter((r) => r.roomTypeId === roomId)
                    .map((r) => (
                      <tr
                        key={r.id}
                        className="hover:bg-slate-50/30 transition-colors"
                      >
                        <th className="sticky left-0 z-10 bg-white px-3.5 py-4 sm:px-5 sm:py-4.5 text-left border-r border-slate-200 shadow-[3px_0_6px_-2px_rgba(0,0,0,0.08)] align-middle">
                          <div className="flex items-center gap-2.5 sm:gap-3">
                            <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-200/80 text-slate-600 shrink-0 shadow-2xs">
                              {r.bookingMode === "hourly" ? (
                                <Clock3 className="h-4.5 w-4.5" />
                              ) : (
                                <Moon className="h-4.5 w-4.5" />
                              )}
                            </div>
                            <div className="min-w-0 pr-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-[13px] sm:text-sm text-[#061224] leading-tight truncate">
                                  {r.name}
                                </span>
                                {r.status !== "active" && (
                                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 uppercase shrink-0">
                                    Paused
                                  </span>
                                )}
                              </div>
                              <span className="block text-[11px] sm:text-xs font-normal text-slate-400 mt-0.5 truncate">
                                {r.bookingMode === "hourly"
                                  ? "Hourly duration rates"
                                  : "Overnight room rate"}
                              </span>
                            </div>
                          </div>
                        </th>
                        {data.dates.map((d) => {
                          const { isWeekend, dayNum, monthName } =
                            parseDateHeader(d);
                          const isInSelectedRange = Boolean(
                            from && to && d >= from && d <= to,
                          );
                          const isCellTargeted =
                            isInSelectedRange && rateId === r.id;
                          const override = data.prices.find(
                            (p) => p.ratePlanId === r.id && p.date === d,
                          );
                          const hasOverride = Boolean(override);
                          return (
                            <td
                              key={d}
                              className={`p-0 text-center align-middle border-r transition-colors ${
                                isWeekend
                                  ? "bg-[#fefcf6] border-r-amber-200/45"
                                  : "border-r-slate-100"
                              } ${isCellTargeted ? "bg-amber-50/45" : ""}`}
                            >
                              <button
                                type="button"
                                onClick={() => handleSelectCalendarTarget(d, r)}
                                title={`Click to edit ${r.name} for ${dayNum} ${monthName}`}
                                className="w-full h-full py-4 px-2 flex flex-col items-center justify-center hover:bg-amber-100/35 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#c89b3c] transition-colors cursor-pointer"
                              >
                                {r.bookingMode === "hourly" ? (
                                  <div className="flex flex-col gap-1.5 items-center justify-center w-full">
                                    {(
                                      override?.durationPrices ||
                                      r.durationPrices ||
                                      []
                                    ).length > 0 ? (
                                      <div className="grid grid-cols-1 gap-1.5 w-full min-w-[92px] max-w-[116px] mx-auto">
                                        {(
                                          override?.durationPrices ||
                                          r.durationPrices ||
                                          []
                                        ).map((dp) => (
                                          <div
                                            key={dp.hours}
                                            className={`flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg text-xs leading-tight whitespace-nowrap tabular-nums border ${
                                              hasOverride
                                                ? "bg-amber-50 border-amber-300/80 shadow-2xs"
                                                : "bg-white border-slate-200/85 shadow-2xs"
                                            }`}
                                          >
                                            <span
                                              className={`rounded px-1 py-0.5 text-[10px] font-bold leading-none ${
                                                hasOverride
                                                  ? "bg-amber-200/70 text-amber-950"
                                                  : "bg-slate-100 text-slate-600"
                                              }`}
                                            >
                                              {dp.hours}h
                                            </span>
                                            <span
                                              className={`font-bold ${
                                                hasOverride
                                                  ? "text-amber-950"
                                                  : "text-[#061224]"
                                              }`}
                                            >
                                              {formatPaise(dp.pricePaise)}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-slate-400">
                                        —
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center justify-center whitespace-nowrap tabular-nums">
                                    {hasOverride ? (
                                      <div className="inline-flex flex-col items-center justify-center rounded-xl bg-amber-50 px-2.5 py-1 border border-amber-200/90 shadow-2xs">
                                        <div className="flex items-center gap-1">
                                          <span className="text-[#c89b3c] font-bold text-xs">
                                            ★
                                          </span>
                                          <span className="text-sm font-bold text-amber-950">
                                            {prettyPrice(r, d)}
                                          </span>
                                        </div>
                                        <span className="text-[10px] font-semibold text-amber-700 mt-0.5">
                                          override
                                        </span>
                                      </div>
                                    ) : (
                                      <>
                                        <span className="text-sm sm:text-[15px] font-bold text-[#061224] leading-tight">
                                          {prettyPrice(r, d)}
                                        </span>
                                        <span className="text-[11px] text-slate-400 font-medium mt-0.5">
                                          / night
                                        </span>
                                      </>
                                    )}
                                  </div>
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Matrix Footer */}
            <div className="px-4 sm:px-5 py-3 bg-slate-50/70 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <p>
                Prices exclude taxes and fees · Click any date or rate cell to edit
              </p>
              {data.dates.length > 7 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 shadow-2xs">
                  ⇄ Scroll horizontally for all {data.dates.length} days
                </span>
              ) : (
                <p className="text-slate-400 hidden sm:inline">
                  Daily availability reflects lowest remaining units
                </p>
              )}
            </div>
          </div>

          {/* Bulk Update Form */}
          <form
            ref={bulkFormRef}
            onSubmit={(e) => {
              e.preventDefault();
              void previewBulk();
            }}
            className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 space-y-4 shadow-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50/80 border border-amber-200/60 text-[#c89b3c] shrink-0">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#061224]">
                    Update selected dates
                  </h3>
                  <p className="text-xs text-slate-500">
                    Apply price overrides or adjust booking availability across a date range
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 tabular-nums">
                  {room?.name || "Room"} · {selectedDayCount}{" "}
                  {selectedDayCount === 1 ? "day" : "days"}
                </span>
                {(from !== start || to !== (data.dates.at(-1) || start)) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFrom(start);
                      setTo(data.dates.at(-1) || start);
                    }}
                    className="inline-flex h-7 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-[#061224] transition-colors cursor-pointer"
                  >
                    Full view
                  </button>
                )}
              </div>
            </div>

            {/* Row 1: Scope & Target */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <label className="text-xs font-semibold text-slate-700">
                From
                <PartnerDatePicker
                  timezone={data.timezone}
                  required
                  className={`${inputClass} mt-1`}
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Through
                <PartnerDatePicker
                  timezone={data.timezone}
                  required
                  className={`${inputClass} mt-1`}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Change
                <select
                  className={`${inputClass} mt-1`}
                  value={operation}
                  onChange={(e) => setOperation(e.target.value)}
                >
                  <option value="price">Set date prices</option>
                  <option value="clear-price">Restore base prices</option>
                  <option disabled={!data.interval} value="stop">
                    Stop selling
                  </option>
                  <option disabled={!data.interval} value="open">
                    Reopen sales
                  </option>
                </select>
              </label>
              {operation.includes("price") && (
                <label className="text-xs font-semibold text-slate-700">
                  Rate plan
                  <select
                    required
                    className={`${inputClass} mt-1`}
                    aria-label="Rate plan"
                    value={rateId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setRateId(nextId);
                      setDurationPrices(
                        rates.find((r) => r.id === nextId)?.durationPrices ||
                          [],
                      );
                    }}
                  >
                    <option value="">Select rate plan</option>
                    {rates
                      .filter((r) => r.roomTypeId === roomId)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.bookingMode || "overnight"})
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>

            {/* Row 2: Value Input & Inline Action Bar */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 sm:p-4">
              {operation === "price" &&
              selectedRate?.bookingMode === "hourly" ? (
                <div className="space-y-3">
                  <DurationPriceEditor
                    key={`${rateId}:${from}:${to}`}
                    initialPrices={durationPrices.length ? durationPrices : selectedRate.durationPrices}
                    onChange={setDurationPrices}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/60">
                    <span className="text-xs font-medium text-slate-500">
                      Applies hourly override to{" "}
                      <strong className="text-[#061224]">
                        {selectedDayCount} {selectedDayCount === 1 ? "day" : "days"}
                      </strong>
                    </span>
                    <button
                      disabled={busy || !data.features.calendar}
                      className={`${primary} w-full sm:w-auto px-5`}
                    >
                      Preview changes
                    </button>
                  </div>
                </div>
              ) : operation === "price" ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-1">
                    <div className="w-full sm:max-w-[240px]">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label
                          htmlFor="bulk-nightly-price"
                          className="text-xs font-semibold text-slate-700"
                        >
                          Nightly room price (₹)
                        </label>
                        {selectedRate && (
                          <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                            Base: {formatPaise(selectedRate.basePricePaise)}
                          </span>
                        )}
                      </div>
                      <input
                        id="bulk-nightly-price"
                        ref={priceInputRef}
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder={
                          basePriceRupees ? String(basePriceRupees) : "Enter price"
                        }
                        className={inputClass}
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                      />
                    </div>
                    {priceDeltaPct !== null && (
                      <span
                        className={`inline-flex h-9 items-center rounded-xl border px-3 text-xs font-semibold tabular-nums whitespace-nowrap w-fit ${
                          priceDeltaPct > 0
                            ? "bg-emerald-50 border-emerald-200/80 text-emerald-800"
                            : priceDeltaPct < 0
                              ? "bg-amber-50 border-amber-200/80 text-amber-800"
                              : "bg-white border-slate-200 text-slate-600"
                        }`}
                      >
                        {priceDeltaPct > 0
                          ? `+${priceDeltaPct}% above base`
                          : priceDeltaPct < 0
                            ? `${priceDeltaPct}% below base`
                            : "Matches base price"}
                      </span>
                    )}
                  </div>
                  <button
                    disabled={busy || !data.features.calendar}
                    className={`${primary} w-full sm:w-auto px-5 shrink-0`}
                  >
                    Preview changes
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-medium text-slate-600">
                    {operation === "clear-price"
                      ? `Restores default base rates for ${selectedRate?.name || "selected plan"} across ${selectedDayCount} ${selectedDayCount === 1 ? "day" : "days"}.`
                      : operation === "stop"
                        ? `Closes new reservations for ${room?.name || "this room type"} across ${selectedDayCount} ${selectedDayCount === 1 ? "day" : "days"}.`
                        : `Reopens online availability for ${room?.name || "this room type"} across ${selectedDayCount} ${selectedDayCount === 1 ? "day" : "days"}.`}
                  </p>
                  <button
                    disabled={busy || !data.features.calendar}
                    className={`${primary} w-full sm:w-auto px-5 shrink-0`}
                  >
                    Preview changes
                  </button>
                </div>
              )}

              {!data.features.calendar && (
                <p className="mt-2.5 text-xs font-medium text-amber-700">
                  Calendar editing is not enabled for this environment.
                </p>
              )}
            </div>
          </form>

        </>
      ) : (
        <>
          {/* Housekeeping Glanceable Counters */}
          {activeUnits.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
              <div className="grid grid-cols-2 divide-y divide-slate-100 sm:grid-cols-4 sm:divide-y-0 sm:divide-x">
                {/* Total Rooms */}
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className={`group relative flex items-center justify-between gap-2 p-3.5 sm:px-5 sm:py-4 text-left transition-all cursor-pointer ${
                    filter === "all"
                      ? "bg-slate-50/90"
                      : "hover:bg-slate-50/50"
                  }`}
                >
                  <div className="min-w-0">
                    <span className="block text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500 truncate">
                      Total Rooms
                    </span>
                    <span className="mt-1.5 block text-[26px] sm:text-[30px] font-bold tracking-[-0.025em] leading-none tabular-nums text-[#061224]">
                      {hkStats.total}
                    </span>
                    <span className="text-[11px] sm:text-xs font-medium text-slate-500 block mt-1.5 truncate">
                      {hkStats.unknown > 0
                        ? `${hkStats.unknown} unset status`
                        : "Registered units"}
                    </span>
                  </div>
                  <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100/80 text-[#061224] transition-colors group-hover:bg-slate-200/70 shadow-2xs">
                    <Layers className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  {filter === "all" && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#061224]" />
                  )}
                </button>

                {/* Ready / Clean */}
                <button
                  type="button"
                  onClick={() =>
                    setFilter(filter === "clean" ? "all" : "clean")
                  }
                  className={`group relative flex items-center justify-between gap-2 p-3.5 sm:px-5 sm:py-4 text-left transition-all cursor-pointer border-l border-slate-100 sm:border-l-0 ${
                    filter === "clean" || filter === "inspected"
                      ? "bg-emerald-50/40"
                      : "hover:bg-slate-50/50"
                  }`}
                >
                  <div className="min-w-0">
                    <span className="block text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.06em] text-emerald-800 truncate">
                      Ready &amp; Clean
                    </span>
                    <span className="mt-1.5 block text-[26px] sm:text-[30px] font-bold tracking-[-0.025em] leading-none tabular-nums text-emerald-900">
                      {hkStats.clean}
                    </span>
                    <span className="text-[11px] sm:text-xs font-medium text-emerald-700/80 block mt-1.5 truncate">
                      Guest ready
                    </span>
                  </div>
                  <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200/60 text-emerald-700 transition-colors group-hover:bg-emerald-100 shadow-2xs">
                    <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  {(filter === "clean" || filter === "inspected") && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />
                  )}
                </button>

                {/* Needs Cleaning */}
                <button
                  type="button"
                  onClick={() =>
                    setFilter(filter === "dirty" ? "all" : "dirty")
                  }
                  className={`group relative flex items-center justify-between gap-2 p-3.5 sm:px-5 sm:py-4 text-left transition-all cursor-pointer ${
                    filter === "dirty"
                      ? "bg-amber-50/40"
                      : "hover:bg-slate-50/50"
                  }`}
                >
                  <div className="min-w-0">
                    <span
                      className={`block text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.06em] truncate ${
                        hkStats.dirty > 0 ? "text-amber-800" : "text-slate-500"
                      }`}
                    >
                      Needs Cleaning
                    </span>
                    <span
                      className={`mt-1.5 block text-[26px] sm:text-[30px] font-bold tracking-[-0.025em] leading-none tabular-nums ${
                        hkStats.dirty > 0 ? "text-amber-900" : "text-slate-400"
                      }`}
                    >
                      {hkStats.dirty}
                    </span>
                    <span className="text-[11px] sm:text-xs font-medium text-slate-500 block mt-1.5 truncate">
                      {hkStats.dirty > 0
                        ? "Pending turnover"
                        : "All rooms cleaned"}
                    </span>
                  </div>
                  <div
                    className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl transition-colors shadow-2xs ${
                      hkStats.dirty > 0
                        ? "bg-amber-50 border border-amber-200/80 text-amber-700 group-hover:bg-amber-100"
                        : "bg-slate-50 border border-slate-200/60 text-slate-400"
                    }`}
                  >
                    <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  {filter === "dirty" && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-600" />
                  )}
                </button>

                {/* Occupied */}
                <button
                  type="button"
                  onClick={() =>
                    setFilter(filter === "occupied" ? "all" : "occupied")
                  }
                  className={`group relative flex items-center justify-between gap-2 p-3.5 sm:px-5 sm:py-4 text-left transition-all cursor-pointer border-l border-slate-100 sm:border-l-0 ${
                    filter === "occupied"
                      ? "bg-slate-100/70"
                      : "hover:bg-slate-50/50"
                  }`}
                >
                  <div className="min-w-0">
                    <span className="block text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500 truncate">
                      Occupied
                    </span>
                    <span className="mt-1.5 block text-[26px] sm:text-[30px] font-bold tracking-[-0.025em] leading-none tabular-nums text-[#061224]">
                      {hkStats.occupied}
                    </span>
                    <span className="text-[11px] sm:text-xs font-medium text-slate-500 block mt-1.5 truncate">
                      In-house guests
                    </span>
                  </div>
                  <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 border border-slate-200/80 text-slate-700 transition-colors group-hover:bg-slate-200/60 shadow-2xs">
                    <BedDouble className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  {filter === "occupied" && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-800" />
                  )}
                </button>
              </div>
            </div>
          )}

          {!activeUnits.length ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <DoorClosed className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-slate-900 text-base">
                No room numbers registered
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Add physical room numbers to track cleaning turnover, assign
                guests, and record housekeeping logs.
              </p>
              <button
                type="button"
                className={`${button} mt-2`}
                onClick={() => setRegister(true)}
              >
                <Layers className="h-4 w-4 text-slate-500" />
                Manage room numbers
              </button>
            </div>
          ) : (
            /* Unified Professional Housekeeping Table Card */
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
              {/* Integrated Search, Filter & Sort Toolbar */}
              <div className="p-3.5 sm:px-5 sm:py-3.5 border-b border-slate-100 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between bg-white">
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 flex-1 min-w-0">
                  <div className="relative w-full sm:w-56 shrink-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <input
                      aria-label="Search room numbers"
                      placeholder="Search room number..."
                      className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white focus:bg-white pl-8.5 pr-8 text-xs font-medium text-[#061224] placeholder:text-slate-400 outline-none focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/15 transition-all"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        type="button"
                        aria-label="Clear room search"
                        onClick={() => setSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
                    <select
                      aria-label="Housekeeping filter"
                      className="h-9 w-full sm:w-auto rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white px-2.5 sm:px-3 text-xs font-semibold text-slate-700 outline-none hover:border-slate-300 focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/15 transition-all cursor-pointer"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      {[
                        ["all", "All statuses"],
                        ["dirty", "Dirty / Needs Cleaning"],
                        ["clean", "Clean & Inspected"],
                        ["inspected", "Inspected only"],
                        ["occupied", "Occupied only"],
                        ["maintenance", "In Maintenance"],
                        ["unknown", "Unknown status"],
                      ].map(([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                    </select>

                    {rooms.length > 1 && (
                      <select
                        aria-label="Filter by room type"
                        className="h-9 w-full sm:w-auto rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white px-2.5 sm:px-3 text-xs font-semibold text-slate-700 outline-none hover:border-slate-300 focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/15 transition-all cursor-pointer"
                        value={hkRoomType}
                        onChange={(e) => setHkRoomType(e.target.value)}
                      >
                        <option value="all">All room types</option>
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    )}

                    {availableFloors.length > 1 && (
                      <select
                        aria-label="Filter by floor"
                        className="h-9 w-full sm:w-auto rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white px-2.5 sm:px-3 text-xs font-semibold text-slate-700 outline-none hover:border-slate-300 focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/15 transition-all cursor-pointer"
                        value={hkFloor}
                        onChange={(e) => setHkFloor(e.target.value)}
                      >
                        <option value="all">All floors</option>
                        {availableFloors.map((floor) => (
                          <option key={floor} value={floor}>
                            {floor}
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      type="button"
                      aria-label="Sort rooms"
                      onClick={() =>
                        setHkSort((prev) =>
                          prev === "room" ? "priority" : "room",
                        )
                      }
                      className={`inline-flex h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                        hkSort === "priority"
                          ? "border-amber-300 bg-amber-50/80 text-amber-900 shadow-2xs"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                      }`}
                    >
                      <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>
                        {hkSort === "room" ? "Sort: Room #" : "Sort: Dirty first"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Counter and Filter Reset */}
                <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 text-xs shrink-0">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200/70 px-2.5 py-1 text-slate-600 font-semibold text-[11px] tabular-nums">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    {filteredHousekeepingUnits.length} of {activeUnits.length}{" "}
                    rooms
                  </span>
                  {hasActiveHkFilters && (
                    <button
                      type="button"
                      onClick={resetHkFilters}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-slate-200 px-2.5 py-1 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      Reset filters
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Single-DOM Responsive Data Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <th scope="col" className="py-3 px-3 sm:py-3.5 sm:px-5">
                        Room
                      </th>
                      <th
                        scope="col"
                        className="py-3.5 px-4 lg:px-5 hidden sm:table-cell"
                      >
                        Room Type
                      </th>
                      <th
                        scope="col"
                        className="py-3.5 px-4 lg:px-5 hidden sm:table-cell"
                      >
                        Occupancy
                      </th>
                      <th scope="col" className="py-3 px-2.5 sm:py-3.5 sm:px-4 lg:px-5">
                        Cleaning Status
                      </th>
                      <th
                        scope="col"
                        className="py-3.5 px-4 lg:px-5 hidden lg:table-cell"
                      >
                        Notes &amp; Updates
                      </th>
                      <th
                        scope="col"
                        className="py-3 px-3 sm:py-3.5 sm:px-5 text-right"
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredHousekeepingUnits.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-12 px-4 text-center bg-white"
                        >
                          <Search className="mx-auto h-7 w-7 text-slate-300" />
                          <p className="mt-2.5 text-sm font-bold text-[#061224]">
                            No rooms match your current filters
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Try adjusting the search query, status, room type, or
                            floor filter.
                          </p>
                          {hasActiveHkFilters && (
                            <button
                              type="button"
                              onClick={resetHkFilters}
                              className="mt-3.5 inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-[#061224] hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
                            >
                              Reset filters
                            </button>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredHousekeepingUnits.map((u) => {
                        const roomType = rooms.find(
                          (r) => r.id === u.roomTypeId,
                        );
                        const isClean =
                          u.housekeepingStatus === "clean" ||
                          u.housekeepingStatus === "inspected";
                        const isDirty = u.housekeepingStatus === "dirty";
                        const isInMaintenance = maintenanceUnitIds.has(u.id);
                        const isQuickSaving = quickCleaningId === u.id;

                        return (
                          <tr
                            key={u.id}
                            className={`transition-colors group ${
                              isDirty
                                ? "bg-amber-50/25 hover:bg-amber-50/50"
                                : "hover:bg-slate-50/60"
                            }`}
                          >
                            {/* Room Number (+ compact mobile Room Type & Occupancy subline) */}
                            <td className="py-3.5 px-3 sm:py-4 sm:px-5 whitespace-nowrap">
                              <div className="flex items-center gap-2.5 sm:gap-3">
                                <div
                                  className={`hidden sm:flex h-8 w-8 items-center justify-center rounded-xl border shrink-0 shadow-2xs ${
                                    isDirty
                                      ? "bg-amber-50 border-amber-200/80 text-amber-700"
                                      : isInMaintenance
                                        ? "bg-slate-100 border-slate-300 text-slate-600"
                                        : "bg-slate-50 border-slate-200/80 text-slate-500"
                                  }`}
                                >
                                  {isInMaintenance ? (
                                    <Wrench className="h-3.5 w-3.5" />
                                  ) : (
                                    <DoorClosed className="h-4 w-4" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <h3 className="font-extrabold text-sm text-[#061224] tracking-tight tabular-nums">
                                      {u.label}
                                    </h3>
                                    {isInMaintenance && (
                                      <span className="sm:hidden inline-flex items-center rounded bg-slate-200/80 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-700">
                                        Maint
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium sm:hidden mt-0.5">
                                    <span className="truncate max-w-[72px]">
                                      {roomType?.name || "Room"}
                                    </span>
                                    <span className="text-slate-300">·</span>
                                    <span
                                      className={
                                        u.occupied
                                          ? "font-semibold text-[#061224]"
                                          : "text-slate-400"
                                      }
                                    >
                                      {u.occupied ? "Occupied" : "Vacant"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Room Type (sm+) */}
                            <td className="py-4 px-4 lg:px-5 whitespace-nowrap hidden sm:table-cell">
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200/70 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                <BedDouble className="h-3.5 w-3.5 text-slate-400" />
                                {roomType?.name || "Room Type"}
                              </span>
                            </td>

                            {/* Occupancy & Maintenance State (sm+) */}
                            <td className="py-4 px-4 lg:px-5 whitespace-nowrap hidden sm:table-cell">
                              <div className="flex flex-wrap items-center gap-2">
                                {u.occupied ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold bg-[#061224] text-white shadow-2xs">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    Occupied
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200/70">
                                    <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                                    Vacant
                                  </span>
                                )}
                                {isInMaintenance && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                    <Wrench className="h-3 w-3 text-slate-500" />
                                    Maintenance
                                  </span>
                                )}
                                {u.bookingId && (
                                  <a
                                    className="inline-flex h-7 items-center text-xs font-semibold text-[#061224] underline underline-offset-2 hover:text-[#c89b3c] transition-colors"
                                    href={`?${new URLSearchParams({ propertyId, bookingId: u.bookingId, section: "assignment" })}`}
                                  >
                                    Open reservation
                                  </a>
                                )}
                              </div>
                            </td>

                            {/* Cleaning Status */}
                            <td className="py-3.5 px-2.5 sm:py-4 sm:px-4 lg:px-5 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-lg px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-semibold border ${
                                  isDirty
                                    ? "bg-amber-50 text-amber-900 border-amber-200/90 shadow-2xs"
                                    : u.housekeepingStatus === "inspected"
                                      ? "bg-emerald-50 text-emerald-950 border-emerald-200/80 font-bold shadow-2xs"
                                      : isClean
                                        ? "bg-emerald-50/70 text-emerald-900 border-emerald-200/60"
                                        : "bg-slate-50 text-slate-600 border-slate-200/70"
                                }`}
                              >
                                {isDirty ? (
                                  <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                ) : u.housekeepingStatus === "inspected" ||
                                  isClean ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                ) : (
                                  <Clock3 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                )}
                                <p className="capitalize inline m-0 p-0 font-semibold">
                                  {u.housekeepingStatus || "unknown"}
                                </p>
                              </span>
                            </td>

                            {/* Notes & Updates (lg+) */}
                            <td className="py-4 px-4 lg:px-5 hidden lg:table-cell text-xs text-slate-500">
                              <div className="space-y-0.5">
                                {u.housekeepingNote ? (
                                  <p className="font-medium text-slate-800 truncate max-w-xs text-xs italic">
                                    &ldquo;{u.housekeepingNote}&rdquo;
                                  </p>
                                ) : null}
                                {u.housekeepingUpdatedAt ? (
                                  <span className="text-[11px] text-slate-400 block font-normal tabular-nums">
                                    Updated{" "}
                                    {new Date(
                                      u.housekeepingUpdatedAt,
                                    ).toLocaleString("en-IN", {
                                      timeZone: data.timezone,
                                      dateStyle: "short",
                                      timeStyle: "short",
                                    })}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-slate-300">
                                    —
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="py-3.5 px-3 sm:py-4 sm:px-5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5 sm:gap-2">
                                {isDirty && data.features.housekeeping && (
                                  <button
                                    type="button"
                                    disabled={isQuickSaving || busy}
                                    onClick={() => void handleQuickMarkClean(u)}
                                    title={`Mark room ${u.label} clean`}
                                    className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2.5 text-[11px] sm:text-xs font-semibold text-white shadow-2xs active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                                  >
                                    {isQuickSaving ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Check className="h-3.5 w-3.5" />
                                    )}
                                    <span className="hidden sm:inline">
                                      {isQuickSaving ? "Saving…" : "Mark clean"}
                                    </span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 sm:px-3 text-[11px] sm:text-xs font-semibold shadow-2xs active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c] transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer ${
                                    isDirty
                                      ? "border border-amber-300/90 bg-white text-amber-950 hover:bg-amber-50"
                                      : "border border-slate-200/90 bg-white text-[#061224] hover:border-[#061224] hover:bg-[#061224] hover:text-white"
                                  }`}
                                  disabled={!data.features.housekeeping}
                                  onClick={() => {
                                    setEditingUnit(u);
                                    setMessage("");
                                    setHouseStatus(
                                      u.housekeepingStatus || "unknown",
                                    );
                                    setNote(u.housekeepingNote || "");
                                  }}
                                >
                                  <CheckCircle2
                                    className={`h-3.5 w-3.5 hidden sm:inline shrink-0 ${
                                      isDirty
                                        ? "text-amber-600"
                                        : "text-[#c89b3c]"
                                    }`}
                                  />
                                  Update cleaning
                                </button>
                                <button
                                  type="button"
                                  aria-label="Maintenance"
                                  title="Block room for maintenance"
                                  className="inline-flex h-8 w-8 xl:w-auto xl:px-3 items-center justify-center gap-1.5 rounded-lg border border-slate-200/90 bg-white hover:bg-slate-50 hover:border-slate-300 text-xs font-semibold text-slate-700 shadow-2xs active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c] transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer shrink-0"
                                  disabled={!data.interval}
                                  onClick={() => {
                                    setRoomId(u.roomTypeId);
                                    setMaintenanceUnit(u.id);
                                    setQuantity(1);
                                    setMaintenanceKey(crypto.randomUUID());
                                    setMaintenanceOpen(true);
                                  }}
                                >
                                  <Wrench className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                  <span className="hidden xl:inline">
                                    Maintenance
                                  </span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Table Footer */}
              <div className="px-4 sm:px-5 py-3 bg-slate-50/70 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span className="tabular-nums">
                  Showing {filteredHousekeepingUnits.length} of{" "}
                  {activeUnits.length} active room units
                </span>
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  Timezone: {data.timezone}
                </span>
              </div>
            </div>
          )}
        </>
      )}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50/80 border border-amber-200/60 text-[#c89b3c] shrink-0">
              <Wrench className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#061224]">
                Active maintenance blocks
              </h3>
              <p className="text-xs text-slate-500">
                Capacity held back from guest reservations for repairs or upkeep
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-xs font-bold tabular-nums text-slate-700">
              {data.blocks.length}{" "}
              {data.blocks.length === 1 ? "block" : "blocks"}
            </span>
            <button
              type="button"
              disabled={!data.interval}
              onClick={() => {
                setMaintenanceUnit("");
                setMaintenanceKey(crypto.randomUUID());
                setMaintenanceOpen(true);
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 text-xs font-semibold text-[#061224] shadow-2xs hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5 text-[#c89b3c]" />
              Block rooms
            </button>
          </div>
        </div>
        {!data.blocks.length ? (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 rounded-xl border border-emerald-200/60 bg-emerald-50/35 px-4 py-5 text-center sm:text-left">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100/80 text-emerald-700">
              <CheckCircle2 className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-emerald-950">
                All rooms open for reservations
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                No active maintenance blocks. Inventory is live according to your calendar rates.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {data.blocks.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/85 bg-slate-50/60 p-3.5 text-sm hover:bg-slate-50 transition-colors"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[#061224]">{b.reason}</span>
                    <span className="rounded-full bg-amber-100/90 border border-amber-200/70 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-900">
                      {b.quantity} {b.quantity === 1 ? "room" : "rooms"}
                    </span>
                    <span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200/90 shadow-2xs">
                      {b.unitId
                        ? `Room ${data.units.find((u) => u.id === b.unitId)?.label || b.unitId}`
                        : rooms.find((r) => r.id === b.roomTypeId)?.name}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 tabular-nums">
                    {new Date(b.startAt).toLocaleString("en-IN", {
                      timeZone: data.timezone,
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    –{" "}
                    {new Date(b.endAt).toLocaleString("en-IN", {
                      timeZone: data.timezone,
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  className={button}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Release this maintenance block and restore its capacity?",
                      )
                    )
                      void perform(
                        () => call("release", { blockId: b.id }),
                        "Maintenance released.",
                      );
                  }}
                >
                  Release block
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      <Drawer
        open={!!preview}
        onClose={() => {
          if (!busy) setPreview(null);
        }}
        title="Confirm calendar changes"
        description="Existing reservations keep their booked prices."
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3.5 py-3 text-xs font-medium text-amber-900">
            <Clock3 className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p>
              <strong className="font-bold tabular-nums">
                {preview?.cells.length}{" "}
                {preview?.cells.length === 1 ? "date cell" : "date cells"}
              </strong>{" "}
              will be updated. Please confirm within five minutes.
            </p>
          </div>
          <ul className="max-h-96 space-y-2 overflow-auto text-sm pr-0.5">
            {preview?.cells.map((c) => {
              const roomName =
                rooms.find((r) => r.id === c.roomTypeId)?.name || "Room";
              const planName = rates.find((r) => r.id === c.ratePlanId)?.name;
              const summaryText = c.ratePlanId
                ? `${planName}: ${
                    c.clearPrice
                      ? "Restore base price"
                      : c.durationPrices
                        ? c.durationPrices
                            .map(
                              (p) =>
                                `${p.hours} hours ${formatPaise(p.pricePaise)}`,
                            )
                            .join(", ")
                        : formatPaise(c.basePricePaise || 0)
                  }`
                : c.stopSell
                  ? "Close sales"
                  : "Reopen sales";
              return (
                <li
                  key={`${c.ratePlanId || c.roomTypeId}:${c.date}`}
                  className="flex flex-col gap-1 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs font-bold text-[#061224] tabular-nums">
                      {c.date} · {roomName}
                    </strong>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        c.stopSell
                          ? "bg-rose-100 text-rose-800"
                          : c.clearPrice
                            ? "bg-slate-200/80 text-slate-700"
                            : "bg-amber-100/80 text-amber-900"
                      }`}
                    >
                      {c.stopSell
                        ? "Stop sell"
                        : c.clearPrice
                          ? "Base"
                          : c.ratePlanId
                            ? "Override"
                            : "Open"}
                    </span>
                  </div>
                  <p className="text-[13px] font-semibold text-slate-700 tabular-nums">
                    {summaryText}
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              disabled={busy}
              className={`${primary} flex-1 sm:flex-none`}
              onClick={() =>
                void perform(async () => {
                  await call("bulk", {
                    action: "apply",
                    previewId: preview?.previewId,
                  });
                  setPreview(null);
                }, "Calendar updated.")
              }
            >
              Confirm changes
            </button>
            <button
              type="button"
              disabled={busy}
              className={button}
              onClick={() => setPreview(null)}
            >
              Cancel
            </button>
          </div>
          {message && (
            <p role="status" className="text-sm font-medium text-amber-800">
              {message}
            </p>
          )}
        </div>
      </Drawer>
      <Drawer
        open={!!editingUnit}
        onClose={() => {
          if (!busy) setEditingUnit(null);
        }}
        title={`Cleaning: ${editingUnit?.label || ""}`}
        description="This does not change occupancy or future booking capacity."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void perform(async () => {
              await call("housekeeping", {
                unitId: editingUnit?.id,
                revision: editingUnit?.revision,
                status: houseStatus,
                note,
              });
              setEditingUnit(null);
            }, "Cleaning status saved.");
          }}
        >
          <label className="block text-xs font-semibold text-slate-700">
            Status
            <select
              className={`${inputClass} mt-1.5 capitalize`}
              aria-label="Status"
              value={houseStatus}
              onChange={(e) => setHouseStatus(e.target.value)}
            >
              {["unknown", "dirty", "clean", "inspected"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-700">
            Note
            <textarea
              maxLength={500}
              placeholder="Optional note for front desk or housekeeping staff..."
              className={`${inputClass} mt-1.5 !h-24 py-2`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button disabled={busy} className={`${primary} flex-1 sm:flex-none`}>
              Save cleaning status
            </button>
            <button
              type="button"
              disabled={busy}
              className={button}
              onClick={() => setEditingUnit(null)}
            >
              Cancel
            </button>
          </div>
          {message && (
            <p role="status" className="text-sm font-medium text-amber-800">
              {message}
            </p>
          )}
          <section className="space-y-2.5 pt-3 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-[0.06em] text-slate-500">
              Recent cleaning history
            </h3>
            {history.isPending ? (
              <p className="text-xs text-slate-500">Loading history…</p>
            ) : history.isError ? (
              <button
                type="button"
                className={button}
                onClick={() => void history.refetch()}
              >
                Retry history
              </button>
            ) : !history.data?.events?.length ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
                No recorded changes yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-auto pr-0.5">
                {history.data.events.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center rounded-md bg-white border border-slate-200/80 px-2 py-0.5 text-[11px] font-bold capitalize text-[#061224]">
                        {event.status}
                      </span>
                      {event.createdAt && (
                        <span className="text-[11px] text-slate-400 tabular-nums">
                          {new Date(event.createdAt).toLocaleString("en-IN", {
                            timeZone: data.timezone,
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                      )}
                    </div>
                    {event.note && (
                      <p className="text-slate-700 font-medium leading-snug">
                        {event.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </form>
      </Drawer>
      <Drawer
        open={maintenanceOpen}
        onClose={() => {
          if (!busy) setMaintenanceOpen(false);
        }}
        title="Block rooms for maintenance"
        description="Bookings and room assignments are checked before capacity is blocked."
      >
        {message && (
          <p role="status" className="mb-3 text-sm text-amber-800">
            {message}
          </p>
        )}
        <MaintenanceForm
          roomId={roomId}
          unitId={maintenanceUnit}
          rooms={rooms}
          units={data.units}
          from={from}
          quantity={quantity}
          reason={reason}
          setFrom={setFrom}
          setQuantity={setQuantity}
          setReason={setReason}
          setRoomId={setRoomId}
          setUnit={setMaintenanceUnit}
          busy={busy || !data.features.calendar || !data.interval}
          save={(startAt, endAt) =>
            void perform(async () => {
              await call("maintenance", {
                roomTypeId: roomId,
                ...(maintenanceUnit ? { unitId: maintenanceUnit } : {}),
                startAt,
                endAt,
                quantity: maintenanceUnit ? 1 : quantity,
                reason,
                requestId: maintenanceKey,
              });
              setMaintenanceOpen(false);
            }, "Maintenance block saved.")
          }
          timezone={data.timezone}
        />
      </Drawer>
      {register && (
        <PhysicalRoomRegister
          propertyId={propertyId}
          rooms={rooms}
          onClose={() => {
            setRegister(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
function MaintenanceForm({
  roomId,
  unitId,
  rooms,
  units,
  from,
  quantity,
  reason,
  setFrom,
  setQuantity,
  setReason,
  setRoomId,
  setUnit,
  busy,
  save,
  timezone,
}: {
  roomId: string;
  unitId: string;
  rooms: ListingRoomType[];
  units: RoomsWorkspace["units"];
  from: string;
  quantity: number;
  reason: string;
  setFrom: (v: string) => void;
  setQuantity: (v: number) => void;
  setReason: (v: string) => void;
  setRoomId: (v: string) => void;
  setUnit: (v: string) => void;
  busy: boolean;
  save: (start: string, end: string) => void;
  timezone: string;
}) {
  const [end, setEnd] = useState(shiftDate(from, 1)),
    [a, setA] = useState("12:00"),
    [b, setB] = useState("12:00"),
    [error, setError] = useState("");
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const { resolveLocal } = await import("@/lib/booking/domain");
          save(
            new Date(resolveLocal(from, a, timezone)).toISOString(),
            new Date(resolveLocal(end, b, timezone)).toISOString(),
          );
        } catch (err) {
          setError(err instanceof Error ? err.message : "Invalid time.");
        }
      }}
    >
      <label className="block text-sm">
        Room type
        <select
          className={inputClass}
          value={roomId}
          onChange={(e) => {
            setRoomId(e.target.value);
            setUnit("");
          }}
        >
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Individual room (optional)
        <select
          className={inputClass}
          value={unitId}
          onChange={(e) => setUnit(e.target.value)}
        >
          <option value="">Block room-type capacity</option>
          {units
            .filter((u) => u.roomTypeId === roomId && u.status === "active")
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Starts
          <PartnerDatePicker timezone={timezone}
            required
            
            className={inputClass}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            required
            type="time"
            step={900}
            className={inputClass}
            value={a}
            onChange={(e) => setA(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Ends
          <PartnerDatePicker timezone={timezone}
            required
            
            className={inputClass}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
          <input
            required
            type="time"
            step={900}
            className={inputClass}
            value={b}
            onChange={(e) => setB(e.target.value)}
          />
        </label>
      </div>
      <p className="text-xs text-slate-500">Times use {timezone}.</p>
      {!unitId && (
        <label className="block text-sm">
          Rooms to block
          <input
            type="number"
            min={1}
            max={rooms.find((r) => r.id === roomId)?.inventory || 500}
            required
            className={inputClass}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </label>
      )}
      <label className="block text-sm">
        Reason
        <textarea
          required
          minLength={3}
          maxLength={500}
          className={inputClass}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy} className={primary}>
        Save maintenance block
      </button>
    </form>
  );
}
