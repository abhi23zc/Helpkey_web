"use client";

import { CheckCircle2, Lock, FileText, Printer, ChevronRight } from "lucide-react";
import type { RecordData } from "@/lib/partner/dashboard/domain";
import { formatClosingDate, formatClosingDateTime } from "./closing-formatters";

type Props = {
  isClosed: boolean;
  canClose: boolean;
  busy: boolean;
  loaded: boolean;
  blockersCount: number;
  note: string;
  onNoteChange: (note: string) => void;
  ack: boolean;
  onAckChange: (ack: boolean) => void;
  onSubmit: () => void;
  historyReports?: RecordData[];
  onSelectHistoryReport: (reportId: string) => void;
  selectedReportId?: string;
  activeReport?: RecordData;
  onPrintReport?: (reportId: string) => void;
  timezone?: string;
  before?: string;
  onBeforeChange?: (before: string) => void;
  nextCursor?: string | null;
};

export function DailyClosingSignoff({
  isClosed,
  canClose,
  busy,
  loaded,
  blockersCount,
  note,
  onNoteChange,
  ack,
  onAckChange,
  onSubmit,
  historyReports = [],
  onSelectHistoryReport,
  selectedReportId,
  activeReport,
  onPrintReport,
  timezone = "Asia/Kolkata",
  before,
  onBeforeChange,
  nextCursor,
}: Props) {
  return (
    <div className="space-y-4">
      {/* 1. Finalize / Closed Report Card */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <span
            className={`grid h-8 w-8 place-items-center rounded-xl ${
              isClosed ? "bg-emerald-50 text-emerald-700" : "bg-[#fbf5e8] text-[#c89b3c]"
            }`}
          >
            {isClosed ? <CheckCircle2 className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          </span>
          <div>
            <h3 className="text-sm font-bold text-[#061224]">
              {isClosed ? "Saved Permanent Report" : "Finalize Daily Report"}
            </h3>
            <p className="text-[11px] font-medium text-slate-500">
              {isClosed ? "Archived immutable closing summary" : "End-of-day sign-off and permanent freeze"}
            </p>
          </div>
        </div>

        {isClosed ? (
          <div className="mt-4 space-y-3 text-xs">
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200/60 space-y-1.5">
              <p className="text-slate-500">
                Closed by: <strong className="text-[#061224]">{activeReport?.actorName || "Manager"}</strong>
              </p>
              <p className="text-slate-500">
                Closed at:{" "}
                <strong className="text-[#061224]">
                  {formatClosingDateTime(activeReport?.closedAt, timezone)}
                </strong>
              </p>
              {activeReport?.note && (
                <p className="text-slate-600 italic mt-1 border-t border-slate-200/50 pt-1.5">
                  “{activeReport.note}”
                </p>
              )}
            </div>

            <p className="text-[11px] text-slate-500">
              This permanent summary does not change after later hotel activity. Any subsequent activity commits to later daily reports.
            </p>

            {onPrintReport && selectedReportId && (
              <button
                type="button"
                onClick={() => onPrintReport(selectedReportId)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#061224] hover:bg-[#0a1f3c] text-white px-4 py-2.5 text-xs font-bold shadow-xs active:scale-95 transition-all"
              >
                <Printer className="h-4 w-4" />
                <span>Print saved summary</span>
              </button>
            )}
          </div>
        ) : (
          <form
            className="mt-4 space-y-4 print:hidden"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            <label className="block text-xs font-semibold text-slate-700">
              Closing note
              <textarea
                className="mt-1.5 min-h-20 w-full rounded-xl border border-slate-200 bg-[#fcfbf9] p-2.5 text-xs text-[#061224] placeholder-slate-400 focus:border-[#c89b3c] focus:bg-white focus:outline-none transition-all disabled:opacity-50"
                placeholder="Optional supervisor or manager notes for today’s closing..."
                value={note}
                disabled={busy}
                maxLength={2000}
                onChange={(e) => onNoteChange(e.target.value)}
              />
            </label>

            <label className="flex items-start gap-2.5 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={ack}
                disabled={busy}
                onChange={(e) => onAckChange(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#c89b3c] focus:ring-[#c89b3c]"
              />
              <span>I acknowledge the current guest balances, pending refunds and outstanding operational work.</span>
            </label>

            {blockersCount > 0 && (
              <p className="rounded-lg bg-rose-50 p-2.5 text-[11px] font-semibold text-rose-800 border border-rose-200/80">
                Closing is blocked: resolve the {blockersCount} {blockersCount === 1 ? "item" : "items"} shown in the action card above to proceed.
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !loaded || blockersCount > 0 || !canClose}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#061224] hover:bg-[#0a1f3c] disabled:bg-slate-200 disabled:text-slate-400 text-white px-4 py-3 text-xs font-bold shadow-xs active:scale-95 transition-all"
            >
              <Lock className="h-4 w-4" />
              <span>{busy ? "Saving report…" : "Confirm permanent daily report"}</span>
            </button>
          </form>
        )}
      </div>

      {/* 2. Closing History Rail */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs print:hidden">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-100 text-slate-600">
              <FileText className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-bold text-[#061224]">Closing History</h3>
          </div>
          {before && (
            <button
              type="button"
              onClick={() => onBeforeChange?.("")}
              className="text-[11px] font-bold text-[#c89b3c] hover:underline"
            >
              Latest
            </button>
          )}
        </div>

        <div className="mt-3 space-y-2">
          {historyReports.length === 0 ? (
            <p className="text-xs text-slate-500 py-3 text-center">
              {before ? "No reports on this page." : "No daily closing reports saved yet."}
            </p>
          ) : (
            historyReports.map((r) => {
              const isSelected = r.id === selectedReportId;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onSelectHistoryReport(r.id)}
                  className={`w-full flex items-center justify-between rounded-xl p-2.5 text-left text-xs transition-all ${
                    isSelected
                      ? "border border-[#c89b3c] bg-[#fbf5e8]/80 text-[#061224] font-bold shadow-2xs"
                      : "border border-slate-100 hover:border-slate-200 hover:bg-[#fcfbf9] text-slate-700"
                  }`}
                >
                  <div>
                    <strong className="block text-xs font-bold text-[#061224]">
                      {formatClosingDate(r.date, timezone)}
                    </strong>
                    <span className="text-[11px] text-slate-500">{r.actorName || "Staff"}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>
              );
            })
          )}
        </div>

        {nextCursor && (
          <button
            type="button"
            onClick={() => onBeforeChange?.(nextCursor)}
            className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-2 text-center text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Older reports
          </button>
        )}
      </div>
    </div>
  );
}
