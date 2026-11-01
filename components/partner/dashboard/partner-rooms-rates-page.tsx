"use client";
import { PartnerDatePicker } from "./partner-date-picker";
import { validDate } from "@/lib/booking/domain";
import { useRouter, useSearchParams } from "next/navigation";
import { PartnerRoomsRatesView } from "./partner-rooms-rates-view";
import { PartnerShell } from "./partner-shell";
import { usePropertyListing } from "./use-property-listing";
import {
  RoomsOperations,
  shiftDate,
  useRoomsWorkspace,
} from "./rooms-operations";
function Workspace({ propertyId, date }: { propertyId: string; date: string }) {
  const router = useRouter(),
    params = useSearchParams();
  const tab = params.get("section") || "types";
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
    q.set("section", section);
    router.replace(`/partner/rooms?${q}`, { scroll: false });
  };
  return (
    <div className="space-y-4 text-[#061224] pb-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-3.5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#061224]">
              Rooms
            </h1>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
              {listing.property?.name || "Property Workspace"}
            </span>
          </div>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-500 font-medium">
            Manage your room inventory, rate plans, live calendar, and
            housekeeping operations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {(tab === "calendar" || tab === "housekeeping") && (
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
        className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-slate-100/90 p-1 border border-slate-200/70"
      >
        {[
          ["types", "Room types"],
          ["calendar", "Availability & rates"],
          ["housekeeping", "Housekeeping"],
        ].map(([id, label]) => {
          const isActive = tab === id;
          return (
            <button
              key={id}
              aria-current={isActive ? "page" : undefined}
              onClick={() => setTab(id)}
              className={`inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-xs font-semibold transition-all duration-150 ${
                isActive
                  ? "bg-white text-[#061224] shadow-xs border border-slate-200/80 font-bold"
                  : "text-slate-600 hover:text-[#061224] hover:bg-white/60 font-medium"
              }`}
            >
              <span>{label}</span>
              {id === "types" && listing.data?.roomTypes && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    isActive
                      ? "bg-[#061224] text-white"
                      : "bg-slate-200/90 text-slate-600"
                  }`}
                >
                  {listing.data.roomTypes.length}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {tab === "types" ? (
        <PartnerRoomsRatesView
          propertyId={propertyId}
          propertyName={listing.property?.name || "Property"}
        />
      ) : (
        <>
          {query.isPending || listing.loading ? (
            <p role="status">Loading room operations…</p>
          ) : query.isError || listing.error ? (
            <div role="alert" className="rounded-xl bg-rose-50 p-4">
              {query.error?.message || listing.error}
              <button
                className="ml-3 underline"
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
            key={`${selectedProperty.id}:${reportingDate}`}
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
