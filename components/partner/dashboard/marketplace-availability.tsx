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
}: {
  propertyId: string;
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
