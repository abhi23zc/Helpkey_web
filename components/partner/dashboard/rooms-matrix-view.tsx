"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPaise } from "@/lib/currency";
import { requestJson } from "@/lib/partner/upload-client";
import type { ListingRoomType, ListingRatePlan } from "./use-property-listing";
import type { RoomsWorkspace } from "./rooms-operations";
import { ManualBookingDialog } from "./manual-booking-dialog";
import {
  RoomStayDetailsModal,
  type StayDetails,
} from "./room-stay-details-modal";
import {
  reservationUrl,
  type WorkspaceSection,
} from "./reservation-navigation";
import { PhysicalRoomRegister } from "./reservation-operations";
import { useHotelCapabilities } from "./hotel-capabilities";
import {
  BedDouble,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  DoorClosed,
  Grid3X3,
  LayoutGrid,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  Search,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";

type Unit = RoomsWorkspace["units"][number];

type Props = {
  propertyId: string;
  propertyName: string;
  date: string;
  onDateChange: (date: string) => void;
  data: RoomsWorkspace;
  rooms: ListingRoomType[];
  rates: ListingRatePlan[];
  refresh: () => Promise<unknown>;
};

function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "G";
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getFloorName(label: string, explicitFloor?: number | string): string {
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
    if (num.length >= 3) {
      return `Floor ${num.slice(0, -2)}`;
    }
    return `Floor ${num[0]}`;
  }
  return "Main Level";
}

function shiftDay(dateStr: string, offset: number): string {
  const d = new Date(Date.parse(`${dateStr}T00:00:00Z`));
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function formatHeadingDate(dateStr: string) {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    const now = new Date();
    const isToday =
      dateObj.getUTCFullYear() === now.getFullYear() &&
      dateObj.getUTCMonth() === now.getMonth() &&
      dateObj.getUTCDate() === now.getDate();

    const formatted = dateObj.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });

    return isToday ? `Today · ${formatted}` : formatted;
  } catch {
    return dateStr;
  }
}

