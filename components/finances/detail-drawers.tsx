"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  Copy,
  ExternalLink,
  FileText,
  Info,
  Loader2,
  Paperclip,
  Printer,
  Undo2,
} from "lucide-react";
import { Drawer } from "@/components/partner/dashboard/drawer";
import { apiFetch } from "@/lib/api/client";
import type {
  OwnerActivityRowDto,
  OwnerBookingRowDto,
} from "@/lib/finances/service";
import type { OwnerDuesReportDto } from "@/lib/dues/report-domain";
import {
  formatCurrency,
  formatHotelDate,
  formatHotelDateTime,
  formatMethod,
  reportStatusPresentation,
  stagePresentation,
} from "./format";
import type { ReportDraftSeed } from "./report-payment-drawer";

export function BookingSettlementDetailDrawer({
  booking,
  propertyId,
  timezone,
  onClose,
}: {
  booking: OwnerBookingRowDto | null;
  propertyId: string;
  timezone: string;
  onClose: () => void;
}) {
  if (!booking) return null;
  const stage = stagePresentation(booking.stage);
  const reservationHref = `/partner/reservations?${new URLSearchParams({
    propertyId,
    bookingId: booking.bookingId,
  })}`;
  const statementHref = booking.payoutId
    ? `/api/partner/properties/${encodeURIComponent(propertyId)}/payouts/${encodeURIComponent(booking.payoutId)}/statement`
    : null;

  return (
    <Drawer
      open={!!booking}
      onClose={onClose}
      title={`Booking ${booking.reference}`}
      description={`Relevant date: ${formatHotelDate(booking.relevantDate, timezone)} (${timezone})`}
      badge={
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${stage.tone}`}
        >
          {stage.label}
        </span>
      }
    >
      <div className="space-y-5 p-4 sm:p-6">
        <div className="rounded-2xl border border-[#ede7dc] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Settlement status
          </p>
          <p className="mt-1.5 text-sm leading-6 text-[#061224]">
            {booking.ownerSummary}
          </p>
          {booking.beforeUnassessedDeductions && (
            <p className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              Displayed payable amount is before unassessed deductions. Final
              deductions have not been confirmed yet.
            </p>
          )}
          {booking.eligibleAt && booking.stage === "awaiting_waiting_period" && (
            <p className="mt-2 text-xs font-medium text-sky-800">
              Waiting period ends:{" "}
              {formatHotelDateTime(booking.eligibleAt, timezone)}
            </p>
          )}
        </div>

        <div className="space-y-2.5 rounded-2xl border border-[#ede7dc] bg-white p-4 text-sm">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Financial breakdown
          </h3>
          <div className="flex items-center justify-between py-1">
            <span className="text-slate-600">Online collected (Helpkey)</span>
            <span className="font-semibold text-[#061224]">
              {formatCurrency(booking.amounts.onlineCollectedPaise)}
            </span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-slate-600">Collected at hotel</span>
            <span className="font-semibold text-[#061224]">
              {formatCurrency(booking.amounts.hotelCollectedPaise)}
            </span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-slate-600">Helpkey commission</span>
            <span className="font-semibold text-[#061224]">
              {booking.amounts.commissionPaise !== null
                ? formatCurrency(booking.amounts.commissionPaise)
                : "Not finalized"}
            </span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-slate-600">
              Payable before deductions
            </span>
            <span className="font-semibold text-[#061224]">
              {booking.amounts.grossPayablePaise !== null
                ? formatCurrency(booking.amounts.grossPayablePaise)
                : "Not available"}
            </span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-slate-600">Deductions</span>
            <span
              className={`font-semibold ${booking.amounts.deductionsPaise === null ? "text-amber-800" : "text-[#061224]"}`}
            >
              {booking.amounts.deductionsPaise !== null
                ? formatCurrency(booking.amounts.deductionsPaise)
                : "Not reviewed yet"}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
            <span className="font-semibold text-[#061224]">
              Final payable to hotel
            </span>
            <span className="text-base font-bold text-[#061224]">
              {booking.amounts.finalPayablePaise !== null
                ? formatCurrency(booking.amounts.finalPayablePaise)
                : booking.beforeUnassessedDeductions
                  ? "Pending deduction review"
                  : "Not finalized"}
            </span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-slate-600">Dues owed to Helpkey</span>
            <span className="font-semibold text-[#061224]">
              {booking.amounts.duesPaise !== null
                ? formatCurrency(booking.amounts.duesPaise)
                : "Not available"}
            </span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-slate-600">Outstanding guest balance</span>
            <span className="font-semibold text-[#061224]">
              {booking.amounts.guestOutstandingPaise !== null
                ? formatCurrency(booking.amounts.guestOutstandingPaise)
                : "Not available"}
            </span>
          </div>
          {(booking.amounts.pendingOnlinePaise > 0 ||
            booking.amounts.pendingHotelPaise > 0) && (
            <div className="flex items-center justify-between pt-1 text-xs text-sky-900">
              <span>Pending checkout clearance</span>
              <span className="font-semibold">
                {formatCurrency(
                  booking.amounts.pendingOnlinePaise +
                    booking.amounts.pendingHotelPaise,
                )}
              </span>
            </div>
          )}
          {(booking.amounts.reviewOnlinePaise > 0 ||
            booking.amounts.reviewHotelPaise > 0) && (
            <div className="flex items-center justify-between pt-1 text-xs text-amber-900">
              <span>Held under evidence review</span>
              <span className="font-semibold">
                {formatCurrency(
                  booking.amounts.reviewOnlinePaise +
                    booking.amounts.reviewHotelPaise,
                )}
              </span>
            </div>
          )}
        </div>

        {booking.pendingReasons.length > 0 && (
          <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-950">
            <div className="flex items-center gap-2 font-bold">
              <Info className="h-4 w-4 shrink-0" />
              Why settlement is pending or excluded
            </div>
            <ul className="list-disc space-y-1 pl-4">
              {booking.pendingReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Link
            href={reservationHref}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#061224] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b1f3a]"
          >
            Open booking
            <ArrowUpRight className="h-4 w-4 text-[#c89b3c]" />
          </Link>
          {statementHref && (
            <a
              href={statementHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#061224] hover:bg-slate-50"
            >
              <Printer className="h-4 w-4 text-[#9a6b18]" />
              Printable statement
            </a>
          )}
        </div>
      </div>
    </Drawer>
  );
}

export function ActivityDetailDrawer({
  activity,
  propertyId,
  timezone,
  onClose,
}: {
  activity: OwnerActivityRowDto | null;
  propertyId: string;
  timezone: string;
  onClose: () => void;
}) {
  if (!activity) return null;
  return (
    <Drawer
      open={!!activity}
      onClose={onClose}
      title={activity.title}
      description={`${activity.purpose} · ${formatHotelDate(activity.localDate, timezone)}`}
      badge={
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
          {activity.status}
        </span>
      }
    >
      <div className="space-y-5 p-4 sm:p-6">
        <div className="space-y-2.5 rounded-2xl border border-[#ede7dc] bg-white p-4 text-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <span className="text-slate-500">Amount</span>
            <strong className="text-xl text-[#061224]">
              {formatCurrency(activity.amountPaise)}
            </strong>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Date</span>
            <span className="font-semibold text-[#061224]">
              {activity.occurredAt
                ? formatHotelDateTime(activity.occurredAt, timezone)
                : formatHotelDate(activity.localDate, timezone)}
            </span>
          </div>
          {activity.payoutReference && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Payout reference</span>
              <span className="font-semibold text-[#061224]">
                {activity.payoutReference}
              </span>
            </div>
          )}
          {activity.receiptReference && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Dues receipt</span>
              <span className="font-semibold text-[#061224]">
                {activity.receiptReference}
              </span>
            </div>
          )}
          {activity.paymentMethod && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Payment method</span>
              <span className="font-semibold text-[#061224]">
                {formatMethod(activity.paymentMethod)}
              </span>
            </div>
          )}
          {activity.transactionReference && (
            <div className="flex items-start justify-between gap-4">
              <span className="text-slate-500">Transaction reference</span>
              <span className="break-all text-right font-semibold text-[#061224]">
                {activity.transactionReference}
              </span>
            </div>
          )}
        </div>

        {activity.correctionReason && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950">
            <p className="font-bold">Recording correction</p>
            <p className="mt-1">{activity.correctionReason}</p>
          </div>
        )}

        {activity.statementUrl && (
          <div>
            <a
              href={activity.statementUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#061224] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b1f3a]"
            >
              <Printer className="h-4 w-4 text-[#c89b3c]" />
              Open printable payout statement
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        )}

        <div className="space-y-2 rounded-2xl border border-[#ede7dc] bg-white p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Allocated bookings ({activity.bookingReferences.length})
          </h3>
          <div className="divide-y divide-slate-100">
            {activity.bookingReferences.map((b) => (
              <div
                key={b.bookingId}
                className="flex items-center justify-between py-2.5 text-sm"
              >
                <span className="font-semibold text-[#061224]">
                  {b.reference}
                </span>
                <Link
                  href={`/partner/reservations?${new URLSearchParams({
                    propertyId,
                    bookingId: b.bookingId,
                  })}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#755a1a] underline underline-offset-4 hover:text-[#061224]"
                >
                  View booking
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  );
}

export function ReportDetailDrawer({
  report,
  propertyId,
  timezone,
  onClose,
  onWithdrawn,
  onCopyToDraft,
}: {
  report: OwnerDuesReportDto | null;
  propertyId: string;
  timezone: string;
  onClose: () => void;
  onWithdrawn: () => void;
  onCopyToDraft: (seed: ReportDraftSeed) => void;
}) {
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [error, setError] = useState("");

  if (!report) return null;
  const badge = reportStatusPresentation(report.status);

  async function handleOpenAttachment() {
    if (!report) return;
    setAttachmentLoading(true);
    setError("");
    try {
      const res = await apiFetch<{ url: string }>(
        `/api/partner/properties/${encodeURIComponent(propertyId)}/finances/reports/${encodeURIComponent(report.id)}/attachment`,
        { cache: "no-store" },
      );
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to open payment proof.",
      );
    } finally {
      setAttachmentLoading(false);
    }
  }

  async function handleWithdraw() {
    if (!report) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(
        `/api/partner/properties/${encodeURIComponent(propertyId)}/finances/reports`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "withdraw",
            reportId: report.id,
            requestId: crypto.randomUUID(),
          }),
        },
      );
      setConfirmWithdraw(false);
      onWithdrawn();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to withdraw this report.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={!!report}
      onClose={onClose}
      title={`Reported payment ${report.reference}`}
      description={`Submitted ${formatHotelDateTime(report.submittedAt, timezone)}`}
      badge={
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.tone}`}
        >
          {badge.label}
        </span>
      }
    >
      <div className="space-y-5 p-4 sm:p-6">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-2.5 rounded-2xl border border-[#ede7dc] bg-white p-4 text-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <span className="text-slate-500">Reported amount</span>
            <strong className="text-xl text-[#061224]">
              {formatCurrency(report.amountPaise)}
            </strong>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Payment date</span>
            <span className="font-semibold text-[#061224]">
              {formatHotelDate(report.paymentDate, timezone)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Method</span>
            <span className="font-semibold text-[#061224]">
              {formatMethod(report.method)}
            </span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-slate-500">Transaction reference</span>
            <span className="break-all text-right font-semibold text-[#061224]">
              {report.transactionReference}
            </span>
          </div>
          {report.notes && (
            <div className="border-t border-slate-100 pt-2.5">
              <span className="block text-xs font-semibold text-slate-500">
                Note
              </span>
              <p className="mt-1 break-words text-slate-700">{report.notes}</p>
            </div>
          )}
        </div>

        {report.attachment && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#ede7dc] bg-white p-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <Paperclip className="h-4 w-4 shrink-0 text-[#9a6b18]" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#061224]">
                  {report.attachment.fileName}
                </p>
                <p className="text-xs text-slate-500">
                  {(report.attachment.sizeBytes / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            {report.attachment.canAccess ? (
              <button
                type="button"
                disabled={attachmentLoading}
                onClick={() => void handleOpenAttachment()}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#061224] hover:bg-slate-50"
              >
                {attachmentLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-[#9a6b18]" />
                )}
                View proof
              </button>
            ) : (
              <span className="text-xs text-slate-500">
                Restricted to submitting owner
              </span>
            )}
          </div>
        )}

        {report.status === "awaiting_verification" && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs leading-5 text-amber-950">
            <p className="font-bold">Awaiting verification</p>
            <p className="mt-1">
              This report does not reduce your outstanding dues until Helpkey
              verifies and records the payment.
            </p>
          </div>
        )}

        {report.status === "rejected" && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs leading-5 text-rose-900">
            <p className="font-bold">Rejected by Helpkey</p>
            <p className="mt-1">
              {report.rejectionReason || "No rejection reason provided."}
            </p>
          </div>
        )}

        {report.status === "withdrawn" && (
          <div className="rounded-2xl border border-slate-200 bg-slate-100 p-4 text-xs leading-5 text-slate-700">
            <p className="font-bold">Withdrawn</p>
            <p className="mt-1">
              Withdrawn on{" "}
              {formatHotelDateTime(report.withdrawnAt, timezone)}. You can copy
              these details into a new report if needed.
            </p>
          </div>
        )}

        {report.linkedReceipt && (
          <div className="space-y-2.5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs leading-5 text-emerald-950">
            <p className="font-bold">
              Recorded receipt {report.linkedReceipt.reference}
            </p>
            <p>
              {report.linkedReceipt.mode === "linked_existing"
                ? "Matched to an existing verified dues receipt"
                : "Verified and recorded by Helpkey"}{" "}
              on{" "}
              {formatHotelDateTime(report.linkedReceipt.recordedAt, timezone)}.
            </p>
            {report.linkedReceipt.corrected && (
              <div className="rounded-xl border border-amber-200 bg-white p-3 text-amber-950">
                <p className="font-bold">Receipt later corrected</p>
                <p className="mt-1">
                  Reason: {report.linkedReceipt.correctionReason}
                </p>
                {report.linkedReceipt.replacement && (
                  <p className="mt-1 font-semibold">
                    Replaced by {report.linkedReceipt.replacement.reference} (
                    {formatCurrency(
                      report.linkedReceipt.replacement.amountPaise,
                    )}
                    )
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {report.canWithdraw && !confirmWithdraw && (
            <button
              type="button"
              onClick={() => setConfirmWithdraw(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
            >
              <Undo2 className="h-4 w-4" />
              Withdraw report
            </button>
          )}
          {report.canWithdraw && confirmWithdraw && (
            <div className="w-full space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-xs font-semibold text-rose-900">
                Withdraw this report? Submitted details remain in history and
                cannot be edited later.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleWithdraw()}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-rose-700 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-60"
                >
                  {busy ? "Withdrawing…" : "Confirm withdrawal"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmWithdraw(false)}
                  className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Keep pending
                </button>
              </div>
            </div>
          )}
          {report.canCopyToDraft && (
            <button
              type="button"
              onClick={() =>
                onCopyToDraft({
                  amountRupees: (report.amountPaise / 100).toFixed(2).replace(/\.00$/, ""),
                  paymentDate: report.paymentDate,
                  method: report.method,
                  transactionReference: report.transactionReference,
                  notes: report.notes,
                })
              }
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#061224] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b1f3a]"
            >
              <Copy className="h-4 w-4 text-[#c89b3c]" />
              Copy to new report
            </button>
          )}
        </div>
      </div>
    </Drawer>
  );
}
