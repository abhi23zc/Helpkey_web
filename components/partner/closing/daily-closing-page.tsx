"use client";

import { useEffect, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Printer,
  RotateCcw,
  CheckCircle2,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import type { RecordData } from "@/lib/partner/dashboard/domain";
import { PartnerShell } from "../dashboard/partner-shell";
import { PartnerDatePicker } from "../dashboard/partner-date-picker";
import { useHotelCapabilities } from "../dashboard/hotel-capabilities";
import { ReservationWorkspace } from "../dashboard/reservation-workspace";
import { DailyClosingKpis } from "./daily-closing-kpis";
import { DailyClosingBlockers } from "./daily-closing-blockers";
import { DailyClosingTabs } from "./daily-closing-tabs";
import { DailyClosingSignoff } from "./daily-closing-signoff";
import {
  computeDailyKpis,
  formatClosingDate,
  formatClosingDateTime,
} from "./closing-formatters";

export function DailyClosingPage() {
  return (
    <PartnerShell>
      {({ selectedProperty, user }) =>
        selectedProperty && user ? (
          <DailyClosingWorkspace
            key={`${user.uid}:${selectedProperty.id}`}
            hotel={selectedProperty.id}
            name={selectedProperty.name}
          />
        ) : (
          <div className="rounded-2xl bg-white p-8 border border-slate-200">
            <h1 className="text-xl font-bold">Daily closing</h1>
            <p className="mt-2 text-sm text-slate-600">
              Select a hotel to manage daily financial closings.
            </p>
          </div>
        )
      }
    </PartnerShell>
  );
}

function DailyClosingWorkspace({
  hotel,
  name,
}: {
  hotel: string;
  name: string;
}) {
  const permits = useHotelCapabilities();
  const { appUser } = useAuth();
  const client = useQueryClient();
  const url = "/api/partner/daily-closing";

  // URL state & selections
  const [selectedReportId, setSelectedReportId] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [page, setPage] = useState(0);
  const [beforeCursor, setBeforeCursor] = useState("");

  // Form state
  const [note, setNote] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reviewVersion, setReviewVersion] = useState<string | number | null>(
    null,
  );

  // Embedded ReservationWorkspace Drawer state
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);

  // Idempotency pending recovery
  const storageKey = `helpkey-closing:${appUser?.uid}:${hotel}:daily`;
  const [pending, setPending] = useState<{
    key: string;
    body: string;
    uncertain?: boolean;
  } | null>(null);
  const [loaded, setLoaded] = useState(false);

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
          "Saved submission could not be loaded. Clear your browser draft or retry.",
        );
      }
    });
    return () => {
      active = false;
    };
  }, [storageKey]);

  // 1. Daily History Query
  const history = useQuery<RecordData>({
    queryKey: ["partner", hotel, "daily-history", beforeCursor],
    queryFn: () =>
      apiFetch(
        `${url}?${new URLSearchParams({ propertyId: hotel, ...(beforeCursor ? { before: beforeCursor } : {}) })}`,
      ),
    staleTime: 30_000,
    retry: false,
  });

  const timezone = history.data?.timezone || "Asia/Kolkata";
  const effectiveDate =
    selectedDate || history.data?.nextDate || history.data?.today || "";

  // 2. Detail Query (Live review or saved permanent report)
  const detail = useQuery<RecordData>({
    queryKey: [
      "partner",
      hotel,
      "daily-detail",
      selectedReportId,
      effectiveDate,
      page,
    ],
    enabled: !!(selectedReportId || effectiveDate),
    queryFn: () =>
      apiFetch(
        `${url}?${new URLSearchParams({
          propertyId: hotel,
          page: String(page),
          ...(selectedReportId
            ? { id: selectedReportId }
            : { date: effectiveDate }),
        })}`,
      ),
    staleTime: selectedReportId ? Infinity : 15_000,
    retry: false,
  });

  const model = detail.data;
  const isClosedReport = Boolean(model?.report || selectedReportId);
  const activeReport = model?.report || model;

  const kpis = useMemo(() => computeDailyKpis(activeReport), [activeReport]);

  const refreshAll = () => {
    setReviewVersion(null);
    return client.invalidateQueries({ queryKey: ["partner", hotel] });
  };

  // Submission handler with robust idempotency recovery
  async function submitClosing() {
    setError("");
    setSuccess("");
    setBusy(true);
    let request = pending;

    try {
      if (!request) {
        const body = {
          propertyId: hotel,
          date: effectiveDate,
          version: reviewVersion ?? activeReport?.version,
          note,
          acknowledge: ack,
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
      setNote("");
      setAck(false);
      setSelectedReportId("");
      setPage(0);
      setReviewVersion(null);
      setSuccess("Daily report saved permanently.");
      await refreshAll();
    } catch (e) {
      const definitive =
        e instanceof ApiClientError &&
        [
          "REVIEW_CHANGED",
          "REASON_REQUIRED",
          "ACKNOWLEDGEMENT_REQUIRED",
          "CLOSING_BLOCKED",
          "FEATURE_DISABLED",
          "UNSUPPORTED_DATE",
          "DAY_ALREADY_CLOSED",
          "VALIDATION_ERROR",
        ].includes(e.code);

      // Definitive rejections mean the server evaluated the request identity and rejected before saving;
      // it is safe to unlock the draft so the user isn't permanently locked out
      if (definitive) {
        localStorage.removeItem(storageKey);
        setPending(null);
        setReviewVersion(null);
        void refreshAll();
      } else if (request) {
        setPending({ ...request, uncertain: true });
      }

      setError(
        e instanceof Error
          ? e.message
          : "Submission outcome is uncertain. Retry the saved request or refresh.",
      );
    } finally {
      setBusy(false);
    }
  }

  function discardPendingRequest() {
    localStorage.removeItem(storageKey);
    setPending(null);
    setError("");
    void refreshAll();
  }

  const printUrl = (id: string) =>
    `${url}/print?${new URLSearchParams({ propertyId: hotel, id })}`;

  const canClose = permits("closing.manage");

  return (
    <section className="space-y-5 print:bg-white pb-12">
      {/* 1. Header with Hotel Context & Toolbar */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#061224]">
              Daily closing
            </h1>
            {isClosedReport ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Permanent Report
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                Live Review
              </span>
            )}
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 font-medium">
            {name} · {timezone} · Day activity, staff drawer floats, and
            outstanding work are recorded separately.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5 print:hidden">
          {/* Hotel Date Picker */}
          {!selectedReportId && (
            <div className="w-44 sm:w-48">
              <PartnerDatePicker
                value={effectiveDate}
                timezone={timezone}
                aria-label="Hotel date to close"
                disabled={Boolean(pending)}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedReportId("");
                  setPage(0);
                  setReviewVersion(null);
                }}
              />
            </div>
          )}

          {selectedReportId && (
            <button
              type="button"
              onClick={() => {
                setSelectedReportId("");
                setPage(0);
                setReviewVersion(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-[#061224] shadow-xs hover:bg-slate-50 transition-all"
            >
              <span>Back to current review</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void refreshAll()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-[#061224] shadow-xs hover:bg-slate-50 transition-all"
            title="Refresh review facts"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>

          {isClosedReport && selectedReportId && (
            <button
              type="button"
              onClick={() =>
                window.open(
                  printUrl(selectedReportId),
                  "_blank",
                  "noopener,noreferrer",
                )
              }
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#061224] hover:bg-[#0a1f3c] text-white px-4 py-2.5 text-xs font-bold shadow-xs active:scale-95 transition-all"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print</span>
            </button>
          )}
        </div>
      </header>

      {/* 2. Feedback Banners */}
      {/* A. Pending / Recovered Request Alert */}
      {pending && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-xs"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0" />
            <p className="text-xs font-semibold text-amber-950">
              A saved closing submission is awaiting confirmation. Retry to
              complete the report or discard to restart.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void submitClosing()}
              className="rounded-xl bg-[#061224] text-white px-3.5 py-1.5 text-xs font-bold hover:bg-[#0a1f3c]"
            >
              Retry saved request
            </button>
            <button
              type="button"
              onClick={discardPendingRequest}
              className="rounded-xl border border-amber-300 bg-white text-amber-900 px-3 py-1.5 text-xs font-semibold hover:bg-amber-100/50"
            >
              Discard draft
            </button>
          </div>
        </div>
      )}

      {/* B. Error Banner */}
      {(error || history.error || detail.error) && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-900 shadow-xs"
        >
          <ShieldAlert className="h-5 w-5 text-rose-700 shrink-0" />
          <span>
            {error ||
              `Review unavailable: ${history.error?.message || detail.error?.message}`}
          </span>
        </div>
      )}

      {/* C. Success Banner */}
      {success && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-900 shadow-xs"
        >
          <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* D. "All Caught Up" Banner when date closed */}
      {history.data?.allClosedThroughToday &&
        !selectedReportId &&
        !model?.blockers?.length && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <strong className="text-xs font-bold text-emerald-950">
                Daily reports are up to date
              </strong>
              <p className="text-xs text-emerald-800">
                All dates through today (
                {formatClosingDate(history.data.today, timezone)}) have been
                closed and recorded.
              </p>
            </div>
          </div>
        )}

      {/* 3. Action Blockers Card (Priority 1) */}
      {!isClosedReport && model?.blockers && model.blockers.length > 0 && (
        <DailyClosingBlockers
          rawBlockers={model.blockers}
          onOpenBooking={(id, section) => setActiveBookingId(id)}
        />
      )}

      {/* 4. Executive KPI Strip (Priority 2) */}
      <DailyClosingKpis kpis={kpis} loading={detail.isFetching && !model} />

      {/* 5. Main Content: Tabs (Left) + Sign-Off Rail (Right) */}
      {activeReport ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_340px] items-start">
          {/* Left Column: Tabbed Data Tables */}
          <DailyClosingTabs
            model={activeReport}
            page={page}
            onPageChange={(newPage) => setPage(newPage)}
            onOpenBooking={(id, section) => setActiveBookingId(id)}
            timezone={timezone}
          />

          {/* Right Column: Sign-off & History */}
          <div className="xl:sticky xl:top-4 space-y-4">
            <DailyClosingSignoff
              isClosed={isClosedReport}
              canClose={canClose}
              busy={busy}
              loaded={loaded}
              blockersCount={kpis.blockersCount}
              note={note}
              onNoteChange={setNote}
              ack={ack}
              onAckChange={setAck}
              onSubmit={submitClosing}
              historyReports={history.data?.reports || []}
              onSelectHistoryReport={(id) => {
                setSelectedReportId(id);
                setPage(0);
                setReviewVersion(null);
              }}
              selectedReportId={selectedReportId}
              activeReport={activeReport}
              onPrintReport={(id) =>
                window.open(printUrl(id), "_blank", "noopener,noreferrer")
              }
              timezone={timezone}
              before={beforeCursor}
              onBeforeChange={(cur) => setBeforeCursor(cur)}
              nextCursor={history.data?.nextCursor}
            />
          </div>
        </div>
      ) : detail.isFetching ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          <CalendarDays className="mx-auto h-8 w-8 text-slate-300 animate-pulse mb-3" />
          <p className="text-sm font-semibold text-[#061224]">
            Loading daily review for{" "}
            {formatClosingDate(effectiveDate, timezone)}…
          </p>
        </div>
      ) : null}

      {/* 6. Embedded Slide-Over ReservationWorkspace Drawer */}
      {activeBookingId && (
        <ReservationWorkspace
          bookingId={activeBookingId}
          propertyId={hotel}
          onChanged={() => void refreshAll()}
          onClose={() => setActiveBookingId(null)}
        />
      )}
    </section>
  );
}
