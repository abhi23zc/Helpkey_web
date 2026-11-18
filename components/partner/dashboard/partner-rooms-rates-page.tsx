"use client";
import { PartnerDatePicker } from "./partner-date-picker";
import { validDate } from "@/lib/booking/domain";
import { useRouter, useSearchParams } from "next/navigation";
import { PartnerRoomsRatesView } from "./partner-rooms-rates-view";
import { RoomsMatrixView } from "./rooms-matrix-view";
import { PartnerShell } from "./partner-shell";
import { usePropertyListing } from "./use-property-listing";
import {
  RoomsOperations,
  shiftDate,
  useRoomsWorkspace,
} from "./rooms-operations";
const ROOM_TABS = ["board", "types", "calendar", "housekeeping"] as const;
type RoomTab = (typeof ROOM_TABS)[number];
function isRoomTab(v: string | null): v is RoomTab {
  return v !== null && (ROOM_TABS as readonly string[]).includes(v);
}

function Workspace({ propertyId, date }: { propertyId: string; date: string }) {
  const router = useRouter(),
    params = useSearchParams();
  const rawTab = params.get("tab");
  const rawSection = params.get("section");
  const tab: RoomTab = isRoomTab(rawTab)
    ? rawTab
    : isRoomTab(rawSection)
      ? rawSection
      : "board";
  const requestedStart = params.get("calendarStart");
  const start =
    requestedStart && validDate(requestedStart) ? requestedStart : date;
  const requestedEnd = params.get("calendarEnd");
  const rangeLength = requestedEnd
    ? (Date.parse(requestedEnd) - Date.parse(start)) / 86400000
    : -1;
  const end =
    requestedEnd &&
    validDate(requestedEnd) &&
    rangeLength >= 0 &&
    rangeLength < 31
      ? requestedEnd
      : shiftDate(start, 6);
  const setRange = (from: string, to: string) => {
    const q = new URLSearchParams(params.toString());
    q.set("calendarStart", from);
    q.set("calendarEnd", to);
    router.replace(`/partner/rooms?${q}`, { scroll: false });
  };
  const listing = usePropertyListing(propertyId, "rooms"),
    query = useRoomsWorkspace(propertyId, start, end);
  const setTab = (section: string) => {
    const q = new URLSearchParams(params.toString());
    q.set("tab", section);
    q.set("section", section);
    router.replace(`/partner/rooms?${q}`, { scroll: false });
  };
  return (
    <div className="space-y-5 text-[#061224] pb-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl sm:text-[26px] font-bold tracking-[-0.02em] leading-tight text-[#061224]">
              Rooms
            </h1>
            <span className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-600 shadow-2xs">
              {listing.property?.name || "Property Workspace"}
            </span>
          </div>
          <p className="text-[13px] sm:text-sm leading-relaxed text-slate-500">
            Manage your room inventory, rate plans, live calendar, and
            housekeeping operations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {tab === "calendar" && (
            <div className="w-full sm:w-auto">
              <PartnerDatePicker
                range
                value={start}
                endValue={end}
                maxDays={31}
                onRangeChange={setRange}
                onChange={() => {}}
                timezone={listing.property?.timezone}
                aria-label="Rooms calendar date range"
              />
            </div>
          )}
        </div>
      </header>

      {/* Navigation tabs */}
      <nav
        aria-label="Room management sections"
        className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-slate-200/80 bg-white/90 p-1 shadow-2xs [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden shrink-0"
      >
        {[
          ["board", "Live Room Board"],
          ["types", "Room types"],
          ["calendar", "Availability & rates"],
          ["housekeeping", "Housekeeping"],
        ].map(([id, label]) => {
          const isActive = tab === id;
          return (
            <button
              key={id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => setTab(id)}
              className={`inline-flex h-9 shrink-0 whitespace-nowrap items-center gap-2 rounded-lg px-3.5 text-[13px] font-semibold tracking-[-0.005em] transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c] ${
                isActive
                  ? "bg-[#061224] text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100/80 hover:text-[#061224]"
              }`}
            >
              <span>{label}</span>
              {id === "board" && query.data?.units && (
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums ${
                    isActive
                      ? "bg-[#c89b3c] text-[#061224]"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {query.data.units.length}
                </span>
              )}
              {id === "types" && listing.data?.roomTypes && (
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums ${
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {listing.data.roomTypes.length}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {tab === "board" ? (
        query.isPending || listing.loading ? (
          <p role="status" className="text-sm font-medium text-slate-500">
            Loading room board…
          </p>
        ) : query.isError || listing.error ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
          >
            <span>{query.error?.message || listing.error}</span>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100/60 transition-colors cursor-pointer"
              onClick={() => {
                void query.refetch();
                listing.reload();
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          query.data &&
          listing.data && (
            <RoomsMatrixView
              propertyId={propertyId}
              propertyName={listing.property?.name || "Property"}
              date={start}
              onDateChange={(d) => {
                const q = new URLSearchParams(params.toString());
                q.set("date", d);
                q.set("calendarStart", d);
                router.replace(`/partner/rooms?${q}`, { scroll: false });
              }}
              data={query.data}
              rooms={listing.data.roomTypes}
              rates={listing.data.ratePlans}
              refresh={() => query.refetch()}
            />
          )
        )
      ) : tab === "types" ? (
        <PartnerRoomsRatesView
          propertyId={propertyId}
          propertyName={listing.property?.name || "Property"}
        />
      ) : (
        <>
          {query.isPending || listing.loading ? (
            <p role="status" className="text-sm font-medium text-slate-500">
              Loading room operations…
            </p>
          ) : query.isError || listing.error ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
            >
              <span>{query.error?.message || listing.error}</span>
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100/60 transition-colors cursor-pointer"
                onClick={() => {
                  void query.refetch();
                  listing.reload();
                }}
              >
                Retry
              </button>
            </div>
          ) : (
            query.data &&
            listing.data && (
              <RoomsOperations
                key={`${propertyId}:${start}:${end}:${tab}`}
                propertyId={propertyId}
                rooms={listing.data.roomTypes}
                rates={listing.data.ratePlans}
                start={start}
                data={query.data}
                refresh={() => query.refetch()}
                mode={tab === "housekeeping" ? "housekeeping" : "calendar"}
              />
            )
          )}
        </>
      )}
    </div>
  );
}
export function PartnerRoomsRatesPage() {
  return (
    <PartnerShell>
      {({ selectedProperty, reportingDate }) =>
        selectedProperty ? (
          <Workspace
            key={selectedProperty.id}
            propertyId={selectedProperty.id}
            date={reportingDate}
          />
        ) : (
          <p>Select a property to manage its rooms.</p>
        )
      }
    </PartnerShell>
  );
}
