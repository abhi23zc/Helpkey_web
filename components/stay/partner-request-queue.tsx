"use client";
import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { localParts } from "@/lib/booking/domain";
import { shiftDay } from "@/lib/partner/date-range";
import { PartnerDatePicker } from "@/components/partner/dashboard/partner-date-picker";
import { Drawer } from "@/components/partner/dashboard/drawer";
import { StayRequestList } from "./stay-request-list";
import { RequestHistory } from "./request-history";
import {
  requestGroups,
  requestGroupLabels,
  requestGroup,
  type RequestGroup,
  type RequestQueuePage,
  type RequestQueueRow,
} from "@/lib/stay/workspace";
import type { StayRequest } from "@/lib/stay/contracts";
import { requestAmountLabel } from "@/lib/stay/agreements";

export function PartnerRequestQueue({
  propertyId,
  currency,
  timezone,
}: {
  propertyId: string;
  currency: string;
  timezone: string;
}) {
  const [dates, setDates] = useState(() => {
    const from = localParts(Date.now(), timezone).date;
    return { from, to: shiftDay(from, 6) };
  });
  const [status, setStatus] = useState<RequestGroup>("open");
  const [selected, setSelected] = useState<RequestQueueRow | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["partner-stay-queue", propertyId, dates, status],
    initialPageParam: "" as string,
    queryFn: ({ pageParam, signal }) =>
      apiFetch<RequestQueuePage>(
        `/api/partner/properties/${encodeURIComponent(propertyId)}/stay-requests?${new URLSearchParams({ ...dates, status, ...(pageParam ? { cursor: pageParam } : {}) })}`,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor || undefined,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const rows = query.data?.pages.flatMap((p) => p.rows) ?? [];
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <label className="min-w-0 text-sm font-medium">
          Stay dates
          <PartnerDatePicker
            value={dates.from}
            endValue={dates.to}
            range
            maxDays={31}
            timezone={timezone}
            aria-label="Guest request stay dates"
            onChange={(e) =>
              setDates({ from: e.target.value, to: e.target.value })
            }
            onRangeChange={(from, to) => setDates({ from, to })}
            className="mt-1 w-full sm:min-w-72"
          />
        </label>
        <label className="text-xs font-medium text-slate-500">
          Request status
          <select
            aria-label="Request status"
            className="mt-1 block h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs sm:text-sm text-[#061224] focus:outline-none focus:ring-2 focus:ring-amber-500/20 sm:min-w-56"
            value={status}
            onChange={(e) => setStatus(e.target.value as RequestGroup)}
          >
            {requestGroups.map((g) => (
              <option key={g} value={g}>
                {requestGroupLabels[g]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="h-10 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs self-end"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Requests for stays overlapping these dates · {timezone}. Updates every
        30 seconds.
      </p>
      {query.isPending && (
        <p role="status" className="rounded-2xl bg-white p-6">
          Loading guest requests…
        </p>
      )}
      {query.isError && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
        >
          {query.error.message}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void query.refetch()}
          >
            Retry
          </button>
          {rows.length > 0 && (
            <p>
              Showing previously loaded requests. Refresh before taking action.
            </p>
          )}
        </div>
      )}
      {!query.isPending && !query.isError && !rows.length && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">No matching guest requests</h2>
          <p className="mt-1 text-sm text-slate-500">
            Try another stay date range or request status.
            {query.hasNextPage ? " More bookings are available below." : ""}
          </p>
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((row) => (
          <article
            key={`${row.bookingId}:${row.request.id}`}
            className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="break-words font-semibold">
                {row.request.name} × {row.request.quantity}
              </h2>
              <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-900">
                {requestGroupLabels[requestGroup(row.request)]}
              </span>
            </div>
            <p className="mt-2 break-words text-sm">
              {row.guestName} · {row.roomName}
            </p>
            <p className="mt-1 break-all text-xs text-slate-500">
              {row.reference} · {row.checkIn} – {row.checkOut}
            </p>
            {row.request.inputs?.serviceAt && (
              <p className="mt-2 text-sm">
                Needed{" "}
                {new Date(row.request.inputs.serviceAt).toLocaleString(
                  "en-IN",
                  { timeZone: timezone },
                )}
              </p>
            )}
            <p className="mt-2 text-sm">
              {requestAmountLabel(row.request, currency)}
            </p>
            {!row.enabled && (
              <p className="mt-2 text-xs text-slate-500">
                Closed reservation · view only
              </p>
            )}
            <button
              type="button"
              onClick={() => setSelected(row)}
              className="mt-4 h-9 inline-flex items-center justify-center rounded-lg bg-[#061224] px-4 text-xs font-semibold text-white shadow-2xs hover:bg-slate-800 transition-colors"
            >
              View request
            </button>
          </article>
        ))}
      </div>
      {query.hasNextPage && (
        <button
          type="button"
          className="min-h-11 rounded-xl border bg-white px-5 text-sm"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more bookings"}
        </button>
      )}
      {selected && (
        <RequestDetail
          key={`${selected.bookingId}:${selected.request.id}`}
          row={selected}
          propertyId={propertyId}
          currency={currency}
          timezone={timezone}
          close={() => setSelected(null)}
          refresh={() => void query.refetch()}
        />
      )}
    </section>
  );
}
function RequestDetail({
  row,
  propertyId,
  currency,
  timezone,
  close,
  refresh,
}: {
  row: RequestQueueRow;
  propertyId: string;
  currency: string;
  timezone: string;
  close: () => void;
  refresh: () => void;
}) {
  const query = useQuery({
    queryKey: ["stay-queue-detail", propertyId, row.bookingId],
    queryFn: ({ signal }) =>
      apiFetch<{
        booking: {
          propertyId: string;
          customizations: StayRequest[];
          stayRevision: number;
          bookingStatus: string;
        };
      }>(`/api/partner/bookings/${encodeURIComponent(row.bookingId)}`, {
        signal,
      }),
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
  const booking = query.data?.booking;
  const request =
    booking?.propertyId === propertyId
      ? booking.customizations.find((r) => r.id === row.request.id)
      : undefined;
  return (
    <Drawer
      open
      title="Guest request"
      description={`${row.guestName} · ${row.reference}`}
      onClose={() => {
        if (
          window.confirm(
            "Close request details? Any unsent response or quote will be discarded.",
          )
        )
          close();
      }}
    >
      <div className="space-y-4">
        <a
          className="h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
          href={`/partner/reservations?${new URLSearchParams({ propertyId, bookingId: row.bookingId, scope: "all" })}`}
        >
          Open reservation
        </a>
        {query.isPending && <p role="status">Loading current request…</p>}
        {query.isError && (
          <p role="alert">
            {query.error.message}{" "}
            <button
              type="button"
              className="underline"
              onClick={() => void query.refetch()}
            >
              Retry
            </button>
          </p>
        )}
        {booking && !request && (
          <p role="alert">Request is no longer available for this property.</p>
        )}
        {request && booking && (
          <>
            <StayRequestList
              requests={[request]}
              currency={currency}
              timezone={timezone}
              staff={{
                bookingId: row.bookingId,
                revision: booking.stayRevision,
                enabled:
                  ["confirmed", "checked_in"].includes(booking.bookingStatus) &&
                  !query.isFetching,
                refresh: () => {
                  void query.refetch();
                  refresh();
                },
              }}
            />
            <RequestHistory
              bookingId={row.bookingId}
              revision={booking.stayRevision}
              currency={currency}
              timezone={timezone}
            />
          </>
        )}
      </div>
    </Drawer>
  );
}