export function RoomsMatrixView({
  propertyId,
  propertyName,
  date,
  onDateChange,
  data,
  rooms,
  rates,
  refresh,
}: Props) {
  const router = useRouter();
  const permits = useHotelCapabilities();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<
    "all" | "vacant" | "occupied" | "dirty" | "checkout_today"
  >("all");

  const [registerOpen, setRegisterOpen] = useState(false);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [walkInUnit, setWalkInUnit] = useState<{
    unitId: string;
    roomTypeId: string;
  } | null>(null);
  const [selectedStay, setSelectedStay] = useState<{
    unitLabel: string;
    roomTypeName: string;
    stay: StayDetails;
  } | null>(null);
  const [cleaningUnitId, setCleaningUnitId] = useState<string | null>(null);

  // Map room types with their active price (overnight vs hourly, with date override support)
  const roomTypePriceMap = useMemo(() => {
    const map = new Map<string, string>();
    rooms.forEach((r) => {
      const activeRates = rates.filter(
        (rp) => rp.roomTypeId === r.id && rp.status === "active",
      );
      if (activeRates.length === 0) return;

      // Prefer overnight rate plans
      const overnightPlans = activeRates.filter((rp) => rp.bookingMode !== "hourly");
      if (overnightPlans.length > 0) {
        let minPrice = Infinity;
        overnightPlans.forEach((rp) => {
          const override = data.prices?.find(
            (p) => p.ratePlanId === rp.id && p.date === date && p.basePricePaise != null,
          );
          const price = override?.basePricePaise ?? rp.basePricePaise;
          if (price && price < minPrice) minPrice = price;
        });
        if (minPrice !== Infinity) {
          map.set(r.id, `${formatPaise(minPrice)}/n`);
          return;
        }
      }

      // Fallback to hourly rate plans
      const hourlyPlans = activeRates.filter((rp) => rp.bookingMode === "hourly");
      if (hourlyPlans.length > 0) {
        let minPrice = Infinity;
        let hours = 2;
        hourlyPlans.forEach((rp) => {
          const firstDuration = rp.durationPrices?.[0];
          const price = firstDuration?.pricePaise ?? rp.basePricePaise;
          if (firstDuration?.hours) hours = firstDuration.hours;
          if (price && price < minPrice) minPrice = price;
        });
        if (minPrice !== Infinity) {
          map.set(r.id, `${formatPaise(minPrice)}/${hours}h`);
        }
      }
    });
    return map;
  }, [rooms, rates, data.prices, date]);

  const handleQuickMarkClean = async (e: React.MouseEvent, unit: Unit) => {
    e.stopPropagation();
    if (cleaningUnitId) return;
    setCleaningUnitId(unit.id);
    try {
      await requestJson(
        `/api/partner/properties/${propertyId}/rooms-workspace`,
        {
          action: "housekeeping",
          input: {
            unitId: unit.id,
            revision: unit.revision,
            status: "clean",
            note: "Marked clean from Live Room Board",
          },
        },
      );
      await refresh();
    } catch (err) {
      console.error("Failed to mark room clean:", err);
    } finally {
      setCleaningUnitId(null);
    }
  };

  // Active units (exclude archived and deactivated)
  const activeUnits = useMemo(() => {
    return (data.units || []).filter(
      (u) => u.status !== "archived" && u.status !== "inactive",
    );
  }, [data.units]);

  // Map units currently blocked for maintenance on this date
  const unitMaintenanceMap = useMemo(() => {
    const map = new Map<string, RoomsWorkspace["blocks"][number]>();
    const dateStart = Date.parse(`${date}T00:00:00Z`);
    const dateEnd = Date.parse(`${date}T23:59:59Z`);

    (data.blocks || []).forEach((b) => {
      if (!b.unitId) return;
      const bStart = Date.parse(b.startAt);
      const bEnd = Date.parse(b.endAt);
      if (dateEnd >= bStart && dateStart <= bEnd) {
        map.set(b.unitId, b);
      }
    });
    return map;
  }, [data.blocks, date]);

  // Compute live KPIs
  const stats = useMemo(() => {
    let vacant = 0;
    let occupied = 0;
    let checkoutToday = 0;
    let checkoutTomorrow = 0;
    let dirty = 0;
    let clean = 0;

    const tomorrow = shiftDay(date, 1);

    activeUnits.forEach((u) => {
      const isOccupied =
        u.occupied ||
        (u.currentStay && u.currentStay.bookingStatus === "checked_in");
      if (isOccupied) {
        occupied++;
        if (u.currentStay?.checkOut === date) checkoutToday++;
        if (u.currentStay?.checkOut === tomorrow) checkoutTomorrow++;
      } else {
        vacant++;
      }

      const isClean =
        u.housekeepingStatus === "clean" ||
        u.housekeepingStatus === "inspected";
      if (isClean) {
        clean++;
      } else if (u.housekeepingStatus === "dirty") {
        dirty++;
      }
    });

    return {
      vacant,
      occupied,
      checkoutToday,
      checkoutTomorrow,
      dirty,
      clean,
      total: activeUnits.length,
    };
  }, [activeUnits, date]);

  // Filter units
  const filteredUnits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeUnits.filter((u) => {
      if (filterType !== "all" && u.roomTypeId !== filterType) return false;

      const isOccupied =
        u.occupied ||
        (u.currentStay && u.currentStay.bookingStatus === "checked_in");
      if (filterStatus === "vacant" && isOccupied) return false;
      if (filterStatus === "occupied" && !isOccupied) return false;
      if (filterStatus === "dirty" && u.housekeepingStatus !== "dirty")
        return false;
      if (filterStatus === "checkout_today") {
        if (!isOccupied || u.currentStay?.checkOut !== date) return false;
      }

      if (q) {
        const matchesLabel = u.label.toLowerCase().includes(q);
        const matchesGuest =
          u.currentStay?.guestName.toLowerCase().includes(q) ||
          u.upcomingStay?.guestName.toLowerCase().includes(q);
        const matchesRef =
          u.currentStay?.confirmationCode.toLowerCase().includes(q) ||
          u.upcomingStay?.confirmationCode.toLowerCase().includes(q);
        const matchesPhone =
          u.currentStay?.guestPhone?.toLowerCase().includes(q) ||
          u.upcomingStay?.guestPhone?.toLowerCase().includes(q);
        if (!matchesLabel && !matchesGuest && !matchesRef && !matchesPhone)
          return false;
      }

      return true;
    });
  }, [activeUnits, filterType, filterStatus, search, date]);

  // Group filtered units by floor
  const floorGroups = useMemo(() => {
    const map = new Map<string, Unit[]>();
    filteredUnits.forEach((u) => {
      const floor = getFloorName(u.label, u.floor);
      const list = map.get(floor) || [];
      list.push(u);
      map.set(floor, list);
    });

    const sortedKeys = Array.from(map.keys()).sort((a, b) => {
      if (a === "Basement") return -1;
      if (b === "Basement") return 1;
      if (a === "Ground Floor") return -1;
      if (b === "Ground Floor") return 1;
      const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
      return numA - numB;
    });

    return sortedKeys.map((floor) => {
      const units = (map.get(floor) || []).sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { numeric: true }),
      );
      return { floor, units };
    });
  }, [filteredUnits]);

  const handleUnitClick = (unit: Unit, roomType?: ListingRoomType) => {
    const isOccupied =
      unit.occupied ||
      (unit.currentStay && unit.currentStay.bookingStatus === "checked_in");

    if (isOccupied && unit.currentStay) {
      setSelectedStay({
        unitLabel: unit.label,
        roomTypeName: roomType?.name || "Room",
        stay: unit.currentStay as StayDetails,
      });
    } else {
      if (permits("reservation.create")) {
        setWalkInUnit({
          unitId: unit.id,
          roomTypeId: unit.roomTypeId,
        });
      }
    }
  };

  const handleOpenStaySection = (section: WorkspaceSection) => {
    if (!selectedStay) return;
    const url = reservationUrl(
      window.location.href,
      propertyId,
      selectedStay.stay.bookingId,
      section,
    );
    setSelectedStay(null);
    router.replace(url);
  };

  const canBook = permits("reservation.create");

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
        {(
          [
            {
              status: "vacant",
              title: "Vacant Rooms",
              count: stats.vacant,
              detail: `/ ${stats.total}`,
              note: "Ready for Check-In",
              Icon: DoorClosed,
            },
            {
              status: "occupied",
              title: "Occupied",
              count: stats.occupied,
              detail: "in-house",
              note: "Active Guest Stays",
              Icon: BedDouble,
            },
            {
              status: "checkout_today",
              title: "Checkout Today",
              count: stats.checkoutToday,
              detail: "departures",
              note: `${stats.checkoutTomorrow} Due Tomorrow`,
              Icon: LogOut,
            },
            {
              status: "dirty",
              title: "Housekeeping",
              count: stats.dirty,
              detail: `dirty / ${stats.clean} clean`,
              note:
                stats.dirty === 0 ? "No dirty rooms" : "Turnover needed",
              Icon: Sparkles,
            },
          ] as const
        ).map(({ status, title, count, detail, note, Icon }) => {
          const selected = filterStatus === status;
          return (
            <button
              key={status}
              type="button"
              aria-pressed={selected}
              onClick={() => setFilterStatus(selected ? "all" : status)}
              className={`group flex items-center justify-between gap-3 rounded-2xl border p-4 sm:p-5 text-left transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c] ${
                selected
                  ? "border-[#061224] bg-[#061224]/[0.03] ring-1 ring-[#061224]/25 shadow-xs"
                  : "border-slate-200/85 bg-white hover:border-slate-300 hover:shadow-xs shadow-2xs"
              }`}
            >
              <div className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                  {title}
                </span>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-[28px] sm:text-[30px] font-bold tracking-[-0.025em] leading-none tabular-nums text-[#061224]">
                    {count}
                  </span>
                  <span className="text-xs font-medium tabular-nums text-slate-500 truncate">
                    {detail}
                  </span>
                </div>
                <span className="mt-1.5 block text-xs font-medium text-slate-500">
                  {note}
                </span>
              </div>
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                  selected
                    ? "border-[#061224] bg-[#061224] text-white"
                    : "border-slate-200/70 bg-slate-50 text-slate-600 group-hover:border-slate-300 group-hover:text-[#061224]"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
              </div>
            </button>
          );
        })}
      </div>

      {/* 2. TOOLBAR: DATE NAVIGATOR, SEARCH & CATEGORY FILTERS */}
      <div className="flex flex-col gap-3.5 rounded-2xl border border-slate-200/85 bg-white p-4 shadow-2xs">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Grouped Date Selector Navigation */}
          <div className="inline-flex w-fit items-center rounded-xl border border-slate-200/90 bg-slate-50/70 p-0.5 shadow-2xs">
            <button
              type="button"
              title="Previous Day"
              aria-label="Previous day"
              onClick={() => onDateChange(shiftDay(date, -1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-white hover:text-[#061224] hover:shadow-2xs transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#c89b3c]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() =>
                onDateChange(new Date().toISOString().slice(0, 10))
              }
              className="inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-[13px] font-semibold tracking-[-0.005em] text-[#061224] hover:bg-white hover:shadow-2xs transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#c89b3c]"
            >
              <Calendar className="h-3.5 w-3.5 text-[#c89b3c]" />
              <span className="tabular-nums">{formatHeadingDate(date)}</span>
            </button>

            <button
              type="button"
              onClick={() => onDateChange(shiftDay(date, 1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-white hover:text-[#061224] hover:shadow-2xs transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#c89b3c]"
              title="Next Day"
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Quick Search Input & Density Toggle */}
          <div className="flex flex-1 items-center justify-end gap-2.5">
            <div className="relative flex-1 md:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search room #, guest, phone..."
                className="h-9 w-full rounded-xl border border-slate-200/90 bg-slate-50/40 hover:bg-white focus:bg-white pl-9 pr-8 text-[13px] font-medium text-[#061224] placeholder-slate-400 outline-none transition-all focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/15"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Density Selector */}
            <div
              role="group"
              aria-label="Room board view density"
              className="inline-flex shrink-0 items-center rounded-xl border border-slate-200/90 bg-slate-50/70 p-0.5 shadow-2xs"
            >
              <button
                type="button"
                onClick={() => setDensity("comfortable")}
                title="Comfortable Cards"
                aria-pressed={density === "comfortable"}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-all cursor-pointer ${
                  density === "comfortable"
                    ? "bg-white text-[#061224] shadow-2xs"
                    : "text-slate-500 hover:text-[#061224]"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setDensity("compact")}
                title="Compact Grid"
                aria-pressed={density === "compact"}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-all cursor-pointer ${
                  density === "compact"
                    ? "bg-white text-[#061224] shadow-2xs"
                    : "text-slate-500 hover:text-[#061224]"
                }`}
              >
                <Grid3X3 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Compact</span>
              </button>
            </div>
          </div>
        </div>

        {/* Category & Status Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400 mr-0.5 hidden sm:inline">
            Filters
          </span>

          <button
            type="button"
            onClick={() => {
              setFilterType("all");
              setFilterStatus("all");
            }}
            className={`inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c] ${
              filterType === "all" && filterStatus === "all"
                ? "border-[#061224] bg-[#061224] text-white shadow-2xs"
                : "border-slate-200/80 bg-slate-50/80 text-slate-700 hover:border-slate-300 hover:bg-slate-100"
            }`}
          >
            <span>All Rooms</span>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none ${
                filterType === "all" && filterStatus === "all"
                  ? "bg-white/15 text-white"
                  : "bg-white text-slate-600"
              }`}
            >
              {activeUnits.length}
            </span>
          </button>

          {rooms.map((r) => {
            const count = activeUnits.filter(
              (u) => u.roomTypeId === r.id,
            ).length;
            const isSelected = filterType === r.id;
            const price = roomTypePriceMap.get(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setFilterType(isSelected ? "all" : r.id)}
                className={`inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c] ${
                  isSelected
                    ? "border-[#c89b3c] bg-[#fbf3df] text-[#061224] shadow-2xs"
                    : "border-slate-200/80 bg-slate-50/80 text-slate-700 hover:border-slate-300 hover:bg-slate-100"
                }`}
              >
                <span>{r.name}</span>
                {price && (
                  <span
                    className={`text-[11px] font-medium tabular-nums ${
                      isSelected ? "text-[#755a1a]" : "text-slate-500"
                    }`}
                  >
                    {price}
                  </span>
                )}
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none ${
                    isSelected
                      ? "bg-[#c89b3c]/25 text-[#061224]"
                      : "bg-white text-slate-600"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}

          <div className="ml-auto flex items-center gap-1.5">
            {filterStatus !== "all" && (
              <button
                type="button"
                onClick={() => setFilterStatus("all")}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-2.5 text-xs font-semibold text-slate-600 hover:text-[#061224] transition-colors cursor-pointer"
              >
                <span>Reset status</span>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. FLOOR-BY-FLOOR PMS ROOM BOARD */}
      {floorGroups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <DoorClosed className="mx-auto h-11 w-11 text-slate-300" />
          <h3 className="mt-3 text-base font-bold tracking-[-0.01em] text-[#061224]">
            {activeUnits.length === 0
              ? "No physical rooms registered"
              : "No rooms match your filter"}
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500 max-w-sm mx-auto">
            {activeUnits.length === 0
              ? "Add physical room numbers to unlock the live front-desk room board and manage guest check-ins."
              : "Try clearing search keywords or changing room category filters."}
          </p>
          {activeUnits.length === 0 && permits("rooms.manage") && (
            <button
              type="button"
              onClick={() => setRegisterOpen(true)}
              className="mt-4 inline-flex h-9 items-center gap-2 rounded-xl bg-[#061224] px-4 text-[13px] font-semibold text-white shadow-xs hover:bg-[#0c1f3b] transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Register Room Numbers</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-7">
          {floorGroups.map(({ floor, units }) => {
            const floorOccupied = units.filter(
              (u) =>
                u.occupied ||
                (u.currentStay && u.currentStay.bookingStatus === "checked_in"),
            ).length;
            const floorVacant = units.length - floorOccupied;

            return (
              <section key={floor} className="space-y-3.5">
                {/* Architectural Floor Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="h-5 w-1 rounded-full bg-[#c89b3c]" />
                    <h2 className="text-base sm:text-[17px] font-bold tracking-[-0.015em] text-[#061224]">
                      {floor}
                    </h2>
                    <span className="rounded-full border border-slate-200/70 bg-white px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
                      {units.length} {units.length === 1 ? "Room" : "Rooms"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-semibold tabular-nums">
                    <span className="rounded-full bg-[#eef8f3] text-[#164e3b] border border-[#c6e7d7] px-2.5 py-0.5">
                      {floorVacant} Available
                    </span>
                    <span className="rounded-full bg-[#fdf2f2] text-[#991b1b] border border-[#fecaca] px-2.5 py-0.5">
                      {floorOccupied} Occupied
                    </span>
                  </div>
                </div>

                {/* Rooms Grid (PMS Visual Tiles: Comfortable vs Compact) */}
                {density === "compact" ? (
                  <div className="grid grid-cols-2 min-[420px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2.5">
                    {units.map((unit) => {
                      const roomType = rooms.find(
                        (r) => r.id === unit.roomTypeId,
                      );
                      const isOccupied =
                        unit.occupied ||
                        (unit.currentStay &&
                          unit.currentStay.bookingStatus === "checked_in");
                      const isDirty = unit.housekeepingStatus === "dirty";
                      const price = roomTypePriceMap.get(unit.roomTypeId);
                      const cleaningLabel =
                        unit.housekeepingStatus === "inspected"
                          ? "Inspected"
                          : unit.housekeepingStatus === "clean"
                            ? "Clean"
                            : "Unknown";
                      const stay = unit.currentStay;
                      const maintenanceBlock = unitMaintenanceMap.get(unit.id);

                      /* Compact Maintenance */
                      if (maintenanceBlock) {
                        return (
                          <div
                            key={unit.id}
                            className="group relative flex flex-col justify-between rounded-xl border border-slate-300 border-l-[3.5px] border-l-slate-600 bg-slate-100/90 p-2.5 text-left shadow-2xs min-h-[88px]"
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className="text-[15px] font-bold tabular-nums text-slate-800 leading-tight">
                                {unit.label}
                              </span>
                              <Wrench className="h-3.5 w-3.5 text-slate-600 shrink-0 mt-0.5" />
                            </div>
                            <div className="min-w-0 my-1">
                              <p className="text-xs font-bold text-slate-700 truncate leading-tight">
                                Maintenance
                              </p>
                              <p className="text-[11px] font-medium text-slate-500 truncate mt-0.5">
                                {maintenanceBlock.reason || roomType?.name || "Blocked"}
                              </p>
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-medium text-slate-500 border-t border-slate-200 pt-1">
                              <span className="text-slate-600 font-semibold truncate">Out of Order</span>
                              <span className="text-slate-400 font-medium">Blocked</span>
                            </div>
                          </div>
                        );
                      }

                      /* Compact Occupied */
                      if (isOccupied && stay) {
                        return (
                          <div
                            key={unit.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleUnitClick(unit, roomType)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleUnitClick(unit, roomType);
                              }
                            }}
                            className="group relative flex flex-col justify-between rounded-xl border border-rose-200/90 border-l-[3.5px] border-l-rose-600 bg-[#fdf2f2] p-2.5 text-left shadow-2xs hover:border-rose-400 hover:shadow-xs transition-all cursor-pointer min-h-[88px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#c89b3c]"
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className="text-[15px] font-bold tabular-nums text-[#991b1b] leading-tight">
                                {unit.label}
                              </span>
                              <span
                                className="h-2 w-2 rounded-full bg-rose-500 shrink-0 mt-0.5"
                                title="Occupied"
                              />
                            </div>
                            <div className="min-w-0 my-1">
                              <p className="text-xs font-bold text-[#7f1d1d] truncate leading-tight">
                                {stay.guestName}
                              </p>
                              <p className="text-[11px] font-medium text-[#b91c1c] truncate tabular-nums mt-0.5">
                                {stay.checkOut === date
                                  ? "Due Out Today"
                                  : `Out: ${stay.checkOut.slice(5)}`}
                              </p>
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-medium text-[#991b1b]/80 border-t border-rose-200/60 pt-1">
                              <span className="truncate">
                                {roomType?.name || "Room"}
                              </span>
                              <span className="font-semibold text-rose-800">
                                {stay.balanceDuePaise > 0 ? "Due" : "Paid"}
                              </span>
                            </div>
                          </div>
                        );
                      }

                      /* Compact Dirty */
                      if (isDirty) {
                        return (
                          <div
                            key={unit.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleUnitClick(unit, roomType)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleUnitClick(unit, roomType);
                              }
                            }}
                            className="group relative flex flex-col justify-between rounded-xl border border-amber-200/90 border-l-[3.5px] border-l-amber-600 bg-[#fffbeb] p-2.5 text-left shadow-2xs hover:border-amber-400 hover:shadow-xs transition-all cursor-pointer min-h-[88px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#c89b3c]"
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className="text-[15px] font-bold tabular-nums text-[#92400e] leading-tight">
                                {unit.label}
                              </span>
                              <span
                                className="h-2 w-2 rounded-full bg-amber-500 shrink-0 mt-0.5"
                                title="Needs Cleaning"
                              />
                            </div>
                            <div className="min-w-0 my-1">
                              <p className="text-xs font-bold text-[#92400e] leading-tight">
                                Needs Turnover
                              </p>
                              <p className="text-[11px] font-medium text-[#b45309] truncate mt-0.5">
                                {roomType?.name || "Room"}
                              </p>
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-medium text-[#92400e]/80 border-t border-amber-200/60 pt-1">
                              {data.features.housekeeping ? (
                                <button
                                  type="button"
                                  disabled={cleaningUnitId === unit.id}
                                  onClick={(e) => handleQuickMarkClean(e, unit)}
                                  title="Mark clean"
                                  className="relative z-10 inline-flex items-center gap-1 rounded bg-amber-200/70 hover:bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 hover:text-emerald-900 transition-colors cursor-pointer"
                                >
                                  {cleaningUnitId === unit.id ? (
                                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                  ) : (
                                    <Check className="h-2.5 w-2.5 text-emerald-700" />
                                  )}
                                  <span>Clean</span>
                                </button>
                              ) : (
                                <span className="text-amber-800 font-semibold">Dirty</span>
                              )}
                              {canBook && (
                                <span className="font-semibold text-[#92400e] group-hover:underline">
                                  + Book
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      }

                      /* Compact Available */
                      const upcoming = unit.upcomingStay;
                      const isArrivalToday = upcoming && upcoming.checkIn === date;

                      return (
                        <div
                          key={unit.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (isArrivalToday && upcoming) {
                              router.replace(
                                reservationUrl(
                                  window.location.href,
                                  propertyId,
                                  upcoming.bookingId,
                                  "assignment",
                                ),
                              );
                            } else {
                              handleUnitClick(unit, roomType);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              if (isArrivalToday && upcoming) {
                                router.replace(
                                  reservationUrl(
                                    window.location.href,
                                    propertyId,
                                    upcoming.bookingId,
                                    "assignment",
                                  ),
                                );
                              } else {
                                handleUnitClick(unit, roomType);
                              }
                            }
                          }}
                          className={`group relative flex flex-col justify-between rounded-xl border border-l-[3.5px] p-2.5 text-left shadow-2xs hover:shadow-xs transition-all cursor-pointer min-h-[88px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#c89b3c] ${
                            isArrivalToday
                              ? "border-amber-200/90 border-l-amber-500 bg-[#fefcf8] hover:border-amber-300"
                              : "border-slate-200/85 border-l-emerald-600 bg-white hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-[15px] font-bold tabular-nums text-[#061224] leading-tight group-hover:text-[#0b1f3a]">
                              {unit.label}
                            </span>
                            <span
                              className={`h-2 w-2 rounded-full shrink-0 mt-0.5 ${
                                isArrivalToday ? "bg-amber-500" : "bg-emerald-500"
                              }`}
                              title={isArrivalToday ? "Arriving Today" : "Available"}
                            />
                          </div>
                          <div className="min-w-0 my-1">
                            <p className="text-xs font-medium text-slate-700 truncate leading-tight">
                              {roomType?.name || "Room"}
                            </p>
                            {isArrivalToday ? (
                              <p className="text-[11px] font-bold text-amber-800 truncate mt-0.5 inline-flex items-center gap-1">
                                <LogIn className="h-2.5 w-2.5 text-amber-600 shrink-0" />
                                <span className="truncate">{upcoming.guestName.split(" ")[0]}</span>
                              </p>
                            ) : (
                              <p className="text-[11px] font-medium text-slate-400 tabular-nums truncate mt-0.5">
                                {price || "Ready"}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-[10px] font-medium text-slate-400 border-t border-slate-100 pt-1">
                            <span
                              className={`font-semibold truncate ${
                                isArrivalToday ? "text-amber-800" : "text-emerald-700"
                              }`}
                            >
                              {isArrivalToday ? "Arr Today" : cleaningLabel}
                            </span>
                            {isArrivalToday ? (
                              <span className="text-amber-900 font-bold group-hover:underline">
                                Check In
                              </span>
                            ) : canBook ? (
                              <span className="text-[#061224] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                                + Book
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {units.map((unit) => {
                      const roomType = rooms.find(
                        (r) => r.id === unit.roomTypeId,
                      );
                      const isOccupied =
                        unit.occupied ||
                        (unit.currentStay &&
                          unit.currentStay.bookingStatus === "checked_in");
                      const isDirty = unit.housekeepingStatus === "dirty";
                      const price = roomTypePriceMap.get(unit.roomTypeId);
                      const cleaningLabel =
                        unit.housekeepingStatus === "inspected"
                          ? "Inspected"
                          : unit.housekeepingStatus === "clean"
                            ? "Clean & Ready"
                            : "Status unknown";

                      const stay = unit.currentStay;
                      const maintenanceBlock = unitMaintenanceMap.get(unit.id);

                      /* ---------------- UNDER MAINTENANCE TILE (Slate / Blocked) ---------------- */
                      if (maintenanceBlock) {
                        return (
                          <article
                            key={unit.id}
                            className="group relative flex flex-col justify-between rounded-2xl bg-slate-50 border border-slate-200 border-l-[4.5px] border-l-slate-600 p-4 text-left shadow-2xs min-h-[164px]"
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-2xl font-bold tracking-[-0.025em] leading-none tabular-nums text-slate-800">
                                  {unit.label}
                                </span>
                                <span className="inline-flex max-w-[140px] truncate items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 tabular-nums">
                                  <span className="truncate">{roomType?.name || "Room"}</span>
                                </span>
                              </div>

                              <div className="mt-3.5 space-y-1.5">
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 text-slate-800 border border-slate-300 px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.02em]">
                                  <Wrench className="h-3 w-3 text-slate-700" />
                                  Under Maintenance
                                </span>
                                <p className="text-xs text-slate-600 font-medium truncate">
                                  {maintenanceBlock.reason || "Scheduled maintenance"}
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-200 pt-3">
                              <span className="text-xs font-semibold text-slate-600">
                                Out of Order
                              </span>
                              <span className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white/70 px-3 text-xs font-semibold text-slate-400 shadow-2xs cursor-not-allowed">
                                Blocked
                              </span>
                            </div>
                          </article>
                        );
                      }

                      /* ---------------- OCCUPIED ROOM TILE (Warm Pastel Coral / Rose) ---------------- */
                      if (isOccupied && stay) {
                        const initials = toInitials(stay.guestName);
                        const isDepartingToday = stay.checkOut === date;
                        const hasBalance = stay.balanceDuePaise > 0;

                        return (
                          <article
                            key={unit.id}
                            className="group relative flex flex-col justify-between rounded-2xl bg-[#fdf2f2] border border-[#fecaca] border-l-[4.5px] border-l-[#dc2626] p-4 text-left shadow-2xs hover:border-[#f87171] hover:shadow-xs transition-all duration-150 min-h-[164px]"
                          >
                            {/* Top: Room Number & Room Type tag */}
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-2xl font-bold tracking-[-0.025em] leading-none tabular-nums text-[#991b1b] group-hover:text-[#7f1d1d] transition-colors">
                                  {unit.label}
                                </span>
                                <span className="inline-flex max-w-[130px] truncate items-center rounded-md bg-white/80 border border-[#fecaca]/90 px-2 py-0.5 text-[11px] font-semibold text-[#991b1b]">
                                  {roomType?.name || "Room"}
                                </span>
                              </div>

                              {/* Guest Details */}
                              <div className="mt-3.5 flex items-center gap-2.5">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#991b1b] text-white font-semibold text-xs shadow-2xs">
                                  {initials}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[13px] font-bold text-[#7f1d1d] truncate leading-snug">
                                    {stay.guestName}
                                  </p>
                                  <p className="text-xs font-medium text-[#b91c1c] mt-0.5 tabular-nums">
                                    {isDepartingToday ? (
                                      <span className="font-semibold text-[#991b1b] inline-flex items-center gap-1">
                                        <Clock className="h-3 w-3 text-[#b91c1c]" />{" "}
                                        Due Out Today
                                      </span>
                                    ) : (
                                      `Out: ${stay.checkOut.slice(5)}`
                                    )}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Footer */}
                            <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#fecaca]/80 pt-3">
                              <span className="font-mono text-[11px] font-medium text-[#991b1b]/90 truncate">
                                #{stay.confirmationCode}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUnitClick(unit, roomType)}
                                className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-[#fecaca] bg-white px-2.5 text-xs font-semibold tabular-nums text-[#991b1b] shadow-2xs group-hover:border-[#991b1b] group-hover:bg-[#991b1b] group-hover:text-white transition-colors cursor-pointer after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c]"
                              >
                                {hasBalance
                                  ? `${formatPaise(stay.balanceDuePaise)} due`
                                  : "View Stay"}
                              </button>
                            </div>
                          </article>
                        );
                      }

                      /* ---------------- DIRTY / HOUSEKEEPING TILE (Warm Pastel Honey) ---------------- */
                      if (isDirty) {
                        return (
                          <article
                            key={unit.id}
                            className="group relative flex flex-col justify-between rounded-2xl bg-[#fffbeb] border border-[#fde68a] border-l-[4.5px] border-l-[#d97706] p-4 text-left shadow-2xs hover:border-[#f59e0b] hover:shadow-xs transition-all duration-150 min-h-[164px]"
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-2xl font-bold tracking-[-0.025em] leading-none tabular-nums text-[#92400e]">
                                  {unit.label}
                                </span>
                                <span className="inline-flex max-w-[140px] truncate items-center gap-1 rounded-md bg-white/80 border border-[#fde68a] px-2 py-0.5 text-[11px] font-semibold text-[#92400e] tabular-nums">
                                  <span className="truncate">
                                    {roomType?.name || "Room"}
                                  </span>
                                  {price && (
                                    <span className="text-[#b45309] font-medium shrink-0">
                                      · {price}
                                    </span>
                                  )}
                                </span>
                              </div>

                              <div className="mt-3.5 space-y-1.5">
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#d97706] text-white px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.02em]">
                                  <Sparkles className="h-3 w-3" />
                                  Needs Cleaning
                                </span>
                                <p className="text-xs text-[#92400e]/80 font-medium">
                                  Turnover in progress
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#fde68a]/80 pt-3">
                              {data.features.housekeeping ? (
                                <button
                                  type="button"
                                  disabled={cleaningUnitId === unit.id}
                                  onClick={(e) => handleQuickMarkClean(e, unit)}
                                  title="Mark room Clean & Ready"
                                  className="relative z-10 inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-300 bg-white hover:bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800 shadow-2xs transition-all cursor-pointer disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#c89b3c]"
                                >
                                  {cleaningUnitId === unit.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-700" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                  )}
                                  <span>{cleaningUnitId === unit.id ? "Cleaning…" : "Mark Clean"}</span>
                                </button>
                              ) : (
                                <span className="text-xs font-semibold text-[#92400e]">
                                  Dirty
                                </span>
                              )}

                              {canBook && (
                                <button
                                  type="button"
                                  onClick={() => handleUnitClick(unit, roomType)}
                                  className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#fcd34d] bg-white px-3 text-xs font-semibold text-[#92400e] shadow-2xs group-hover:border-[#92400e] group-hover:bg-[#92400e] group-hover:text-white transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c]"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  <span>Book Stay</span>
                                </button>
                              )}
                            </div>
                          </article>
                        );
                      }

                      /* ---------------- VACANT ROOM TILE (Calm Neutral White with Emerald Indicator) ---------------- */
                      const upcoming = unit.upcomingStay;
                      const isArrivalToday = upcoming && upcoming.checkIn === date;
                      const isFutureArrival = upcoming && upcoming.checkIn > date;

                      return (
                        <article
                          key={unit.id}
                          className="group relative flex flex-col justify-between rounded-2xl bg-white border border-slate-200/90 border-l-[4.5px] border-l-emerald-600 p-4 text-left shadow-2xs hover:border-slate-300 hover:shadow-xs transition-all duration-150 min-h-[164px]"
                        >
                          {/* Top: Room Number & Type / Rate metadata */}
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-2xl font-bold tracking-[-0.025em] leading-none tabular-nums text-[#061224] group-hover:text-[#0b1f3a] transition-colors">
                                {unit.label}
                              </span>
                              <span className="inline-flex max-w-[140px] truncate items-center gap-1 rounded-md bg-slate-50 border border-slate-200/80 px-2 py-0.5 text-[11px] font-semibold text-slate-700 tabular-nums">
                                <span className="truncate">
                                  {roomType?.name || "Room"}
                                </span>
                                {price && (
                                  <span className="text-slate-500 font-medium shrink-0">
                                    · {price}
                                  </span>
                                )}
                              </span>
                            </div>

                            {/* Status Badge & Upcoming Arrival Section */}
                            <div className="mt-3.5 space-y-2">
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.02em]">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                                  Available
                                </span>
                                <span className="text-xs text-slate-500 font-medium tabular-nums">
                                  {roomType?.maxAdults
                                    ? `${roomType.maxAdults} Guests max`
                                    : "Standard"}
                                </span>
                              </div>

                              {isArrivalToday && (
                                <div className="rounded-xl border border-amber-200/90 bg-[#fdfaf2] p-2.5 text-left">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 uppercase tracking-[0.04em]">
                                      <LogIn className="h-3.5 w-3.5 text-amber-700" />
                                      Arriving Today
                                    </span>
                                    <span className="font-mono text-[10px] font-medium text-amber-800/80">
                                      #{upcoming.confirmationCode}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-[13px] font-bold text-[#061224] truncate">
                                    {upcoming.guestName}
                                  </p>
                                  <p className="text-[11px] font-medium text-slate-500 tabular-nums">
                                    Stay until {upcoming.checkOut.slice(5)} · {upcoming.guestCount} {upcoming.guestCount === 1 ? "guest" : "guests"}
                                  </p>
                                </div>
                              )}

                              {!isArrivalToday && isFutureArrival && (
                                <div className="flex items-center gap-1.5 rounded-md border border-amber-200/60 bg-amber-50/50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                  <Clock className="h-3 w-3 text-amber-600 shrink-0" />
                                  <span className="truncate">Next: {upcoming.checkIn.slice(5)} · {upcoming.guestName}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Footer / Quick Action */}
                          <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                            <span className="text-xs font-medium text-slate-500 truncate">
                              {cleaningLabel}
                            </span>

                            {isArrivalToday ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const url = reservationUrl(
                                    window.location.href,
                                    propertyId,
                                    upcoming.bookingId,
                                    "assignment",
                                  );
                                  router.replace(url);
                                }}
                                className="relative z-10 inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#061224] hover:bg-[#0c1f3b] px-3 text-xs font-semibold text-white shadow-2xs transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c]"
                              >
                                <LogIn className="h-3.5 w-3.5 text-[#c89b3c]" />
                                <span>Check In</span>
                              </button>
                            ) : canBook ? (
                              <button
                                type="button"
                                onClick={() => handleUnitClick(unit, roomType)}
                                className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs group-hover:border-[#061224] group-hover:bg-[#061224] group-hover:text-white transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c]"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                <span>Book Stay</span>
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                  })}
                </div>
              )}
              </section>
            );
          })}
        </div>
      )}

      {/* 4. MODALS & WORKSPACES */}
      {selectedStay && (
        <RoomStayDetailsModal
          open={true}
          unitLabel={selectedStay.unitLabel}
          roomTypeName={selectedStay.roomTypeName}
          stay={selectedStay.stay}
          propertyId={propertyId}
          onClose={() => setSelectedStay(null)}
          onOpenSection={handleOpenStaySection}
        />
      )}
      {walkInUnit && (
        <ManualBookingDialog
          open={true}
          propertyId={propertyId}
          propertyName={propertyName}
          initialRoomTypeId={walkInUnit.roomTypeId}
          initialUnitId={walkInUnit.unitId}
          initialPurpose="walk_in"
          initialDate={date}
          onClose={() => setWalkInUnit(null)}
          onCreated={(id) => {
            setWalkInUnit(null);
            void refresh();
            if (id)
              router.replace(
                reservationUrl(window.location.href, propertyId, id, "summary"),
              );
          }}
        />
      )}
      {/* Physical Room Register Modal */}
      {registerOpen && (
        <PhysicalRoomRegister
          propertyId={propertyId}
          rooms={rooms}
          onClose={() => {
            setRegisterOpen(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
