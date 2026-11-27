"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Info,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { Drawer } from "@/components/partner/dashboard/drawer";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { putFileWithProgress, sha256Hex } from "@/lib/partner/upload-client";
import { formatCurrency, formatMethod } from "./format";

export type ReportDraftSeed = {
  amountRupees: string;
  paymentDate: string;
  method: "bank_transfer" | "upi" | "cheque" | "cash" | "other";
  transactionReference: string;
  notes: string;
};

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
]);
const MAX_BYTES = 10 * 1024 * 1024;

function parseRupeesToPaise(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  const paise = Number(BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0")));
  if (!Number.isSafeInteger(paise) || paise <= 0 || paise > 1_000_000_000) {
    return null;
  }
  return paise;
}

export function ReportPaymentDrawer(props: {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  hotelName: string;
  timezone: string;
  totalDuesPaise: number;
  maxSingleReportPaise: number;
  maxSingleReportBookingsCount: number;
  seed: ReportDraftSeed | null;
  onSubmitted: (reportId: string, reference: string) => void;
}) {
  const { open, onClose, propertyId, hotelName, seed } = props;
  const formKey = `${propertyId}:${seed ? `${seed.amountRupees}:${seed.paymentDate}:${seed.method}:${seed.transactionReference}` : "fresh"}`;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Report dues payment"
      description={`${hotelName} · Verified by Helpkey before reducing dues`}
    >
      {open ? <ReportPaymentForm key={formKey} {...props} /> : null}
    </Drawer>
  );
}

