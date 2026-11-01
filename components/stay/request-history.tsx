"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { formatMoney } from "@/lib/customer/offer";
export function RequestHistory({
  bookingId,
  revision,
  currency,
  timezone,
}: {
  bookingId: string;
  revision: number;
  currency: string;
  timezone: string;
}) {
  const q = useQuery({
    queryKey: ["stay-history", bookingId, revision],
    queryFn: ({ signal }) =>
      apiFetch<{
        events: {
          id: string;
          type: string;
          actor: string;
          at: string | null;
          scope: string | null;
          response: string | null;
          amountPaise: number | null;
        }[];
      }>(
        `/api/partner/bookings/${encodeURIComponent(bookingId)}/stay-requests`,
        { signal },
      ),
  });
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold">Request & agreement history</h3>
      {q.isPending && <p className="mt-2 text-xs">Loading changes…</p>}
      {q.isError && (
        <button
          type="button"
          onClick={() => void q.refetch()}
          className="min-h-11 text-xs underline"
        >
          History could not load. Retry
        </button>
      )}
      <ol className="divide-y divide-slate-100">
        {q.data?.events.map((e) => (
          <li className="space-y-1 py-3 text-xs" key={e.id}>
            <p className="font-semibold">
              {e.type.replaceAll("_", " ")}
              {e.amountPaise !== null
                ? ` · ${formatMoney(e.amountPaise, currency)}`
                : ""}
            </p>
            {e.scope && <p>{e.scope}</p>}
            {e.response && <p>{e.response}</p>}
            <p className="break-all text-slate-500">
              {e.actor} ·{" "}
              {e.at
                ? new Date(e.at).toLocaleString("en-IN", { timeZone: timezone })
                : "Time unavailable"}
            </p>
          </li>
        ))}
      </ol>
      {q.data && !q.data.events.length && (
        <p className="mt-2 text-xs text-slate-500">No recorded changes yet.</p>
      )}
    </section>
  );
}
