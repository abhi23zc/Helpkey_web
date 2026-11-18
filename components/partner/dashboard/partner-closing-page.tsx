"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { formatPaise } from "@/lib/currency";
import { PartnerShell } from "./partner-shell";
import { useHotelCapabilities } from "./hotel-capabilities";
import type { RecordData } from "@/lib/partner/dashboard/domain";
const button =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50";
const field = "min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2";
const money = (n: number) => formatPaise(n, { withFractions: true });
function paise(text: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(text))
    throw new Error(
      "Enter an exact nonnegative amount with at most two decimal places.",
    );
  const [whole, fraction = ""] = text.split(".");
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n > 100_000_000)
    throw new Error("Amount is too large.");
  return n;
}
export function PartnerClosingPage({ daily = false }: { daily?: boolean }) {
  return (
    <PartnerShell>
      {({ selectedProperty, user }) =>
        selectedProperty && user ? (
          <Closing
            key={`${user.uid}:${selectedProperty.id}`}
            hotel={selectedProperty.id}
            name={selectedProperty.name}
            daily={daily}
          />
        ) : (
          <p>Select a hotel.</p>
        )
      }
    </PartnerShell>
  );
}
function Closing({
  hotel,
  name,
  daily,
}: {
  hotel: string;
  name: string;
  daily: boolean;
}) {
  const permits = useHotelCapabilities(),
    { appUser } = useAuth(),
    client = useQueryClient();
  const url = `/api/partner/${daily ? "daily-closing" : "cashier-shifts"}`;
  const [id, setId] = useState(""),
    [before, setBefore] = useState(""),
    [date, setDate] = useState(""),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [page, setPage] = useState(0),
    [reviewVersion, setReviewVersion] = useState<string | number | null>(null);
  const [pending, setPending] = useState<{
      key: string;
      body: string;
      uncertain?: boolean;
    } | null>(null),
    [loaded, setLoaded] = useState(false);
  const storageKey = `helpkey-closing:${appUser?.uid}:${hotel}:${daily ? "daily" : "shift"}`;
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const p = JSON.parse(saved);
          if (typeof p.key !== "string" || typeof p.body !== "string")
            throw new Error();
          setPending({ ...p, uncertain: true });
        }
        setLoaded(true);
      } catch {
        setError(
          "Saved submission could not be loaded. Resolve storage access before submitting another closing.",
        );
      }
    });
    return () => {
      active = false;
    };
  }, [storageKey]);
  const history = useQuery<RecordData>({
    queryKey: ["partner", hotel, "closing", daily, before],
    queryFn: () =>
      apiFetch(
        `${url}?${new URLSearchParams({ propertyId: hotel, ...(before ? { before } : {}) })}`,
      ),
    refetchInterval: 30000,
    retry: false,
  });
  const activeId = id || (!daily ? history.data?.activeId : "");
  const selectedDate = date || (daily ? history.data?.nextDate : "");
  const detail = useQuery<RecordData>({
    queryKey: [
      "partner",
      hotel,
      "closing-detail",
      daily,
      activeId,
      selectedDate,
      page,
    ],
    enabled: daily
      ? !!(activeId || selectedDate)
      : !!activeId,
    queryFn: () =>
      apiFetch(
        `${url}?${new URLSearchParams({ propertyId: hotel, page: String(page), ...(activeId ? { id: activeId } : { date: selectedDate }) })}`,
      ),
    refetchInterval: activeId && daily ? false : 30000,
    retry: false,
  });
  const [sourceCursor, setSourceCursor] = useState("");
  const sources = useQuery<RecordData>({
    queryKey: ["partner", hotel, "shift-sources", activeId, sourceCursor],
    enabled: !daily && !!activeId,
    queryFn: () =>
      apiFetch(
        `${url}?${new URLSearchParams({ propertyId: hotel, id: activeId, sources: "true", ...(sourceCursor ? { before: sourceCursor } : {}) })}`,
      ),
    retry: false,
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["partner", hotel] });
  async function submit() {
    setError("");
    setSuccess("");
    setBusy(true);
    let request = pending;
    try {
      if (!request) {
        const body = daily
          ? {
              propertyId: hotel,
              date: selectedDate,
              version: reviewVersion ?? detail.data?.version,
              note: reason,
              acknowledge: ack,
            }
          : activeId
            ? {
                propertyId: hotel,
                action: "close",
                shiftId: activeId,
                revision: reviewVersion ?? detail.data?.shift.revision,
                countedPaise: paise(amount),
                reason,
              }
            : {
                propertyId: hotel,
                action: "open",
                openingPaise: paise(amount),
              };
        request = { key: crypto.randomUUID(), body: JSON.stringify(body) };
      }
      localStorage.setItem(
        storageKey,
        JSON.stringify({ ...request, uncertain: true }),
      );
      setPending(request);
      await apiFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": request.key,
        },
        body: request.body,
      });
      localStorage.removeItem(storageKey);
      setPending(null);
      setAmount("");
      setReason("");
      setAck(false);
      setId("");
      setPage(0);
      setReviewVersion(null);
      setSuccess(daily ? "Daily report saved permanently." : "Shift recorded.");
      await refresh();
    } catch (e) {
      const definitive =
        e instanceof ApiClientError &&
        [
          "REVIEW_CHANGED",
          "REASON_REQUIRED",
          "ACKNOWLEDGEMENT_REQUIRED",
          "CLOSING_BLOCKED",
          "SHIFT_ALREADY_OPEN",
          "OPEN_SHIFT_REQUIRED",
          "FEATURE_DISABLED",
          "UNSUPPORTED_DATE",
          "DAY_ALREADY_CLOSED",
          "SHIFT_CLOSED",
          "VALIDATION_ERROR",
        ].includes(e.code);
      if (!pending?.uncertain && definitive) {
        localStorage.removeItem(storageKey);
        setPending(null);
        setReviewVersion(null);
        void refresh();
      } else if (request) setPending({ ...request, uncertain: true });
      setError(
        e instanceof Error
          ? e.message
          : "Submission outcome is uncertain. Retry the saved request.",
      );
    } finally {
      setBusy(false);
    }
  }
  const model = detail.data,
    shift = model?.shift,
    closed = daily ? !!model?.report : shift?.status === "closed",
    canClose = daily
      ? permits("closing.manage")
      : shift?.actorId === appUser?.uid;
  const report = model?.report || model;
  const timezone = daily
    ? report?.timezone || history.data?.timezone
    : shift?.timezone;
  const when = (v: string) =>
    v
      ? new Intl.DateTimeFormat("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: timezone || "Asia/Kolkata",
        }).format(new Date(v))
      : "—";
  return (
    <section className="space-y-5 print:bg-white">
      <header>
        <h1 className="text-2xl font-bold">
          {daily ? "Daily closing" : "My shift and shift history"}
        </h1>
        <p>
          {name} · {timezone || "Hotel-local dates"}
        </p>
      </header>
      <p className="text-sm text-slate-600">
        {daily
          ? "Day activity, shift summaries and current outstanding work are separate. Closing saves a report; hotel operations continue."
          : "Opening cash is the money physically counted in your drawer. Only the opener can close a shift. Restore their authorized access if it was removed."}
      </p>
      <div className="flex flex-wrap gap-3 print:hidden">
        <button
          className={button}
          onClick={() => {
            setReviewVersion(null);
            void refresh();
          }}
        >
          Refresh review
        </button>
        {id && (
          <button
            className={button}
            onClick={() => {
              setId("");
              setSourceCursor("");
            }}
          >
            Back to current review
          </button>
        )}
        {daily && (
          <label>
            Hotel date
            <input
              className={field}
              type="date"
              value={selectedDate || ""}
              disabled={!!pending}
              onChange={(e) => {
                setDate(e.target.value);
                setId("");
                setPage(0);
                setReviewVersion(null);
              }}
            />
          </label>
        )}
        {closed && (
          <button
            className={button}
            onClick={() =>
              window.open(
                `${url}/print?${new URLSearchParams({ propertyId: hotel, id: activeId })}`,
                "_blank",
                "noopener,noreferrer",
              )
            }
          >
            Print saved summary
          </button>
        )}
      </div>
      {(error || history.error || detail.error) && (
        <p role="alert" className="rounded-xl bg-amber-50 p-4">
          {error ||
            `Review unavailable: ${history.error?.message || detail.error?.message}`}
        </p>
      )}
      {success && <p role="status">{success}</p>}
      {pending && (
        <div role="status" className="rounded-xl bg-amber-50 p-4">
          A saved submission needs confirmation. Retry the exact request,
          including after reload.{" "}
          <button
            className={button}
            disabled={busy}
            onClick={() => void submit()}
          >
            Retry saved request
          </button>
        </div>
      )}
      {!history.data && !history.error && <p>Loading…</p>}
      {daily && selectedDate && !model && detail.isFetching && (
        <p role="status">Loading the daily review for {selectedDate}…</p>
      )}
      {daily && !history.data?.reportingStart && (
        <p>
          Reporting starts when the first cashier shift opens. Earlier closing
          balances cannot be reconstructed.
        </p>
      )}
      {!daily && model && (
        <div className="rounded-xl border bg-white p-4">
          <h2 className="font-bold">
            {closed ? "Closed shift" : "Open shift"}
          </h2>
          <p>
            {shift.openerName} · Opened {when(shift.openedAt)}
            {closed &&
              ` · Closed ${when(shift.closedAt)} by ${shift.closerName}`}
          </p>
          <dl className="grid grid-cols-2 gap-2 py-4">
            {[
              ["Opening cash", shift.openingPaise],
              ["Net collections", model.review.collectedPaise],
              ["Cash returned", model.review.returnedPaise],
              [
                "Corrections (separate from returns)",
                model.review.correctionsPaise,
              ],
              ["Expected cash", model.review.expectedPaise],
              ...(closed
                ? [
                    ["Counted cash", model.review.countedPaise],
                    ["Surplus / shortage", model.review.differencePaise],
                  ]
                : []),
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className="font-bold">{money(value as number)}</dd>
              </div>
            ))}
          </dl>
          {closed && (
            <p>Explanation: {model.review.reason || "No difference"}</p>
          )}
          <p>
            {model.review.sourceCount} source receipts. Corrections to
            historical receipts have zero physical-cash effect.
          </p>
        </div>
      )}
      {daily && report && (
        <>
          <DailyReport model={report} when={when} />
          <div className="flex gap-3 print:hidden">
            {page > 0 && (
              <button className={button} onClick={() => setPage(page - 1)}>
                Previous detail page
              </button>
            )}
            {report.pagination?.more && (
              <button className={button} onClick={() => setPage(page + 1)}>
                Next detail page
              </button>
            )}
          </div>
        </>
      )}
      {!closed &&
        !pending &&
        history.data &&
        (daily
          ? model && !detail.error
          : !activeId
            ? true
            : model && !detail.error && canClose) && (
          <form
            className="space-y-3 rounded-xl border bg-white p-4 print:hidden"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {!daily && (
              <label className="block">
                {activeId
                  ? "Counted cash (₹)"
                  : "Opening cash physically counted (₹)"}
                <input
                  className={field}
                  inputMode="decimal"
                  required
                  value={amount}
                  disabled={busy}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    if (reviewVersion === null && activeId)
                      setReviewVersion(model?.shift.revision);
                  }}
                />
              </label>
            )}
            {!daily && activeId && /^\d+(\.\d{1,2})?$/.test(amount) && (
              <p>
                Surplus / shortage:{" "}
                {money(Number(amount) * 100 - model!.review.expectedPaise)}
              </p>
            )}
            {(daily || activeId) && (
              <label className="block">
                {daily
                  ? "Closing note"
                  : "Discrepancy explanation (required for a difference)"}
                <textarea
                  className={field}
                  value={reason}
                  disabled={busy}
                  maxLength={daily ? 2000 : 1000}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (reviewVersion === null)
                      setReviewVersion(
                        daily ? model?.version : model?.shift.revision,
                      );
                  }}
                />
              </label>
            )}
            {daily && (
              <label className="flex gap-3">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => {
                    setAck(e.target.checked);
                    if (reviewVersion === null)
                      setReviewVersion(model?.version);
                  }}
                />
                I acknowledge the current guest balances, pending refunds and
                outstanding operational work.
              </label>
            )}
            <button
              className={button}
              disabled={
                busy ||
                !loaded ||
                (daily && !!model?.pagination?.counts.blockers)
              }
            >
              {busy
                ? "Saving…"
                : daily
                  ? "Confirm permanent daily report"
                  : activeId
                    ? "Confirm shift closing"
                    : "Open my shift"}
            </button>
          </form>
        )}
      {!daily && activeId && (
        <div className="rounded-xl border bg-white p-4">
          <h2 className="font-bold">Source receipts</h2>
          {sources.error && (
            <p role="alert">
              Source detail unavailable: {sources.error.message}
            </p>
          )}
          {sources.data?.sources?.map((r: RecordData) => (
            <p className="break-all py-2" key={r.id}>
              {r.type} · {money(r.amountPaise)} · Cash effect{" "}
              {money(r.cashEffectPaise)} · {when(r.createdAt)} · {r.id}
            </p>
          ))}
          {sources.data?.nextCursor && (
            <button
              className={button}
              onClick={() => setSourceCursor(sources.data!.nextCursor)}
            >
              Next source page
            </button>
          )}
          {sourceCursor && (
            <button className={button} onClick={() => setSourceCursor("")}>
              First source page
            </button>
          )}
        </div>
      )}
      <div className="rounded-xl border bg-white p-4 print:hidden">
        <h2 className="font-bold">
          {daily
            ? "Closing history"
            : permits("shift.history")
              ? "Hotel shift history and differences"
              : "My shift history"}
        </h2>
        {daily && Array.isArray(history.data?.reports) && history.data.reports.length === 0 && (
          <p className="mt-2 text-sm text-slate-600">
            {before ? "No closing reports on this page." : "No daily closing reports have been saved yet. Review a hotel date above to create the first report."}
          </p>
        )}
        {(daily ? history.data?.reports : history.data?.shifts)?.map(
          (r: RecordData) => (
            <button
              className={`${button} my-2 block w-full text-left`}
              key={r.id}
              onClick={() => {
                setId(r.id);
                setSourceCursor("");
                setPage(0);
                setReviewVersion(null);
              }}
            >
              {daily
                ? `${r.date} · ${r.actorName}`
                : `${r.openedDate} · ${r.openerName} · ${r.status}${r.snapshot ? ` · Difference ${money(r.snapshot.differencePaise)}` : ""}`}
            </button>
          ),
        )}
        {history.data?.nextCursor && (
          <button
            className={button}
            onClick={() => setBefore(history.data!.nextCursor)}
          >
            Next history page
          </button>
        )}
        {before && (
          <button className={button} onClick={() => setBefore("")}>
            First history page
          </button>
        )}
      </div>
    </section>
  );
}
function DailyReport({
  model,
  when,
}: {
  model: RecordData;
  when: (v: string) => string;
}) {
  return (
    <div className="space-y-4 rounded-xl border bg-white p-4">
      <h2 className="text-xl font-bold">Daily report · {model.date}</h2>
      {model.closedAt && (
        <p>
          Information available when closed at {when(model.closedAt)} ·{" "}
          {model.actorName}
        </p>
      )}
      {model.note && <p>Closing note: {model.note}</p>}
      {model.blockers?.map((s: string, i: number) => (
        <p role="alert" key={i}>
          {s}
        </p>
      ))}
      {[
        ["Day activity", model.activity],
        ["Late activity for previously closed dates", model.late],
      ].map(([title, rows]) => (
        <div key={title as string}>
          <h3 className="font-bold">{title as string}</h3>
          {(rows as RecordData[]).length === 0 && (
            <p>No activity on this detail page.</p>
          )}
          {(rows as RecordData[]).slice(0, 50).map((r) => (
            <p key={r.key} className="break-all py-1">
              {r.date} · {r.type} · {money(r.amountPaise)} · {r.method} ·{" "}
              {r.ownership}
              {r.unattributed && " · Unattributed historical receipt"}
              {r.bookingId && (
                <a
                  className="ml-2 underline print:hidden"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`/partner/reservations?${new URLSearchParams({ propertyId: model.propertyId, bookingId: r.bookingId, section: "payments" })}`}
                >
                  View reservation
                </a>
              )}
              {r.type === "correction" &&
                ` · Physical cash effect ${r.cashEffectPaise === null ? "unavailable" : money(r.cashEffectPaise)}`}
            </p>
          ))}
          {(rows as RecordData[]).length > 50 && (
            <p>
              {(rows as RecordData[]).length} sources in saved report; first 50
              shown.
            </p>
          )}
        </div>
      ))}
      <h3 className="font-bold">Day activity totals</h3>
      {Object.entries(model.activityTotals || {}).map(([label, value]) => (
        <p key={label}>
          {label} · {money((value as RecordData).amountPaise)} ·{" "}
          {(value as RecordData).count} sources
        </p>
      ))}
      <h3 className="font-bold">Late activity totals</h3>
      {Object.entries(model.lateTotals || {}).map(([label, value]) => (
        <p key={label}>
          {label} · {money((value as RecordData).amountPaise)}
        </p>
      ))}
      <h3 className="font-bold">
        Late shift activity for previously closed dates (not revenue)
      </h3>
      {model.lateShiftSummaries?.map((s: RecordData) => (
        <p key={s.key}>
          {s.date} · {s.openerName || s.actorId} · Shift {s.event} · Opening{" "}
          {money(s.openingPaise)}
          {s.differencePaise != null &&
            ` · Expected ${money(s.expectedPaise)} · Counted ${money(s.countedPaise)} · Difference ${money(s.differencePaise)}`}{" "}
          {s.reason}
        </p>
      ))}
      <h3 className="font-bold">Shift summaries (not additional revenue)</h3>
      {model.shiftSummaries?.map((s: RecordData) => (
        <p key={s.id}>
          {s.openerName || s.actorId} · {s.openedDate} →{" "}
          {s.closedDate || "Open"} · Opening {money(s.openingPaise)} · Expected{" "}
          {money(s.expectedPaise)}
          {s.differencePaise != null &&
            ` · Difference ${money(s.differencePaise)}`}{" "}
          {s.reason}
        </p>
      ))}
      <h3 className="font-bold">Outstanding at review</h3>
      <p>
        {model.pagination?.counts.unresolved ?? model.unresolved?.length}{" "}
        reservations with balances or operational work ·{" "}
        {model.pagination?.counts.pendingRefunds ??
          model.pendingRefunds?.length}{" "}
        pending refunds ·{" "}
        {model.pagination?.counts.openShifts ?? model.openShifts?.length} open
        shifts
      </p>
      {model.unresolved?.slice(0, 50).map((r: RecordData) => (
        <p className="break-words" key={r.bookingId}>
          {r.reference || r.bookingId} {r.guestName && `· ${r.guestName}`} ·
          Reservation balance {money(r.reservationBalancePaise)} · Separate
          service balance {money(r.serviceBalancePaise)} · Pending refunds{" "}
          {money(r.pendingRefundPaise)} · {r.queues.join(", ")}
        </p>
      ))}
      <h4 className="font-semibold">Pending refund detail</h4>
      {model.pendingRefunds?.map((r: RecordData) => (
        <p className="break-all" key={r.id}>
          {r.id} · Reservation {r.bookingId} · {money(r.amountPaise)} ·{" "}
          {r.status}
        </p>
      ))}
      <h4 className="font-semibold">Open shift detail</h4>
      {model.openShifts?.map((s: RecordData) => (
        <p className="break-all" key={s.id}>
          {s.openerName || s.actorId} · Opened {s.openedDate} · {s.id}
        </p>
      ))}
      <p className="text-sm">
        {model.coverage?.description} Reporting begins {model.reportingStart}.
      </p>
    </div>
  );
}
