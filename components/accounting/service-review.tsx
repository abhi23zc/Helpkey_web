"use client";
import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import type { BookingFinance } from "@/lib/booking-finance/domain";
import {
  offeringCategories,
  offeringCategoryLabels,
} from "@/lib/stay/contracts";
const button =
  "min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50";
export function ServiceReview({
  bookingId,
  propertyId,
  refresh,
}: {
  bookingId: string;
  propertyId: string;
  refresh: () => Promise<unknown>;
}) {
  const [data, setData] = useState<BookingFinance>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [category, setCategory] = useState(""),
    [preTax, setPreTax] = useState(""),
    [owned, setOwned] = useState(false);
  const request = useRef<{ body: string; id: string } | null>(null),
    lock = useRef(false);
  async function load(insideCommand = false) {
    if (!insideCommand) setBusy(true);
    try {
      setData(
        await apiFetch(
          `/api/admin/bookings/${encodeURIComponent(bookingId)}/finance`,
          { cache: "no-store" },
        ),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load service terms.",
      );
    } finally {
      if (!insideCommand) setBusy(false);
    }
  }
  async function send(input: Record<string, unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const body = JSON.stringify(input);
    if (request.current?.body !== body)
      request.current = { body, id: crypto.randomUUID() };
    try {
      await apiFetch(
        `/api/admin/accounting/services?propertyId=${encodeURIComponent(propertyId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...input,
            bookingId,
            requestId: request.current.id,
          }),
        },
      );
      request.current = null;
      setNotice(
        "Service terms saved for verification. The accounting update is queued; refresh shortly to see the result.",
      );
      setOwned(false);
      setReason("");
      setCategory("");
      setPreTax("");
      await load(true);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save service terms.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const issue =
    data?.status !== "historical"
      ? data?.reviewIssues.find((i) => i.code === "SERVICE_TERMS_MISSING")
      : undefined;
  const r =
    issue && data?.status !== "historical"
      ? data?.agreement && issue.requestId
      : null;
  return (
    <details
      className="mt-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4"
      onToggle={(e) => {
        if (e.currentTarget.open && !data && !busy) void load();
      }}
    >
      <summary className="cursor-pointer text-sm font-semibold text-amber-900">
        Review add-on settlement
      </summary>
      <p className="my-3 text-xs leading-5">
        First check saved service evidence. Confirm missing terms only from the
        original accepted quote; existing room terms are never changed.
      </p>
      {notice && (
        <p role="status" className="my-3 text-xs text-emerald-900">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="my-3 text-xs text-red-800">
          {error}
        </p>
      )}
      <button
        className={button}
        disabled={busy}
        onClick={() => void send({ action: "reconcile" })}
      >
        Verify saved service evidence
      </button>
      {data && data.status !== "historical" && (
        <div className="mt-4 space-y-3 text-xs">
          {data.reviewIssues.map((i, index) => (
            <p key={index}>{i.message}</p>
          ))}
          {data.reviewIssues.length === 0 && (
            <p>
              No unresolved service issues. Accounting may still be processing.
            </p>
          )}
          {r && (
            <fieldset
              disabled={busy}
              className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
            >
              <legend className="px-1 font-semibold">
                Confirm missing terms · {issue?.title}
              </legend>
              <p>
                Only use this after verifying the original service quote. The
                server rechecks its quote version and saved booking policy.
              </p>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={owned}
                  onChange={(e) => setOwned(e.target.checked)}
                />
                I verified this is a service supplied by this hotel.
              </label>
              {data.agreement.terms.effective.commissionBasis ===
                "rooms_and_extras" && (
                <>
                  <label className="block">
                    Original service category
                    <select
                      className="mt-1 block w-full rounded-lg border p-2"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="">Select category</option>
                      {offeringCategories.map((c) => (
                        <option value={c} key={c}>
                          {offeringCategoryLabels[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    Verified pre-tax amount (₹), if this category earns
                    commission
                    <input
                      className="mt-1 block w-full rounded-lg border p-2"
                      inputMode="decimal"
                      value={preTax}
                      onChange={(e) => setPreTax(e.target.value)}
                    />
                  </label>
                </>
              )}
              <label className="block">
                Reason / supporting evidence
                <input
                  className="mt-1 block w-full rounded-lg border p-2"
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button
                className={button}
                disabled={!owned || reason.trim().length < 3}
                onClick={() => {
                  if (preTax && !/^\d+(\.\d{1,2})?$/.test(preTax)) {
                    setError("Enter a rupee amount with up to two decimals.");
                    return;
                  }
                  const matched = data.serviceRequests.find(
                    (q: { id: string; quoteVersion: number }) => q.id === r,
                  );
                  if (!matched) {
                    setError(
                      "Refresh the original accepted service quote before confirming.",
                    );
                    return;
                  }
                  void send({
                    action: "confirm",
                    serviceRequestId: r,
                    quoteVersion: matched.quoteVersion,
                    hotelOwned: true,
                    category: category || null,
                    preTaxPaise: preTax
                      ? Math.round(Number(preTax) * 100)
                      : null,
                    reason,
                  });
                }}
              >
                Confirm service terms
              </button>
            </fieldset>
          )}
        </div>
      )}
    </details>
  );
}