function ReportPaymentForm({
  onClose,
  propertyId,
  timezone,
  totalDuesPaise,
  maxSingleReportPaise,
  maxSingleReportBookingsCount,
  seed,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  hotelName: string;
  timezone: string;
  totalDuesPaise: number;
  maxSingleReportPaise: number;
  maxSingleReportBookingsCount: number;
  seed: ReportDraftSeed | null;
  onSubmitted: (reportId: string, reference: string) => void;
}) {
  const [amountRupees, setAmountRupees] = useState(seed?.amountRupees ?? "");
  const [paymentDate, setPaymentDate] = useState(seed?.paymentDate ?? "");
  const [method, setMethod] = useState<ReportDraftSeed["method"]>(
    seed?.method ?? "bank_transfer",
  );
  const [transactionReference, setTransactionReference] = useState(
    seed?.transactionReference ?? "",
  );
  const [notes, setNotes] = useState(seed?.notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef<string>(crypto.randomUUID());

  const invalidateRequestIdentity = () => {
    requestIdRef.current = crypto.randomUUID();
  };

  async function handleFileSelect(selected: File | null) {
    setError("");
    setUploadId(null);
    setUploadProgress(0);
    invalidateRequestIdentity();
    if (!selected) {
      setFile(null);
      return;
    }
    if (!ALLOWED_TYPES.has(selected.type)) {
      setError("Upload a JPG, PNG, or PDF payment proof.");
      setFile(null);
      return;
    }
    if (selected.size <= 0 || selected.size > MAX_BYTES) {
      setError("Attachment must be 10 MB or smaller.");
      setFile(null);
      return;
    }
    setFile(selected);
    setUploading(true);
    try {
      const checksum = await sha256Hex(selected);
      const signed = await apiFetch<{
        uploadId: string;
        uploadUrl: string;
        headers: Record<string, string>;
      }>(
        `/api/partner/properties/${encodeURIComponent(propertyId)}/finances/reports/upload-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: selected.name,
            mimeType: selected.type,
            sizeBytes: selected.size,
            checksum,
          }),
        },
      );
      await putFileWithProgress(
        signed.uploadUrl,
        signed.headers,
        selected,
        (pct) => setUploadProgress(pct),
      );
      setUploadId(signed.uploadId);
      setUploadProgress(100);
    } catch (cause) {
      setFile(null);
      setUploadId(null);
      setUploadProgress(0);
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to upload attachment. You can try again or submit without an attachment.",
      );
    } finally {
      setUploading(false);
    }
  }

  function validateAndProceed() {
    setError("");
    const paise = parseRupeesToPaise(amountRupees);
    if (!paise) {
      setError(
        "Enter a valid positive amount in rupees with up to 2 decimal places.",
      );
      return;
    }
    if (maxSingleReportPaise <= 0) {
      setError("There are no verified collectible dues to report right now.");
      return;
    }
    if (paise > maxSingleReportPaise) {
      setError(
        `Maximum supported in one report is ${formatCurrency(maxSingleReportPaise)} (oldest ${maxSingleReportBookingsCount} collectible bookings). Submit separate reports for larger amounts.`,
      );
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      setError("Enter a valid payment date.");
      return;
    }
    if (!transactionReference.trim()) {
      setError("Enter the transaction reference from your transfer.");
      return;
    }
    if (uploading) {
      setError("Wait for the payment proof upload to finish.");
      return;
    }
    setReviewing(true);
  }

  async function handleSubmit() {
    const paise = parseRupeesToPaise(amountRupees);
    if (!paise) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await apiFetch<{
        reportId: string;
        reference: string;
        status: string;
      }>(
        `/api/partner/properties/${encodeURIComponent(propertyId)}/finances/reports`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: requestIdRef.current,
            amountPaise: paise,
            paymentDate,
            method,
            transactionReference: transactionReference.trim(),
            notes: notes.trim(),
            uploadId,
          }),
        },
      );
      onSubmitted(result.reportId, result.reference);
    } catch (cause) {
      // Keep the draft and requestId intact on recoverable (5xx / network / 408) errors!
      if (
        cause instanceof ApiClientError &&
        cause.status < 500 &&
        cause.status !== 408
      ) {
        invalidateRequestIdentity();
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to submit report. Your draft is preserved — please retry.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const parsedPaise = parseRupeesToPaise(amountRupees);

  return (
      <div className="space-y-5 p-4 sm:p-6">
        <div className="rounded-2xl border border-[#ede7dc] bg-white p-4 text-xs leading-5 text-slate-600">
          <div className="flex items-start gap-2.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#9a6b18]" />
            <div className="space-y-1">
              <p className="font-semibold text-[#061224]">
                Helpkey verifies and allocates your payment
              </p>
              <p>
                You do not need to select individual bookings. Helpkey reviews
                your transfer and allocates confirmed payments oldest-first.
                Submitting a report does not reduce dues until verified.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-[#fbf5e8] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#755a1a]">
              Maximum for one report
            </span>
            <span className="text-base font-bold text-[#061224]">
              {formatCurrency(maxSingleReportPaise)}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#755a1a]">
            Covers up to the oldest {maxSingleReportBookingsCount} collectible
            booking{maxSingleReportBookingsCount === 1 ? "" : "s"}.
            {totalDuesPaise > maxSingleReportPaise
              ? ` Your total dues are ${formatCurrency(totalDuesPaise)}; submit separate reports for the remainder.`
              : ""}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!reviewing ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-[#061224]">
                Amount paid (₹)
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amountRupees}
                  onChange={(e) => {
                    setAmountRupees(e.target.value);
                    invalidateRequestIdentity();
                  }}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-[#061224] outline-none focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/20"
                />
              </label>

              <label className="block text-sm font-semibold text-[#061224]">
                Payment date
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => {
                    setPaymentDate(e.target.value);
                    invalidateRequestIdentity();
                  }}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-[#061224] outline-none focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/20"
                />
                <span className="mt-1 block text-[11px] font-normal text-slate-500">
                  In hotel timezone ({timezone})
                </span>
              </label>

              <label className="block text-sm font-semibold text-[#061224]">
                Payment method
                <select
                  value={method}
                  onChange={(e) => {
                    setMethod(e.target.value as ReportDraftSeed["method"]);
                    invalidateRequestIdentity();
                  }}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-[#061224] outline-none focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/20"
                >
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="upi">UPI</option>
                  <option value="cheque">Cheque</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label className="block text-sm font-semibold text-[#061224]">
                Transaction reference
                <input
                  type="text"
                  maxLength={200}
                  placeholder="UTR, IMPS, or receipt ref"
                  value={transactionReference}
                  onChange={(e) => {
                    setTransactionReference(e.target.value);
                    invalidateRequestIdentity();
                  }}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-[#061224] outline-none focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/20"
                />
              </label>
            </div>

            <label className="block text-sm font-semibold text-[#061224]">
              Optional note
              <textarea
                rows={3}
                maxLength={1000}
                placeholder="Any transfer note for the Helpkey verification team"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  invalidateRequestIdentity();
                }}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-[#061224] outline-none focus:border-[#c89b3c] focus:ring-2 focus:ring-[#c89b3c]/20"
              />
            </label>

            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-[#061224]">
                  <Paperclip className="h-4 w-4 text-slate-500" />
                  Payment proof attachment (optional)
                </span>
                <span className="text-xs text-slate-500">
                  JPG, PNG, or PDF · max 10 MB
                </span>
              </div>

              {file ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-[#061224]" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#061224]">
                        {file.name}
                      </p>
                      <p className="text-slate-500">
                        {(file.size / 1024).toFixed(1)} KB ·{" "}
                        {uploading
                          ? `Uploading ${uploadProgress}%`
                          : uploadId
                            ? "Ready to attach"
                            : "Pending"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => void handleFileSelect(null)}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              ) : (
                <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-3 text-xs font-semibold text-slate-700 transition hover:border-[#c89b3c] hover:bg-[#fbf5e8]/40">
                  <Upload className="h-4 w-4 text-[#9a6b18]" />
                  Choose JPG, PNG, or PDF file
                  <input
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    className="sr-only"
                    onChange={(e) =>
                      void handleFileSelect(e.target.files?.[0] ?? null)
                    }
                  />
                </label>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={uploading || maxSingleReportPaise <= 0}
                onClick={validateAndProceed}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#061224] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0b1f3a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Review details
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3 rounded-2xl border border-[#ede7dc] bg-white p-4 text-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <span className="text-slate-500">Amount</span>
                <strong className="text-lg text-[#061224]">
                  {formatCurrency(parsedPaise)}
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Payment date</span>
                <span className="font-semibold text-[#061224]">
                  {paymentDate}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Method</span>
                <span className="font-semibold text-[#061224]">
                  {formatMethod(method)}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-slate-500">Transaction reference</span>
                <span className="break-all text-right font-semibold text-[#061224]">
                  {transactionReference.trim()}
                </span>
              </div>
              {notes.trim() && (
                <div className="border-t border-slate-100 pt-2.5">
                  <span className="block text-xs font-semibold text-slate-500">
                    Note
                  </span>
                  <p className="mt-1 break-words text-slate-700">{notes.trim()}</p>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                <span className="text-slate-500">Attachment</span>
                <span className="font-semibold text-[#061224]">
                  {file ? file.name : "None"}
                </span>
              </div>
            </div>

            <p className="rounded-xl bg-slate-100 p-3 text-xs leading-5 text-slate-600">
              Submitted reports are immutable and marked{" "}
              <strong>Awaiting verification</strong>. You can withdraw a pending
              report before Helpkey reviews it.
            </p>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setReviewing(false)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Edit details
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleSubmit()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#061224] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0b1f3a] disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-[#c89b3c]" />
                    Submit payment report
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
  );
}
