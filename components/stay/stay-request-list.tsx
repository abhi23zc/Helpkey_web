"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { type StayRequest, statusLabels } from "@/lib/stay/contracts";
import { formatMoney } from "@/lib/customer/offer";
export function StayRequestList({
  requests,
  currency,
  timezone,
  staff,
}: {
  requests: StayRequest[];
  currency: string;
  timezone: string;
  staff?: {
    bookingId: string;
    revision: number;
    enabled: boolean;
    refresh: () => void;
  };
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [responses, setResponses] = useState<Record<string, string>>({});
  async function update(r: StayRequest, status: string) {
    if (!staff) return;
    setBusy(r.id);
    setError("");
    try {
      await apiFetch(
        `/api/partner/bookings/${encodeURIComponent(staff.bookingId)}/customizations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revision: staff.revision,
            requestId: r.id,
            status,
            response: responses[r.id] ?? "",
          }),
        },
      );
      staff.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update request.");
      staff.refresh();
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-3">
      {!requests.length && (
        <p className="text-sm text-slate-500">No customizations requested.</p>
      )}
      {requests.map((r) => (
        <div
          key={r.id}
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <div className="flex flex-wrap justify-between gap-2">
            <h4 className="text-sm font-semibold">
              {r.name}
              {r.variantName ? ` · ${r.variantName}` : ""} × {r.quantity}
            </h4>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
              {statusLabels[r.status]}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-600">{r.description}</p>
          <p className="mt-2 text-xs text-slate-500">
            {r.totalPaise ? formatMoney(r.totalPaise, currency) : "Free"} ·
            Maximum {r.maxQuantity} per booking · Changes before{" "}
            {new Date(r.deadlineAt).toLocaleString("en-IN", {
              timeZone: timezone,
            })}{" "}
            ({timezone})
          </p>
          {r.preparationStarted && (
            <p className="mt-1 text-xs text-slate-500">
              Preparation has started. Contact the hotel for changes.
            </p>
          )}
          {r.response && (
            <p className="mt-2 text-sm">Hotel response: {r.response}</p>
          )}
          {r.totalPaise > 0 && r.status === "declined" && (
            <p className="mt-2 text-xs text-slate-500">
              This charge has been removed. Any amount paid online is refunded
              through your original payment method.
            </p>
          )}
          {staff?.enabled &&
            ["requested", "confirmed", "preparing", "ready"].includes(
              r.status,
            ) && (
              <div className="mt-3 space-y-2">
                <label className="block text-xs">
                  Customer-visible response
                  <input
                    value={responses[r.id] ?? ""}
                    onChange={(e) =>
                      setResponses({ ...responses, [r.id]: e.target.value })
                    }
                    maxLength={1000}
                    className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {(r.status === "requested"
                    ? ["confirmed", "declined"]
                    : r.status === "confirmed"
                      ? ["preparing"]
                      : r.status === "preparing"
                        ? ["ready"]
                        : ["fulfilled"]
                  ).map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void update(r, status)}
                      className="rounded-lg bg-[#061224] px-3 py-2 text-xs text-white disabled:opacity-50"
                    >
                      {busy === r.id
                        ? "Saving…"
                        : status === "declined"
                          ? "Decline"
                          : status === "confirmed"
                            ? "Confirm"
                            : `Mark ${status}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
        </div>
      ))}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
