"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import {
  pmsButton,
  pmsCard,
  stateLabels,
  type PmsStatus,
} from "./pms-settings-page";
export function MarketplaceAvailability({
  propertyId,
  variant = "card",
}: {
  propertyId: string;
  variant?: "card" | "compact";
}) {
  const client = useQueryClient(),
    url = `/api/partner/properties/${propertyId}/pms`;
  const query = useQuery({
    queryKey: ["partner", propertyId, "pms"],
    queryFn: ({ signal }) => apiFetch<PmsStatus>(url, { signal }),
    refetchInterval: 15000,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "marketplace",
          paused: !query.data?.marketplace.ownerPaused,
        }),
      });
      await client.invalidateQueries({ queryKey: ["partner"] });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to update public bookings.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (variant === "compact") {
    if (query.isPending) {
      return (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-500 shadow-2xs">
          <span className="h-2 w-2 animate-pulse rounded-full bg-slate-300" />
          Checking booking availability…
        </div>
      );
    }
    if (query.isError) {
      return (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700">
          <span>{query.error.message}</span>
          <button className="underline font-bold" onClick={() => void query.refetch()}>Retry</button>
        </div>
      );
    }
    if (!query.data) return null;

    const bookable = query.data.marketplace.bookable;
    const isPaused = query.data.marketplace.ownerPaused;

    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white px-4 py-2.5 text-xs shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${bookable ? "bg-emerald-500 ring-4 ring-emerald-50" : isPaused ? "bg-amber-500 ring-4 ring-amber-50" : "bg-slate-400"}`} />
          <span className="font-bold text-[#06142B] truncate">
            Public bookings:{" "}
            <span className={bookable ? "text-emerald-700" : "text-amber-700"}>
              {bookable ? "Available" : "Unavailable"}
            </span>
          </span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500 shrink-0">
            PMS: <strong className="text-slate-700">{stateLabels[query.data.state]}</strong>
          </span>
          {isPaused && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200 shrink-0">
              Paused by owner
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-rose-600 font-semibold">{error}</span>}
          {query.data.role === "owner" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggle()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
            >
              {busy ? "Updating…" : isPaused ? "Resume bookings" : "Pause public bookings"}
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <section className={pmsCard}>
      <h2 className="font-bold">Public bookings and hotel operations</h2>
      {query.isPending ? (
        <p role="status" className="mt-2 text-sm">
          Checking hotel availability…
        </p>
      ) : query.isError ? (
        <p role="alert" className="mt-2 text-sm">
          {query.error.message}{" "}
          <button className={pmsButton} onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      ) : (
        query.data && (
          <>
            <p className="mt-2 text-sm">
              Public bookings:{" "}
              <strong>
                {query.data.marketplace.bookable ? "Available" : "Unavailable"}
              </strong>{" "}
              · PMS: <strong>{stateLabels[query.data.state]}</strong>
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {query.data.marketplace.reason}{" "}
              {query.data.reason ||
                "A voluntary public pause does not disable a ready PMS."}
            </p>
            {query.data.role === "owner" && (
              <button
                className={`${pmsButton} mt-3`}
                disabled={busy}
                onClick={() => void toggle()}
              >
                {query.data.marketplace.ownerPaused
                  ? "Resume public bookings"
                  : "Pause public bookings"}
              </button>
            )}
          </>
        )
      )}
      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
