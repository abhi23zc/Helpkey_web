"use client";

import { useState } from "react";
import {
  CreditCard,
  Wallet,
  UsersRound,
  History,
  CheckCircle2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { RecordData } from "@/lib/partner/dashboard/domain";
import {
  formatActivityType,
  formatPaymentMethod,
  formatOwnership,
  formatMoney,
  formatClosingDateTime,
  formatClosingDate,
  parseTotalsKey,
  QUEUE_LABELS,
  REFUND_STATUS_LABELS,
} from "./closing-formatters";

type Props = {
  model: RecordData;
  page: number;
  onPageChange: (newPage: number) => void;
  onOpenBooking: (bookingId: string, section?: string) => void;
  timezone?: string;
};

export function DailyClosingTabs({
  model,
  page,
  onPageChange,
  onOpenBooking,
  timezone = "Asia/Kolkata",
}: Props) {
  const [activeTab, setActiveTab] = useState<"activity" | "shifts" | "outstanding" | "late">("activity");

  const activityRows = (model.activity || []) as RecordData[];
  const lateRows = (model.late || []) as RecordData[];
  const shiftSummaries = (model.shiftSummaries || []) as RecordData[];
  const lateShiftSummaries = (model.lateShiftSummaries || []) as RecordData[];
  const unresolvedRows = (model.unresolved || []) as RecordData[];
  const pendingRefunds = (model.pendingRefunds || []) as RecordData[];
  const openShifts = (model.openShifts || []) as RecordData[];

  const activityCounts = model.pagination?.counts?.activity ?? activityRows.length;
  const shiftCounts = (model.pagination?.counts?.shiftSummaries ?? shiftSummaries.length) + openShifts.length;
  const outstandingCounts =
    (model.pagination?.counts?.unresolved ?? unresolvedRows.length) +
    (model.pagination?.counts?.pendingRefunds ?? pendingRefunds.length);
  const lateCounts =
    (model.pagination?.counts?.late ?? lateRows.length) +
    (model.pagination?.counts?.lateShiftSummaries ?? lateShiftSummaries.length);

  const hasMore = Boolean(model.pagination?.more);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
      {/* Tab Navigation Strip */}
      <div className="flex border-b border-slate-200/80 bg-[#fbfbf9] px-2 sm:px-4 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab("activity")}
          className={`flex shrink-0 items-center gap-2 border-b-2 py-3.5 px-3 text-xs sm:text-sm font-bold transition-colors ${
            activeTab === "activity"
              ? "border-[#c89b3c] text-[#061224]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <CreditCard className="h-4 w-4" />
          <span>Day Activity</span>
          <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[11px] font-bold text-slate-700">
            {activityCounts}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("shifts")}
          className={`flex shrink-0 items-center gap-2 border-b-2 py-3.5 px-3 text-xs sm:text-sm font-bold transition-colors ${
            activeTab === "shifts"
              ? "border-[#c89b3c] text-[#061224]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Wallet className="h-4 w-4" />
          <span>Cashier Shifts</span>
          <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[11px] font-bold text-slate-700">
            {shiftCounts}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("outstanding")}
          className={`flex shrink-0 items-center gap-2 border-b-2 py-3.5 px-3 text-xs sm:text-sm font-bold transition-colors ${
            activeTab === "outstanding"
              ? "border-[#c89b3c] text-[#061224]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <UsersRound className="h-4 w-4" />
          <span>Outstanding & Refunds</span>
          <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[11px] font-bold text-slate-700">
            {outstandingCounts}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("late")}
          className={`flex shrink-0 items-center gap-2 border-b-2 py-3.5 px-3 text-xs sm:text-sm font-bold transition-colors ${
            activeTab === "late"
              ? "border-[#c89b3c] text-[#061224]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <History className="h-4 w-4" />
          <span>Late Activity</span>
          {lateCounts > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
              {lateCounts}
            </span>
          )}
        </button>
      </div>

      {/* Tab Contents */}
      <div className="p-4 sm:p-6 min-h-[380px]">
        {/* TAB 1: DAY ACTIVITY */}
        {activeTab === "activity" && (
          <div className="space-y-6">
            {/* Activity Summary Grouping Table */}
            {Object.keys(model.activityTotals || {}).length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                  Category & Method Summary
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200/70">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#fcfbf9] border-b border-slate-200/70 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Transaction</th>
                        <th className="py-2.5 px-3">Payment Method</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3 text-right">Transactions</th>
                        <th className="py-2.5 px-3 text-right">Physical Cash Effect</th>
                        <th className="py-2.5 px-3 text-right">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800 font-medium tabular-nums">
                      {Object.entries(model.activityTotals || {}).map(([rawKey, val]) => {
                        const parsed = parseTotalsKey(rawKey);
                        const data = val as { amountPaise: number; cashEffectPaise: number | null; count: number };
                        return (
                          <tr key={rawKey} className="hover:bg-slate-50/60">
                            <td className="py-2.5 px-3 font-bold text-[#061224]">{parsed.typeLabel}</td>
                            <td className="py-2.5 px-3">{parsed.methodLabel}</td>
                            <td className="py-2.5 px-3">{parsed.ownershipLabel}</td>
                            <td className="py-2.5 px-3 text-right">{data.count}</td>
                            <td className="py-2.5 px-3 text-right text-slate-600">
                              {data.cashEffectPaise === null ? "—" : formatMoney(data.cashEffectPaise)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-[#061224]">
                              {formatMoney(data.amountPaise)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Individual Activity Rows */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                Itemized Activity Records ({activityRows.length})
              </h3>
              {activityRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
                  <CreditCard className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                  <p className="text-sm font-semibold">No payment activity recorded on this date.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200/70">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#fcfbf9] border-b border-slate-200/70 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Time</th>
                        <th className="py-2.5 px-3">Activity</th>
                        <th className="py-2.5 px-3">Method & Ownership</th>
                        <th className="py-2.5 px-3">Reservation</th>
                        <th className="py-2.5 px-3 text-right">Cash Effect</th>
                        <th className="py-2.5 px-3 text-right">Amount</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800 font-medium tabular-nums">
                      {activityRows.map((r) => (
                        <tr key={r.key} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-3 text-slate-500 font-normal">
                            {formatClosingDateTime(r.occurredAt, timezone)}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-[#061224]">
                            {formatActivityType(r.type)}
                            {r.unattributed && (
                              <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                Unattributed
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {formatPaymentMethod(r.method)} · {formatOwnership(r.ownership)}
                          </td>
                          <td className="py-2.5 px-3">
                            {r.bookingReference || r.bookingId ? (
                              <button
                                type="button"
                                onClick={() => onOpenBooking(r.bookingId, "payments")}
                                className="font-bold text-[#061224] hover:text-[#c89b3c] hover:underline"
                              >
                                {r.bookingReference || r.bookingId}
                                {r.guestName && ` (${r.guestName})`}
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-600">
                            {r.cashEffectPaise === null ? "—" : formatMoney(r.cashEffectPaise)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-[#061224]">
                            {formatMoney(r.amountPaise)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {r.bookingId && (
                              <button
                                type="button"
                                onClick={() => onOpenBooking(r.bookingId, "payments")}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#c89b3c] hover:underline"
                              >
                                <span>Details</span>
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: CASHIER SHIFTS */}
        {activeTab === "shifts" && (
          <div className="space-y-6">
            {/* Open Shifts Banner */}
            {openShifts.length > 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 mb-1">
                  Open Cashier Shifts ({openShifts.length})
                </h4>
                <p className="text-xs text-amber-800 mb-3">
                  All cashier shifts opened on or before the closing date must be reconciled and closed by their opener.
                </p>
                <div className="space-y-2">
                  {openShifts.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded-lg bg-white p-3 border border-amber-200 text-xs shadow-2xs"
                    >
                      <div>
                        <strong className="text-sm font-bold text-[#061224]">{s.openerName || "Staff Member"}</strong>
                        <p className="text-slate-500">Opened on {formatClosingDate(s.openedDate, timezone)}</p>
                      </div>
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                        Shift Open
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Shift Summaries */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                Staff Shift Summaries ({shiftSummaries.length})
              </h3>
              {shiftSummaries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
                  <Wallet className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                  <p className="text-sm font-semibold">No cashier shifts active on this date.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200/70">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#fcfbf9] border-b border-slate-200/70 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Staff Opener</th>
                        <th className="py-2.5 px-3">Active Dates</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Opening Float</th>
                        <th className="py-2.5 px-3 text-right">Expected Drawer</th>
                        <th className="py-2.5 px-3 text-right">Counted Cash</th>
                        <th className="py-2.5 px-3 text-right">Discrepancy</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800 font-medium tabular-nums">
                      {shiftSummaries.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-3 font-bold text-[#061224]">{s.openerName || s.actorId}</td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {formatClosingDate(s.openedDate, timezone)} →{" "}
                            {s.closedDate ? formatClosingDate(s.closedDate, timezone) : "Open"}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                s.status === "closed"
                                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                  : "bg-amber-50 text-amber-800 border border-amber-200"
                              }`}
                            >
                              {s.status === "closed" ? "Closed" : "Open"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">{formatMoney(s.openingPaise)}</td>
                          <td className="py-2.5 px-3 text-right font-semibold text-[#061224]">
                            {formatMoney(s.expectedPaise)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-[#061224]">
                            {s.countedPaise != null ? formatMoney(s.countedPaise) : "—"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold">
                            {s.differencePaise != null ? (
                              <span className={s.differencePaise === 0 ? "text-emerald-700" : "text-rose-700"}>
                                {formatMoney(s.differencePaise)}
                              </span>
                            ) : (
                              "—"
                            )}
                            {s.reason && <p className="text-[10px] font-normal text-slate-500">{s.reason}</p>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: OUTSTANDING & REFUNDS */}
        {activeTab === "outstanding" && (
          <div className="space-y-6">
            {/* Unresolved Reservations */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                Reservations with Balances or Tasks ({unresolvedRows.length})
              </h3>
              {unresolvedRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
                  <p className="text-sm font-semibold">No folios with pending balances or operational tasks.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200/70">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#fcfbf9] border-b border-slate-200/70 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Reservation</th>
                        <th className="py-2.5 px-3">Guest Name</th>
                        <th className="py-2.5 px-3">Operational Status</th>
                        <th className="py-2.5 px-3 text-right">Stay Balance</th>
                        <th className="py-2.5 px-3 text-right">Service Balance</th>
                        <th className="py-2.5 px-3 text-right">Pending Refund</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800 font-medium tabular-nums">
                      {unresolvedRows.map((r) => (
                        <tr key={r.bookingId} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-3 font-bold text-[#061224]">
                            <button
                              type="button"
                              onClick={() => onOpenBooking(r.bookingId)}
                              className="hover:text-[#c89b3c] hover:underline"
                            >
                              {r.reference || r.bookingId}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-700">{r.guestName || "Guest"}</td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-wrap gap-1">
                              {(r.queues || []).length > 0 ? (
                                (r.queues as string[]).map((q) => {
                                  const def = QUEUE_LABELS[q] || { label: q, tone: "slate" };
                                  return (
                                    <span
                                      key={q}
                                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                        def.tone === "rose"
                                          ? "bg-rose-50 text-rose-800 border border-rose-200"
                                          : def.tone === "amber"
                                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                                            : "bg-slate-100 text-slate-700"
                                      }`}
                                    >
                                      {def.label}
                                    </span>
                                  );
                                })
                              ) : (
                                <span className="text-slate-400">Standard</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold">
                            {formatMoney(r.reservationBalancePaise)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold">
                            {formatMoney(r.serviceBalancePaise)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-rose-700">
                            {formatMoney(r.pendingRefundPaise)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => onOpenBooking(r.bookingId)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#c89b3c] hover:underline"
                            >
                              <span>Folio</span>
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pending Refunds */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                Pending Provider Refunds ({pendingRefunds.length})
              </h3>
              {pendingRefunds.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
                  <p className="text-sm font-semibold">No pending refunds awaiting execution.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200/70">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#fcfbf9] border-b border-slate-200/70 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Reservation</th>
                        <th className="py-2.5 px-3">Guest Name</th>
                        <th className="py-2.5 px-3">Refund Status</th>
                        <th className="py-2.5 px-3 text-right">Amount</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800 font-medium tabular-nums">
                      {pendingRefunds.map((r) => {
                        const statusDef = REFUND_STATUS_LABELS[r.status] || { label: r.status, tone: "neutral" };
                        return (
                          <tr key={r.id} className="hover:bg-slate-50/60">
                            <td className="py-2.5 px-3 font-bold text-[#061224]">
                              <button
                                type="button"
                                onClick={() => onOpenBooking(r.bookingId, "payments")}
                                className="hover:text-[#c89b3c] hover:underline"
                              >
                                {r.bookingReference || r.bookingId}
                              </button>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-700">{r.guestName || "Guest"}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  statusDef.tone === "rose"
                                    ? "bg-rose-50 text-rose-800 border border-rose-200"
                                    : "bg-amber-50 text-amber-800 border border-amber-200"
                                }`}
                              >
                                {statusDef.label}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-rose-700">
                              {formatMoney(r.amountPaise)}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => onOpenBooking(r.bookingId, "payments")}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#c89b3c] hover:underline"
                              >
                                <span>Payments</span>
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: LATE ACTIVITY */}
        {activeTab === "late" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Late Activity for Previously Closed Dates ({lateRows.length})
              </h3>
              <p className="text-xs text-slate-500 mb-3">
                Transactions with original dates preceding this closing that committed after the earlier date was closed.
                Original dates are preserved.
              </p>
              {lateRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
                  <p className="text-sm font-semibold">No late transactions for earlier closed dates.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200/70">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#fcfbf9] border-b border-slate-200/70 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Original Date</th>
                        <th className="py-2.5 px-3">Activity</th>
                        <th className="py-2.5 px-3">Method & Ownership</th>
                        <th className="py-2.5 px-3">Reservation</th>
                        <th className="py-2.5 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800 font-medium tabular-nums">
                      {lateRows.map((r) => (
                        <tr key={r.key} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-3 font-bold text-[#061224]">
                            {formatClosingDate(r.date, timezone)}
                          </td>
                          <td className="py-2.5 px-3">{formatActivityType(r.type)}</td>
                          <td className="py-2.5 px-3">
                            {formatPaymentMethod(r.method)} · {formatOwnership(r.ownership)}
                          </td>
                          <td className="py-2.5 px-3">
                            {r.bookingReference || r.bookingId ? (
                              <button
                                type="button"
                                onClick={() => onOpenBooking(r.bookingId, "payments")}
                                className="font-bold text-[#061224] hover:text-[#c89b3c] hover:underline"
                              >
                                {r.bookingReference || r.bookingId}
                                {r.guestName && ` (${r.guestName})`}
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-[#061224]">
                            {formatMoney(r.amountPaise)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Late Shift Activity */}
            {lateShiftSummaries.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Late Shift Activity ({lateShiftSummaries.length})
                </h3>
                <p className="text-xs text-slate-500 mb-3">
                  Cashier shifts opened or closed for prior dates after earlier daily reports were created.
                </p>
                <div className="overflow-x-auto rounded-xl border border-slate-200/70">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#fcfbf9] border-b border-slate-200/70 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Original Date</th>
                        <th className="py-2.5 px-3">Staff Opener</th>
                        <th className="py-2.5 px-3">Event</th>
                        <th className="py-2.5 px-3 text-right">Opening Float</th>
                        <th className="py-2.5 px-3 text-right">Counted Cash</th>
                        <th className="py-2.5 px-3 text-right">Difference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800 font-medium tabular-nums">
                      {lateShiftSummaries.map((s) => (
                        <tr key={s.key} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-3 font-bold text-[#061224]">
                            {formatClosingDate(s.date, timezone)}
                          </td>
                          <td className="py-2.5 px-3">{s.openerName || s.actorId}</td>
                          <td className="py-2.5 px-3 font-semibold capitalize">{s.event}</td>
                          <td className="py-2.5 px-3 text-right">{formatMoney(s.openingPaise)}</td>
                          <td className="py-2.5 px-3 text-right">
                            {s.countedPaise != null ? formatMoney(s.countedPaise) : "—"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold">
                            {s.differencePaise != null ? (
                              <span className={s.differencePaise === 0 ? "text-emerald-700" : "text-rose-700"}>
                                {formatMoney(s.differencePaise)}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pagination Bar */}
        {(page > 0 || hasMore) && (
          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 print:hidden">
            <span className="text-xs text-slate-500 font-medium">Page {page + 1}</span>
            <div className="flex gap-2">
              {page > 0 && (
                <button
                  type="button"
                  onClick={() => onPageChange(page - 1)}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-[#061224] shadow-2xs hover:bg-slate-50"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Previous</span>
                </button>
              )}
              {hasMore && (
                <button
                  type="button"
                  onClick={() => onPageChange(page + 1)}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-[#061224] shadow-2xs hover:bg-slate-50"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
