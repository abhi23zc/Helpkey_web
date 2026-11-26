"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
type Proposals = {
  proposals: {
    quoteId: string;
    proposalFingerprint: string;
    startAt: string;
    endAt: string;
    roomName: string;
    serviceImpacts: {
      id: string;
      name: string;
      reasons: string[];
      approved: boolean;
      serviceVersion: string;
    }[];
  }[];
};
export function ServiceMoveApprovals({ bookingId }: { bookingId: string }) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const url = `/api/partner/bookings/${bookingId}/service-moves`;
  const query = useQuery({
    queryKey: ["partner", "service-moves", bookingId],
    queryFn: () => apiFetch<Proposals>(url),
  });
  if (!query.data?.proposals.some((p) => p.serviceImpacts.length)) return null;
  return (
    <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="font-bold">Requested service moves</h3>
      <p className="text-sm">
        Approval keeps the current schedule until the customer’s booking change
        commits. Scope or price changes require a new service agreement.
      </p>
      {query.data.proposals.map((p) => (
        <div key={p.quoteId} className="space-y-2">
          <p className="text-sm font-semibold">
            {p.roomName}: {new Date(p.startAt).toLocaleString()} to{" "}
            {new Date(p.endAt).toLocaleString()}
          </p>
          {p.serviceImpacts.map((s) => (
            <div key={s.id} className="text-sm">
              <p>
                {s.name}: {s.reasons.join("; ")}
              </p>
              {s.approved ? (
                <p>Move approved</p>
              ) : s.reasons.every((r) => r.includes("schedule or duration")) ? (
                <button
                  disabled={busy}
                  className="mt-1 rounded-lg border bg-white px-3 py-2 font-semibold"
                  onClick={() => {
                    setBusy(true);
                    void apiFetch(url, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        quoteId: p.quoteId,
                        requestId: s.id,
                        serviceVersion: s.serviceVersion,
                      }),
                    })
                      .then(() => {
                        setMessage(
                          "Move approved. The customer can review the change again.",
                        );
                        return query.refetch();
                      })
                      .catch((e) =>
                        setMessage(
                          e instanceof Error ? e.message : "Unable to approve",
                        ),
                      )
                      .finally(() => setBusy(false));
                  }}
                >
                  Approve unchanged service move
                </button>
              ) : (
                <p>
                  Resolve through the existing service cancellation or new quote
                  controls.
                </p>
              )}
            </div>
          ))}
        </div>
      ))}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
