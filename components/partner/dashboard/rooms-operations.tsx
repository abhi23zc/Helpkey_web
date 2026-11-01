"use client";
import { PartnerDatePicker } from "./partner-date-picker";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "@/lib/partner/upload-client";
import { formatPaise } from "@/lib/currency";
import { DurationPriceEditor } from "@/components/partner/duration-price-editor";
import type { DurationPrice } from "@/lib/booking/duration-pricing";
import type { ListingRoomType, ListingRatePlan } from "./use-property-listing";
import { PhysicalRoomRegister } from "./reservation-operations";
import { Drawer } from "./drawer";
import {
  AlertCircle,
  BedDouble,
  CalendarDays,
  CheckCircle2,
  Clock3,
  DoorClosed,
  FileText,
  Filter,
  Layers,
  Moon,
  Search,
  Wrench,
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
    status: string;
    occupied: boolean;
    housekeepingStatus?: string;
    housekeepingNote?: string;
    revision: number;
    housekeepingUpdatedAt?: string;
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
  "w-full min-w-0 h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs sm:text-sm font-medium outline-none transition-colors focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/15";
const button =
  "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-[#c89b3c]/50 hover:text-[#061224] active:scale-[0.98] disabled:opacity-40 transition-all";
const primary =
  "inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-[#061224] px-4 text-xs font-semibold text-white shadow-2xs hover:bg-[#0c1f3b] active:scale-[0.98] disabled:opacity-40 transition-all";
const btnActionPrimary =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#061224] px-3 text-xs font-semibold text-white shadow-2xs hover:bg-[#0c1f3b] active:scale-[0.98] transition-all disabled:opacity-40 whitespace-nowrap";
const btnActionSecondary =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] transition-all disabled:opacity-40 whitespace-nowrap";
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
    refetchInterval: 60000,
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
  const [roomId, setRoomId] = useState(rooms[0]?.id || ""),
    [rateId, setRateId] = useState("");
  const [from, setFrom] = useState(start),
    [to, setTo] = useState(data.dates.at(-1) || start),
    [price, setPrice] = useState(""),
    [durationPrices, setDurationPrices] = useState<DurationPrice[]>([]);
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
    [search, setSearch] = useState("");
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
  const selectedRate = rates.find((r) => r.id === rateId),
    room = rooms.find((r) => r.id === roomId);
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
  const previewBulk = () =>
    perform(async () => {
      const count = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
      if (!Number.isInteger(count) || count < 1 || count > 31)
        throw new Error("Select a range of 1–31 days.");
      if (operation.includes("price") && !selectedRate)
        throw new Error("Select a rate plan.");
      const cells = Array.from({ length: count }, (_, i) => ({
        roomTypeId: roomId,
        date: shiftDate(from, i),
        ...(operation === "stop" || operation === "open"
          ? { stopSell: operation === "stop" }
          : {
              ratePlanId: rateId,
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
    }, "Review the changes before confirming.");
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
  const roomSelect = (
    <label className="block text-xs font-semibold">
      Room type
      <select
        className={`${inputClass} mt-1`}
        value={roomId}
        onChange={(e) => {
          setRoomId(e.target.value);
          setRateId("");
        }}
      >
        {rooms.map((r) => (
          <option value={r.id} key={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
  );
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
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#061224]">
            {mode === "calendar"
              ? "Availability & rates"
              : "Housekeeping & room register"}
          </h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
            {mode === "calendar"
              ? `${data.dates.length} days`
              : `${data.units.length} units`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
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
          <button className={button} onClick={() => setRegister(true)}>
            <Layers className="h-4 w-4 text-slate-500" />
            Manage room numbers
          </button>
        </div>
      </div>
      {mode === "calendar" ? (
        <>
          <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden mb-6">
            {/* Control & Legend Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 sm:px-5 sm:py-4.5 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 border border-slate-200/80 text-slate-700 shadow-2xs shrink-0">
                  <BedDouble className="h-5 w-5 text-slate-600" />
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Room type:</span>
                  <select
                    aria-label="Select room type"
                    className="h-10 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white px-3.5 text-sm font-bold text-slate-900 outline-none hover:border-slate-300 focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/15 transition-all cursor-pointer shadow-2xs"
                    value={roomId}
                    onChange={(e) => {
                      setRoomId(e.target.value);
                      setRateId("");
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
              <div className="flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50/90 border border-amber-200/80 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-2xs">
                  <span className="text-[#c89b3c] font-bold text-sm">★</span>
                  <span>Gold price = Date override</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-1.5 text-xs font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                  {room?.inventory || 0} total units
                </span>
              </div>
            </div>

            {!data.interval && (
              <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 text-xs text-amber-800 font-medium">
                This property uses legacy nightly inventory. Time-based maintenance and stop-sell controls require availability setup by Helpkey.
              </div>
            )}

            {/* Scrollable Matrix Table with Fixed Columns & Sticky First Column */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] table-fixed border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="sticky left-0 z-20 bg-slate-50/95 backdrop-blur-xs p-4 sm:p-5 text-left border-r border-slate-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] w-[240px]">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50/80 border border-amber-200/60 text-[#c89b3c] shrink-0">
                          <CalendarDays className="h-4 w-4" />
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Calendar Metrics
                          </span>
                          <span className="block text-sm font-extrabold text-[#061224] mt-0.5">
                            Availability &amp; Rates
                          </span>
                        </div>
                      </div>
                    </th>
                    {data.dates.map((d) => {
                      const { dayOfWeek, monthName, dayNum, isWeekend } =
                        parseDateHeader(d);
                      return (
                        <th
                          key={d}
                          className={`py-4 px-3 text-center font-medium border-r border-slate-100 ${
                            isWeekend ? "bg-amber-50/45" : "bg-slate-50/70"
                          }`}
                        >
                          <span
                            className={`block text-[11px] uppercase font-bold tracking-wider ${
                              isWeekend ? "text-amber-700" : "text-slate-400"
                            }`}
                          >
                            {dayOfWeek}
                          </span>
                          <span
                            className={`block text-sm font-extrabold mt-1 ${
                              isWeekend ? "text-amber-950" : "text-slate-800"
                            }`}
                          >
                            {dayNum} {monthName}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* Remaining Capacity Row */}
                  <tr className="hover:bg-slate-50/40 transition-colors">
                    <th className="sticky left-0 z-10 bg-white p-4 sm:p-5 text-left border-r border-slate-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] align-middle">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-200/80 text-slate-600 shrink-0 shadow-2xs">
                          <Layers className="h-4.5 w-4.5" />
                        </div>
                        <div>
                          <span className="block text-sm font-bold text-slate-900 leading-tight">
                            Remaining capacity
                          </span>
                          <span className="block text-xs font-normal text-slate-400 mt-1">
                            Available inventory
                          </span>
                        </div>
                      </div>
                    </th>
                    {data.dates.map((d) => {
                      const { isWeekend } = parseDateHeader(d);
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
                          className={`py-5 px-3 text-center align-middle border-r border-slate-100 ${
                            isWeekend ? "bg-amber-50/20" : ""
                          }`}
                          key={d}
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
                            <div className="inline-flex flex-col items-center justify-center rounded-xl px-3 py-1 bg-amber-50 border border-amber-200 text-amber-900 shadow-2xs">
                              <span className="text-sm font-bold leading-tight">{remaining}</span>
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mt-0.5">Low</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center">
                              <span className="font-extrabold text-sm sm:text-base text-slate-900 leading-tight">
                                {remaining}
                              </span>
                              <span className="text-[11px] text-slate-400 font-medium mt-1">
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
                        className="hover:bg-slate-50/40 transition-colors"
                      >
                        <th className="sticky left-0 z-10 bg-white p-4 sm:p-5 text-left border-r border-slate-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] align-middle">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-200/80 text-slate-600 shrink-0 shadow-2xs">
                              {r.bookingMode === "hourly" ? (
                                <Clock3 className="h-4.5 w-4.5" />
                              ) : (
                                <Moon className="h-4.5 w-4.5" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-slate-900 leading-tight">
                                  {r.name}
                                </span>
                                {r.status !== "active" && (
                                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 uppercase">
                                    Paused
                                  </span>
                                )}
                              </div>
                              <span className="block text-xs font-normal text-slate-400 mt-1">
                                {r.bookingMode === "hourly"
                                  ? "Hourly duration rates"
                                  : "Overnight room rate"}
                              </span>
                            </div>
                          </div>
                        </th>
                        {data.dates.map((d) => {
                          const { isWeekend } = parseDateHeader(d);
                          const hasOverride = data.prices.some(
                            (p) => p.ratePlanId === r.id && p.date === d,
                          );
                          const override = data.prices.find(
                            (p) => p.ratePlanId === r.id && p.date === d,
                          );
                          return (
                            <td
                              key={d}
                              className={`border-r border-slate-100 py-5 px-3 text-center align-middle ${
                                isWeekend ? "bg-amber-50/20" : ""
                              }`}
                            >
                              {r.bookingMode === "hourly" ? (
                                <div className="flex flex-col gap-1.5 items-center justify-center">
                                  {(override?.durationPrices || r.durationPrices || []).length > 0 ? (
                                    <div className="grid grid-cols-1 gap-1.5 w-full max-w-[84px] mx-auto">
                                      {(override?.durationPrices || r.durationPrices || []).map((dp) => (
                                        <div
                                          key={dp.hours}
                                          className={`flex items-center justify-between px-2 py-1 rounded-lg text-xs leading-tight ${
                                            hasOverride
                                              ? "bg-amber-50 text-amber-950 border border-amber-200/90 font-bold shadow-2xs"
                                              : "bg-slate-50/90 text-slate-700 border border-slate-200/80 font-semibold"
                                          }`}
                                        >
                                          <span className="text-slate-400 font-medium text-[11px]">{dp.hours}h</span>
                                          <span className="font-bold text-slate-900">{formatPaise(dp.pricePaise)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-400">—</span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center">
                                  {hasOverride ? (
                                    <div className="inline-flex flex-col items-center justify-center rounded-xl bg-amber-50 px-3 py-1 border border-amber-200/90 shadow-2xs">
                                      <div className="flex items-center gap-1">
                                        <span className="text-[#c89b3c] font-bold text-xs">★</span>
                                        <span className="text-sm font-extrabold text-amber-950">
                                          {prettyPrice(r, d)}
                                        </span>
                                      </div>
                                      <span className="text-[10px] font-semibold text-amber-700 mt-0.5">
                                        override
                                      </span>
                                    </div>
                                  ) : (
                                    <>
                                      <span className="text-sm sm:text-base font-extrabold text-slate-900 leading-tight">
                                        {prettyPrice(r, d)}
                                      </span>
                                      <span className="text-[11px] text-slate-400 font-medium mt-1">
                                        / night
                                      </span>
                                    </>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Matrix Footer */}
            <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
              <p>
                Prices exclude taxes and fees · Daily availability reflects lowest remaining units
              </p>
              <p className="text-slate-400 hidden sm:inline">
                Use bulk editor below to schedule price overrides
              </p>
            </div>
          </div>

          {/* Bulk Update Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void previewBulk();
            }}
            className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-[#c89b3c]">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#061224]">Update selected dates</h3>
                  <p className="text-xs text-slate-500">
                    Apply price overrides or adjust booking availability across a date range
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                      setRateId(e.target.value);
                      setDurationPrices(
                        rates.find((r) => r.id === e.target.value)
                          ?.durationPrices || [],
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

            {operation === "price" &&
              (selectedRate?.bookingMode === "hourly" ? (
                <div className="pt-2">
                  <DurationPriceEditor
                    key={rateId}
                    initialPrices={selectedRate.durationPrices}
                    onChange={setDurationPrices}
                  />
                </div>
              ) : (
                <label className="block text-xs font-semibold text-slate-700 sm:max-w-xs">
                  Nightly room price (₹)
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    className={`${inputClass} mt-1`}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </label>
              ))}

            <div className="flex items-center gap-3 pt-2">
              <button
                disabled={busy || !data.features.calendar}
                className={primary}
              >
                Preview changes
              </button>
              {!data.features.calendar && (
                <p className="text-xs text-amber-700">
                  Calendar editing is not enabled for this environment.
                </p>
              )}
            </div>
          </form>

        </>
      ) : (
        <>
          {/* Housekeeping Glanceable Counters */}
          {data.units.length > 0 && (() => {
            const cleanCount = data.units.filter(
              (u) =>
                u.housekeepingStatus === "clean" ||
                u.housekeepingStatus === "inspected",
            ).length;
            const dirtyCount = data.units.filter(
              (u) => u.housekeepingStatus === "dirty",
            ).length;
            const occupiedCount = data.units.filter((u) => u.occupied).length;

            return (
              <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
                <div className="grid grid-cols-2 divide-y divide-slate-100 sm:grid-cols-4 sm:divide-y-0 sm:divide-x">
                  {/* Total Rooms */}
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className={`group relative flex items-center justify-between p-4 sm:px-6 sm:py-4 text-left transition-all cursor-pointer ${
                      filter === "all"
                        ? "bg-slate-50/90"
                        : "hover:bg-slate-50/50"
                    }`}
                  >
                    <div>
                      <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Total Rooms
                      </span>
                      <span className="mt-1 block text-2xl sm:text-3xl font-black tracking-tight text-[#061224]">
                        {data.units.length}
                      </span>
                      <span className="text-[11px] font-medium text-slate-400 block mt-0.5">
                        Registered units
                      </span>
                    </div>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100/80 text-[#061224] transition-colors group-hover:bg-slate-200/70 shadow-2xs">
                      <Layers className="h-5 w-5" />
                    </div>
                    {filter === "all" && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#061224]" />
                    )}
                  </button>

                  {/* Ready / Clean */}
                  <button
                    type="button"
                    onClick={() => setFilter(filter === "clean" ? "all" : "clean")}
                    className={`group relative flex items-center justify-between p-4 sm:px-6 sm:py-4 text-left transition-all cursor-pointer ${
                      filter === "clean" || filter === "inspected"
                        ? "bg-emerald-50/40"
                        : "hover:bg-slate-50/50"
                    }`}
                  >
                    <div>
                      <span className="block text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                        Ready &amp; Clean
                      </span>
                      <span className="mt-1 block text-2xl sm:text-3xl font-black tracking-tight text-emerald-900">
                        {cleanCount}
                      </span>
                      <span className="text-[11px] font-medium text-emerald-700/80 block mt-0.5">
                        Guest ready
                      </span>
                    </div>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200/60 text-emerald-700 transition-colors group-hover:bg-emerald-100 shadow-2xs">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    {(filter === "clean" || filter === "inspected") && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />
                    )}
                  </button>

                  {/* Needs Cleaning */}
                  <button
                    type="button"
                    onClick={() => setFilter(filter === "dirty" ? "all" : "dirty")}
                    className={`group relative flex items-center justify-between p-4 sm:px-6 sm:py-4 text-left transition-all cursor-pointer ${
                      filter === "dirty"
                        ? "bg-amber-50/40"
                        : "hover:bg-slate-50/50"
                    }`}
                  >
                    <div>
                      <span
                        className={`block text-[11px] font-bold uppercase tracking-wider ${
                          dirtyCount > 0 ? "text-amber-800" : "text-slate-400"
                        }`}
                      >
                        Needs Cleaning
                      </span>
                      <span
                        className={`mt-1 block text-2xl sm:text-3xl font-black tracking-tight ${
                          dirtyCount > 0 ? "text-amber-900" : "text-slate-400"
                        }`}
                      >
                        {dirtyCount}
                      </span>
                      <span className="text-[11px] font-medium text-slate-400 block mt-0.5">
                        {dirtyCount > 0 ? "Pending turnover" : "All rooms cleaned"}
                      </span>
                    </div>
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors shadow-2xs ${
                        dirtyCount > 0
                          ? "bg-amber-50 border border-amber-200/80 text-amber-700 group-hover:bg-amber-100"
                          : "bg-slate-50 border border-slate-200/60 text-slate-400"
                      }`}
                    >
                      <AlertCircle className="h-5 w-5" />
                    </div>
                    {filter === "dirty" && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-600" />
                    )}
                  </button>

                  {/* Occupied */}
                  <button
                    type="button"
                    onClick={() => setFilter(filter === "occupied" ? "all" : "occupied")}
                    className={`group relative flex items-center justify-between p-4 sm:px-6 sm:py-4 text-left transition-all cursor-pointer ${
                      filter === "occupied"
                        ? "bg-slate-100/70"
                        : "hover:bg-slate-50/50"
                    }`}
                  >
                    <div>
                      <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Occupied
                      </span>
                      <span className="mt-1 block text-2xl sm:text-3xl font-black tracking-tight text-[#061224]">
                        {occupiedCount}
                      </span>
                      <span className="text-[11px] font-medium text-slate-400 block mt-0.5">
                        In-house guests
                      </span>
                    </div>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 border border-slate-200/80 text-slate-700 transition-colors group-hover:bg-slate-200/60 shadow-2xs">
                      <BedDouble className="h-5 w-5" />
                    </div>
                    {filter === "occupied" && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-800" />
                    )}
                  </button>
                </div>
              </div>
            );
          })()}

          {!data.units.length ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <DoorClosed className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-slate-900 text-base">No room numbers registered</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Add physical room numbers to track cleaning turnover, assign guests, and record housekeeping logs.
              </p>
              <button
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
              {/* Integrated Search & Filter Toolbar */}
              <div className="p-3.5 sm:px-5 sm:py-3.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white">
                <div className="flex flex-1 flex-wrap items-center gap-2.5 min-w-0">
                  <div className="relative flex-1 min-w-[200px] sm:max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <input
                      aria-label="Search room numbers"
                      placeholder="Search room number..."
                      className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white focus:bg-white pl-8.5 pr-8 text-xs font-medium outline-none focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/15 transition-all"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <select
                    aria-label="Housekeeping filter"
                    className="h-9 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white px-3 text-xs font-semibold text-slate-700 outline-none hover:border-slate-300 focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/15 transition-all cursor-pointer"
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
                </div>

                {/* Counter and Filter Reset */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200/70 px-2.5 py-1 text-slate-600 font-semibold text-[11px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    {
                      data.units.filter(
                        (u) =>
                          u.status === "active" &&
                          u.label.toLowerCase().includes(search.toLowerCase()) &&
                          (filter === "all" ||
                            (filter === "occupied" && u.occupied) ||
                            (filter === "maintenance" &&
                              data.blocks.some((b) => b.unitId === u.id)) ||
                            (filter === "clean"
                              ? u.housekeepingStatus === "clean" ||
                                u.housekeepingStatus === "inspected"
                              : filter === (u.housekeepingStatus || "unknown"))),
                      ).length
                    }{" "}
                    of {data.units.length} rooms
                  </span>
                  {filter !== "all" && (
                    <button
                      type="button"
                      onClick={() => setFilter("all")}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-slate-200 px-2.5 py-1 text-slate-700 text-[11px] font-semibold transition-colors"
                    >
                      Reset filter ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <th scope="col" className="py-3.5 px-5">Room</th>
                      <th scope="col" className="py-3.5 px-5">Room Type</th>
                      <th scope="col" className="py-3.5 px-5">Occupancy</th>
                      <th scope="col" className="py-3.5 px-5">Cleaning Status</th>
                      <th scope="col" className="py-3.5 px-5 hidden md:table-cell">Notes &amp; Updates</th>
                      <th scope="col" className="py-3.5 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {data.units
                      .filter(
                        (u) =>
                          u.status === "active" &&
                          u.label.toLowerCase().includes(search.toLowerCase()) &&
                          (filter === "all" ||
                            (filter === "occupied" && u.occupied) ||
                            (filter === "maintenance" &&
                              data.blocks.some((b) => b.unitId === u.id)) ||
                            (filter === "clean"
                              ? u.housekeepingStatus === "clean" ||
                                u.housekeepingStatus === "inspected"
                              : filter === (u.housekeepingStatus || "unknown"))),
                      )
                      .map((u) => {
                        const roomType = rooms.find((r) => r.id === u.roomTypeId);
                        const isClean =
                          u.housekeepingStatus === "clean" ||
                          u.housekeepingStatus === "inspected";
                        const isDirty = u.housekeepingStatus === "dirty";

                        return (
                          <tr
                            key={u.id}
                            className="hover:bg-slate-50/50 transition-colors group"
                          >
                            {/* Room Number */}
                            <td className="py-4 px-5 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 border border-slate-200/80 text-slate-700 font-mono text-xs font-bold shrink-0 shadow-2xs">
                                  <DoorClosed className="h-4 w-4 text-slate-500" />
                                </div>
                                <div>
                                  <h3 className="font-extrabold text-sm text-[#061224] tracking-tight">
                                    {u.label}
                                  </h3>
                                  <span className="text-[10px] text-slate-400 font-medium sm:hidden block mt-0.5">
                                    {roomType?.name || "Room Type"}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Room Type */}
                            <td className="py-4 px-5 whitespace-nowrap hidden sm:table-cell">
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200/70 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                <BedDouble className="h-3.5 w-3.5 text-slate-400" />
                                {roomType?.name || "Room Type"}
                              </span>
                            </td>

                            {/* Occupancy */}
                            <td className="py-4 px-5 whitespace-nowrap">
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
                            </td>

                            {/* Cleaning Status */}
                            <td className="py-4 px-5 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold border ${
                                  isDirty
                                    ? "bg-amber-50 text-amber-900 border-amber-200/80 shadow-2xs"
                                    : u.housekeepingStatus === "inspected"
                                      ? "bg-emerald-50 text-emerald-950 border-emerald-200/80 font-bold shadow-2xs"
                                      : isClean
                                        ? "bg-emerald-50/70 text-emerald-900 border-emerald-200/60"
                                        : "bg-slate-50 text-slate-600 border-slate-200/70"
                                }`}
                              >
                                {isDirty ? (
                                  <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                ) : u.housekeepingStatus === "inspected" || isClean ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                ) : (
                                  <Clock3 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                )}
                                <p className="capitalize inline m-0 p-0 font-semibold">
                                  {u.housekeepingStatus || "Unknown"}
                                </p>
                              </span>
                            </td>

                            {/* Notes & Updates */}
                            <td className="py-4 px-5 hidden md:table-cell text-xs text-slate-500">
                              <div className="space-y-0.5">
                                {u.housekeepingNote ? (
                                  <p className="font-medium text-slate-800 truncate max-w-xs text-xs italic">
                                    &ldquo;{u.housekeepingNote}&rdquo;
                                  </p>
                                ) : null}
                                {u.housekeepingUpdatedAt ? (
                                  <span className="text-[11px] text-slate-400 block font-normal">
                                    Updated{" "}
                                    {new Date(u.housekeepingUpdatedAt).toLocaleString(
                                      "en-IN",
                                      {
                                        timeZone: data.timezone,
                                        dateStyle: "short",
                                        timeStyle: "short",
                                      },
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-slate-300">—</span>
                                )}
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="py-4 px-5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  className="inline-flex h-8.5 items-center justify-center gap-1.5 rounded-xl bg-[#061224] hover:bg-[#0c1f3b] px-3.5 text-xs font-semibold text-white shadow-2xs active:scale-[0.98] transition-all disabled:opacity-40 whitespace-nowrap cursor-pointer"
                                  disabled={!data.features.housekeeping}
                                  onClick={() => {
                                    setEditingUnit(u);
                                    setMessage("");
                                    setHouseStatus(u.housekeepingStatus || "unknown");
                                    setNote(u.housekeepingNote || "");
                                  }}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5 text-[#c89b3c]" />
                                  Update cleaning
                                </button>
                                <button
                                  className="inline-flex h-8.5 items-center justify-center gap-1.5 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 hover:border-slate-300 px-3 text-xs font-semibold text-slate-700 shadow-2xs active:scale-[0.98] transition-all disabled:opacity-40 whitespace-nowrap cursor-pointer"
                                  disabled={!data.interval}
                                  onClick={() => {
                                    setRoomId(u.roomTypeId);
                                    setMaintenanceUnit(u.id);
                                    setQuantity(1);
                                    setMaintenanceKey(crypto.randomUUID());
                                    setMaintenanceOpen(true);
                                  }}
                                >
                                  <Wrench className="h-3.5 w-3.5 text-slate-400" />
                                  Maintenance
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {/* Table Footer */}
              <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Showing{" "}
                  {
                    data.units.filter(
                      (u) =>
                        u.status === "active" &&
                        u.label.toLowerCase().includes(search.toLowerCase()) &&
                        (filter === "all" ||
                          (filter === "occupied" && u.occupied) ||
                          (filter === "maintenance" &&
                            data.blocks.some((b) => b.unitId === u.id)) ||
                          (filter === "clean"
                            ? u.housekeepingStatus === "clean" ||
                              u.housekeepingStatus === "inspected"
                            : filter === (u.housekeepingStatus || "unknown"))),
                    ).length
                  }{" "}
                  of {data.units.length} registered room units
                </span>
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  Timezone: {data.timezone}
                </span>
              </div>
            </div>
          )}
        </>
      )}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-[#c89b3c]">
              <Wrench className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#061224]">Active maintenance blocks</h3>
              <p className="text-xs text-slate-500">
                Capacity held back from guest reservations for repairs or upkeep
              </p>
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
            {data.blocks.length} {data.blocks.length === 1 ? "block" : "blocks"}
          </span>
        </div>
        {!data.blocks.length ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
            <p className="text-sm text-slate-500">
              No active maintenance blocks. All rooms are open for reservations according to calendar rates.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.blocks.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 text-sm hover:bg-slate-50 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{b.reason}</span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.2 text-[10px] font-bold text-amber-800">
                      {b.quantity} room(s)
                    </span>
                    <span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200">
                      {b.unitId
                        ? data.units.find((u) => u.id === b.unitId)?.label
                        : rooms.find((r) => r.id === b.roomTypeId)?.name}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {new Date(b.startAt).toLocaleString("en-IN", {
                      timeZone: data.timezone,
                    })}{" "}
                    –{" "}
                    {new Date(b.endAt).toLocaleString("en-IN", {
                      timeZone: data.timezone,
                    })}
                  </p>
                </div>
                <button
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
          <p>
            {preview?.cells.length} date cells will be updated. Confirm within
            five minutes.
          </p>
          <ul className="max-h-96 space-y-2 overflow-auto text-sm">
            {preview?.cells.map((c) => (
              <li
                key={`${c.ratePlanId || c.roomTypeId}:${c.date}`}
                className="rounded-xl bg-slate-50 p-3"
              >
                <strong>
                  {c.date} · {rooms.find((r) => r.id === c.roomTypeId)?.name}
                </strong>
                <p>
                  {c.ratePlanId
                    ? `${rates.find((r) => r.id === c.ratePlanId)?.name}: ${c.clearPrice ? "Restore base price" : c.durationPrices ? c.durationPrices.map((p) => `${p.hours} hours ${formatPaise(p.pricePaise)}`).join(", ") : formatPaise(c.basePricePaise || 0)}`
                    : c.stopSell
                      ? "Close sales"
                      : "Reopen sales"}
                </p>
              </li>
            ))}
          </ul>
          <button
            disabled={busy}
            className={primary}
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
          {message && (
            <p role="status" className="text-sm text-amber-800">
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
          <label className="block text-sm">
            Status
            <select
              className={inputClass}
              aria-label="Status"
              value={houseStatus}
              onChange={(e) => setHouseStatus(e.target.value)}
            >
              {["unknown", "dirty", "clean", "inspected"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Note
            <textarea
              maxLength={500}
              className={`${inputClass} !h-24 py-2`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button disabled={busy} className={primary}>
            Save cleaning status
          </button>
          {message && (
            <p role="status" className="text-sm text-amber-800">
              {message}
            </p>
          )}
          <section className="space-y-2">
            <h3 className="font-semibold">Recent cleaning history</h3>
            {history.isPending ? (
              <p>Loading history…</p>
            ) : history.isError ? (
              <button type="button" onClick={() => void history.refetch()}>
                Retry history
              </button>
            ) : !history.data?.events?.length ? (
              <p className="text-sm text-slate-500">No recorded changes yet.</p>
            ) : (
              history.data.events.map((event) => (
                <p
                  key={event.id}
                  className="rounded-xl bg-slate-50 p-3 text-sm"
                >
                  {event.status}{" "}
                  {event.createdAt
                    ? `· ${new Date(event.createdAt).toLocaleString("en-IN", { timeZone: data.timezone })}`
                    : ""}
                  {event.note ? ` · ${event.note}` : ""}
                </p>
              ))
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
