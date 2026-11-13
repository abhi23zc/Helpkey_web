"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import {
  pmsButton,
  pmsCard,
  pmsInput,
  stateLabels,
  type PmsStatus,
} from "@/components/partner/dashboard/pms-settings-page";
export function PropertyPmsControl({ propertyId }: { propertyId: string }) {
  const client = useQueryClient(),
    base = `/api/admin/properties/${propertyId}/pms`;
  const q = useQuery({
    queryKey: ["admin", "pms", propertyId],
    queryFn: ({ signal }) => apiFetch<PmsStatus>(base, { signal }),
  });
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function save(disabled: boolean) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiFetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled, reason }),
      });
      await client.invalidateQueries({
        queryKey: ["admin", "pms", propertyId],
      });
      setNotice("PMS restriction saved for this hotel only.");
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={pmsCard}>
      <h2 className="text-lg font-bold">Hotel PMS controls</h2>
      {q.isPending ? (
        <p role="status">Loading PMS status…</p>
      ) : q.isError ? (
        <p role="alert">
          {q.error.message}{" "}
          <button className={pmsButton} onClick={() => void q.refetch()}>
            Retry
          </button>
        </p>
      ) : (
        q.data && (
          <>
            <p className="mt-2 font-semibold">{stateLabels[q.data.state]}</p>
            <p className="mt-1 text-sm text-slate-500">
              Owners activate and prepare their own PMS. Enabling here removes
              only this PMS restriction; it does not override other platform
              restrictions or complete setup.
            </p>
            {q.data.reason && (
              <p className="mt-2 text-sm text-amber-800">{q.data.reason}</p>
            )}
            <ul className="mt-3 text-sm">
              {q.data.items
                .filter((i) => !i.complete)
                .map((i) => (
                  <li key={i.id}>Needs attention: {i.label}</li>
                ))}
            </ul>
            <label className="mt-4 block text-sm">
              Reason for this administrative change
              <input
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={`${pmsInput} mt-2`}
              />
            </label>
            <button
              className={`${pmsButton} mt-3`}
              disabled={busy || reason.trim().length < 3}
              onClick={() => void save(!q.data!.adminDisabled)}
            >
              {q.data.adminDisabled
                ? "Remove PMS restriction"
                : "Temporarily disable PMS"}
            </button>
          </>
        )
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm text-emerald-700">
          {notice}
        </p>
      )}
    </section>
  );
}
