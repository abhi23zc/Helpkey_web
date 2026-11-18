"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowRight,
  BedDouble,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  Info,
  MessageSquare,
  Receipt,
  Send,
  User,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { formatPaise as formatCurrency } from "@/lib/currency";
const formatPaise = (value: number) => formatCurrency(value, { withFractions: true });
import { Drawer } from "./drawer";
import type { ActionEligibility } from "@/lib/partner/reservations/eligibility";
import type { ReservationChoices } from "./partner-reservations-page";
const button =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#e4ded2] bg-white px-3.5 py-2 text-xs font-bold text-[#4d5870] shadow-2xs hover:border-[#c89b3c] hover:bg-[#fbf5e8] hover:text-[#061224] active:scale-98 transition disabled:opacity-50";
const input =
  "mt-1 block min-h-10 w-full rounded-xl border border-[#e4ded2] bg-[#fdfdfc] px-3.5 py-2 text-xs font-semibold text-[#061224] shadow-2xs outline-none transition placeholder:font-normal placeholder:text-[#a0aec0] focus:border-[#c89b3c] focus:bg-white focus:ring-2 focus:ring-[#c89b3c]/15";
type Row = {
  stayChange?: { id: string; before: { room: string; category: string; departure: string }; after: { room: string; category: string; departure: string }; reason: string; effectiveAt: string; adjustmentPaise?: number | null };
  id: string;
  type?: string;
  amountPaise?: number;
  method?: string;
  reference?: string;
  reason?: string;
  response?: string;
  scope?: string;
  requestTitle?: string;
  revised?: {
    roomName?: string;
    startAt?: string;
    endAt?: string;
    totalPaise?: number;
  };
  receiptId?: string;
  paymentId?: string;
  createdAt?: string;
  status?: string;
  text?: string;
  actorId?: string;
  actorName?: string;
  from?: string;
  to?: string;
  label?: string;
  unitId?: string;
  roomTypeId?: string;
  housekeepingStatus?: string;
  name?: string;
  stayQuote?: boolean;
};
type Operations = {
  events: Row[];
  nextEventCursor: string | null;
  paymentRecordsVisible?: boolean;
  payments: Row[];
  onlinePayments: Row[];
  refunds: Row[];
  units: Row[];
  features: {
    allocation: boolean;
    payments: boolean;
    refunds?: boolean;
    amendments: boolean;
  };
  revision: number;
  assignedUnitId: string | null;
  assignedUnitLabel: string | null;
  refundExcessPaise: number;
};
function remainingRecordedReceipt(receipt: Row, data: Operations) {
  return Math.max(
    0,
    (receipt.amountPaise ?? 0) -
      data.payments
        .filter((r) => r.receiptId === receipt.id)
        .reduce((sum, r) => sum + (r.amountPaise ?? 0), 0) -
      data.refunds
        .filter((r) => r.paymentId === receipt.id && r.status !== "failed")
        .reduce((sum, r) => sum + (r.amountPaise ?? 0), 0),
  );
}
function formatStatusLabel(s?: string) {
  if (!s) return "";
  return s
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
type Booking = {
  id: string;
  roomTypeId?: string | null;
  roomName: string;
  bookingStatus: string;
  bookingMode?: string;
  paymentMethod?: string | null;
  checkIn: string;
  checkOut: string;
  startAt?: string | null;
  endAt?: string | null;
  durationMinutes?: number | null;
  balanceDuePaise?: number;
  currency: string;
  timezone?: string;
};
export type ReservationOperationSections = {
  billingRead?: boolean;
  assignment: ReactNode;
  notes: ReactNode;
  paymentForm: ReactNode;
  paymentRecords: ReactNode;
  feedback: ReactNode;
};
export type ReportReservationDraft = (
  section: string,
  dirty: boolean,
  busy?: boolean,
) => void;
function HousekeepingStatusBadge({ status }: { status?: string | null }) {
  const s = status?.toLowerCase() || "unknown";
  if (s === "clean" || s === "inspected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
        {s === "inspected" ? "Inspected & Ready" : "Clean"}
      </span>
    );
  }
  if (s === "dirty") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Dirty (Needs turnover)
      </span>
    );
  }
  if (s === "cleaning_in_progress") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-800">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
        Cleaning in progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      Not inspected
    </span>
  );
}

const emptySections: ReservationOperationSections = {
  assignment: null,
  notes: null,
  paymentForm: null,
  paymentRecords: null,
  feedback: null,
};

export function ReservationOperations({
  booking,
  propertyId,
  onChanged,
  onDraftChange,
  collectionEligibility,
  render,
}: {
  booking: Booking;
  propertyId: string;
  onChanged: () => void;
  onDraftChange: ReportReservationDraft;
  collectionEligibility?: ActionEligibility;
  render: (sections: ReservationOperationSections) => ReactNode;
}) {
  const assignmentRevision = useRef<number | null>(null);
  const [historyBefore, setHistoryBefore] = useState<string>();
  const query = useQuery({
    queryKey: ["partner", propertyId, booking.id, "operations", historyBefore],
    queryFn: ({ signal }) =>
      apiFetch<Operations>(
        `/api/partner/bookings/${booking.id}/operations${historyBefore ? `?before=${encodeURIComponent(historyBefore)}` : ""}`,
        {
          signal,
        },
      ),
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [unitId, setUnitId] = useState<string | null>(null),
    [paymentAction, setPaymentAction] = useState("collect"),
    [amount, setAmount] = useState(""),
    [method, setMethod] = useState("cash"),
    [reference, setReference] = useState(""),
    [reason, setReason] = useState(""),
    [receiptId, setReceiptId] = useState("");
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const request = useRef({ body: "", key: "" });
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const client = useQueryClient();
  const data = query.data;
  const collectionBlocked = collectionEligibility?.allowed === false;
  const collectionReason = collectionEligibility?.reason || "Collection is unavailable. Refresh this reservation before retrying.";
  const hotelRefundReceipts =
    data?.payments?.filter(
      (r) => r.type === "collection" && remainingRecordedReceipt(r, data) > 0,
    ) ?? [];
  const allowRefund =
    data?.features.refunds === true && hotelRefundReceipts.length > 0;
  const dirty = Boolean(
    note ||
    amount ||
    reference ||
    reason ||
    receiptId ||
    (unitId !== null && unitId !== (data?.assignedUnitId ?? "")),
  );
  useEffect(() => {
    onDraftChange("operations", dirty, busy);
  }, [onDraftChange, dirty, busy]);
  useEffect(() => () => onDraftChange("operations", false), [onDraftChange]);
  const send = async (body: Record<string, unknown>) => {
    if (body.action === "collect" && collectionBlocked) { setError(collectionReason); return; }
    if (
      body.action === "refund" &&
      (!allowRefund || !hotelRefundReceipts.some((r) => r.id === body.receiptId))
    ) {
      setError(
        "This hotel receipt is no longer available for a refund. Refresh the payment records and review again.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    const text = JSON.stringify(body);
    if (request.current.body !== text)
      request.current = { body: text, key: crypto.randomUUID() };
    try {
      await apiFetch(`/api/partner/bookings/${booking.id}/operations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": request.current.key,
        },
        body: text,
      });
      request.current = { body: "", key: "" };
      setHistoryBefore(undefined);
      setPending(null);
      setSuccess(
        body.action === "note"
          ? "Staff note saved."
          : body.action === "assign"
            ? "Room assignment saved."
            : "Payment record saved.",
      );
      if (body.action === "note") setNote("");
      if (body.action === "assign") {
        assignmentRevision.current = null;
        setUnitId(null);
        setAssignmentOpen(false);
      }
      if (["collect", "refund", "reverse"].includes(String(body.action))) {
        setAmount("");
        setReference("");
        setReason("");
        setReceiptId("");
        setPaymentOpen(false);
      }
      await client.invalidateQueries({ queryKey: ["partner", propertyId] });
      await query.refetch();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  };
  const time = (s?: string) =>
    s
      ? new Intl.DateTimeFormat("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: booking.timezone || "Asia/Kolkata",
        }).format(new Date(s))
      : "Date unavailable";
  if (query.isPending)
    return render({
      ...emptySections,
      feedback: (
        <p role="status" className="text-sm text-slate-600">
          Loading reservation controls…
        </p>
      ),
    });
  if (!data || !Array.isArray(data.payments))
    return render({
      ...emptySections,
      feedback: (
        <p role="alert" className="text-sm text-red-800">
          Unable to load reservation controls.{" "}
          <button
            className="min-h-11 underline"
            onClick={() => void query.refetch()}
          >
            Retry controls
          </button>
        </p>
      ),
    });
  const receipts = [
    ...(data.payments ?? []).filter((r) => r.type === "collection"),
    ...(data.onlinePayments ?? []).map((r) => ({ ...r, method: "online" })),
  ];
  const remainingReceipt = (r: Row) => remainingRecordedReceipt(r, data);
  return render({
    billingRead: data.paymentRecordsVisible,
    assignment: (
      <>
        {" "}
        {data.features?.allocation && (
          <section
            aria-label="Room assignment"
            className="rounded-2xl border border-slate-200/90 bg-[#fbfbf9] p-4 space-y-3 shadow-2xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-xs font-bold text-[#061224]">
                  Room assignment
                </h4>
                {data.assignedUnitLabel ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/90 px-2.5 py-1 text-xs font-bold text-emerald-900 shadow-2xs">
                    <BedDouble className="h-3.5 w-3.5 text-emerald-700" />
                    <span>Room {data.assignedUnitLabel}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                    <span>Unassigned</span>
                  </span>
                )}
                {data.assignedUnitId && (
                  <HousekeepingStatusBadge
                    status={
                      data.units.find((u) => u.id === data.assignedUnitId)
                        ?.housekeepingStatus
                    }
                  />
                )}
              </div>
              {["confirmed", "checked_in"].includes(booking.bookingStatus) && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-[#c89b3c] hover:bg-[#fbf5e8] transition"
                  aria-expanded={assignmentOpen}
                  onClick={() => setAssignmentOpen(!assignmentOpen)}
                >
                  {assignmentOpen
                    ? "Hide room editor"
                    : data.assignedUnitId
                      ? "Change room"
                      : "Assign room"}
                </button>
              )}
            </div>
            {assignmentOpen &&
              ["confirmed", "checked_in"].includes(booking.bookingStatus) && (
                <div className="pt-3 border-t border-slate-200/80 space-y-2">
                  <div className="flex flex-wrap sm:flex-nowrap items-end gap-2">
                    <label className="flex-1 min-w-[200px] text-xs font-semibold text-[#4d5870]">
                      Physical room
                      <select
                        aria-label="Physical room"
                        className={input}
                        value={unitId ?? data.assignedUnitId ?? ""}
                        onChange={(e) => {
                          assignmentRevision.current ??= data.revision;
                          setUnitId(e.target.value);
                        }}
                      >
                        <option value="">Unassigned</option>
                        {(data.units ?? [])
                          .filter(
                            (u) =>
                              u.status === "active" &&
                              u.roomTypeId === booking.roomTypeId,
                          )
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              Room {u.label}{" "}
                              {u.housekeepingStatus
                                ? `· ${u.housekeepingStatus.replaceAll("_", " ")}`
                                : ""}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button
                      disabled={busy}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#061224] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#0c1f3b] disabled:opacity-50 transition-all shrink-0"
                      onClick={() =>
                        void send({
                          action: "assign",
                          unitId: (unitId ?? data.assignedUnitId) || null,
                          revision: assignmentRevision.current ?? data.revision,
                        })
                      }
                    >
                      {busy ? "Saving…" : "Save room"}
                    </button>
                  </div>
                  {booking.bookingStatus === "checked_in" && (
                    <p className="text-[11px] text-slate-500 font-medium">
                      💡 Tip: For checked-in guests needing rate adjustments or audited transfers, use <strong>In-house stay changes</strong> below.
                    </p>
                  )}
                </div>
              )}
          </section>
        )}
      </>
    ),
    notes: (
      <>
        <details
          open
          className="group rounded-2xl border border-[#ede7dc] bg-white p-4 sm:p-5 shadow-xs space-y-4"
        >
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-xs font-bold text-[#061224]">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#fbf5e8] text-[#c89b3c]">
                <MessageSquare className="h-4 w-4" />
              </span>
              <div>
                <span className="font-bold">Add staff note / activity</span>{" "}
                <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-[#68758c] lowercase">
                  Private
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#8b96aa]">
              <span className="group-open:hidden">Expand</span>
              <span className="hidden group-open:inline">Collapse</span>
              <ChevronDown
                size={14}
                className="transition-transform duration-200 group-open:rotate-180"
              />
            </div>
          </summary>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send({ action: "note", text: note });
            }}
            className="pt-2 space-y-3"
          >
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#68758c] space-y-1.5">
              <span>New note</span>
              <textarea
                aria-label="New note"
                className="w-full rounded-xl border border-[#ede7dc] bg-white px-3.5 py-2.5 text-xs font-medium text-[#061224] shadow-xs placeholder-[#8b96aa] focus:border-[#c89b3c] focus:outline-none focus:ring-1 focus:ring-[#c89b3c] min-h-[72px]"
                value={note}
                maxLength={2000}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add an internal note for hotel staff…"
                required
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0b1f3a] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#132c50] transition-colors disabled:opacity-50"
                disabled={busy || !note.trim()}
              >
                <Send className="h-3.5 w-3.5 text-[#c89b3c]" />
                <span>Save note</span>
              </button>
              <p className="text-[11px] text-[#8b96aa]">
                Notes are visible only to authorized hotel staff.
              </p>
            </div>
          </form>

          <div className="border-t border-[#f3efe8] pt-4">
            <div className="flex items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#fbf5e8] text-[#c89b3c]">
                  <Clock className="h-3.5 w-3.5" />
                </span>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#061224]">
                  Activity history
                </h4>
              </div>
              <span className="text-[11px] font-semibold text-[#8b96aa]">
                {data.events.length} recorded{" "}
                {data.events.length === 1 ? "event" : "events"}
              </span>
            </div>

            <div className="space-y-2.5">
              {data.events.map((e) => {
                const isStayChange = Boolean(e.stayChange);
                const isNote = Boolean(e.text);
                const isPayment = Boolean(
                  e.type?.includes("collection") ||
                    e.type?.includes("payment") ||
                    e.amountPaise != null
                );
                const isRoom = Boolean(e.label || e.type?.includes("room"));

                return (
                  <div
                    key={e.id}
                    className="rounded-xl border border-[#ede7dc] bg-white p-3.5 text-xs shadow-2xs hover:border-[#dfd7c8] transition-colors space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                            isNote
                              ? "border-blue-200 bg-blue-50 text-blue-800"
                              : isStayChange
                                ? "border-amber-200 bg-amber-50 text-amber-800"
                                : isPayment
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                  : isRoom
                                    ? "border-purple-200 bg-purple-50 text-purple-800"
                                    : "border-slate-200 bg-slate-100 text-[#4d5870]"
                          }`}
                        >
                          {isNote
                            ? "Staff Note"
                            : isStayChange
                              ? "Stay Change"
                              : isPayment
                                ? "Payment"
                                : isRoom
                                  ? "Room Update"
                                  : "Status"}
                        </span>
                        <span className="font-bold text-[#061224] capitalize">
                          {e.type
                            ? e.type.replaceAll("_", " ")
                            : `${formatStatusLabel(e.from || "Created")} → ${formatStatusLabel(e.to || "confirmed")}`}
                          {e.label && !isStayChange
                            ? ` · Room ${e.label}`
                            : ""}
                        </span>
                      </div>
                      {e.amountPaise != null && (
                        <strong className="text-sm font-bold text-[#061224]">
                          {formatPaise(e.amountPaise)}
                        </strong>
                      )}
                    </div>

                    {e.stayChange && (
                      <div className="rounded-xl border border-[#f0ece4] bg-[#fdfdfc] p-3 space-y-2 text-xs">
                        <div className="flex items-center gap-2 font-semibold text-[#061224]">
                          <BedDouble className="h-3.5 w-3.5 text-[#c89b3c]" />
                          <span>
                            Room {e.stayChange.before.room} (
                            {e.stayChange.before.category}) → Room{" "}
                            {e.stayChange.after.room} (
                            {e.stayChange.after.category})
                          </span>
                        </div>

                        {e.stayChange.before.departure !==
                          e.stayChange.after.departure && (
                          <div className="flex items-center gap-2 text-[#68758c]">
                            <Clock className="h-3.5 w-3.5 text-[#8b96aa]" />
                            <span>
                              Departure: {time(e.stayChange.before.departure)}{" "}
                              → {time(e.stayChange.after.departure)}
                            </span>
                          </div>
                        )}

                        {e.stayChange.reason && (
                          <div className="rounded-lg bg-[#f8f6f0] px-2.5 py-1.5 text-[#061224]">
                            <span className="font-semibold text-[#68758c]">
                              Reason:{" "}
                            </span>
                            {e.stayChange.reason}
                            <span className="text-[#8b96aa] ml-2">
                              · Effective {time(e.stayChange.effectiveAt)}
                            </span>
                          </div>
                        )}

                        {e.stayChange.adjustmentPaise != null && (
                          <div className="flex items-center justify-between text-xs pt-1 border-t border-[#f3efe8]">
                            <span className="font-medium text-[#68758c]">
                              Adjustment:{" "}
                              <strong className="text-[#061224]">
                                {formatPaise(e.stayChange.adjustmentPaise)}
                              </strong>
                            </span>
                            <a
                              className="font-semibold text-[#c89b3c] underline hover:text-[#a07b2c]"
                              href="#workspace-billing"
                            >
                              Linked folio and documents
                            </a>
                          </div>
                        )}
                      </div>
                    )}

                    {e.text && (
                      <div className="rounded-xl border border-[#ede7dc] bg-[#fbfaf8] p-3 text-xs text-[#061224]">
                        <p className="whitespace-pre-wrap">{e.text}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-[#8b96aa] pt-0.5">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        <span>{time(e.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>{e.actorName || e.actorId || "System"}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {(historyBefore || data.nextEventCursor) && (
              <div className="flex items-center gap-2 pt-3">
                {historyBefore && (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-xl border border-[#ede7dc] bg-white px-3.5 py-2 text-xs font-bold text-[#061224] shadow-xs hover:bg-[#fbf5e8] transition-colors"
                    onClick={() => setHistoryBefore(undefined)}
                  >
                    Latest activity
                  </button>
                )}
                {data.nextEventCursor && (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-xl border border-[#ede7dc] bg-white px-3.5 py-2 text-xs font-bold text-[#061224] shadow-xs hover:bg-[#fbf5e8] transition-colors"
                    onClick={() => setHistoryBefore(data.nextEventCursor!)}
                  >
                    Earlier activity
                  </button>
                )}
              </div>
            )}
          </div>
        </details>
      </>
    ),
    paymentForm: (
      <>
        {data.features.payments && (
          <section aria-label="Collections and refunds" className="space-y-3.5">
            {/* Action Segmented Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-[#f8f6f0] border border-[#ede7dc]">
              {[
                ["collect", "Record collection"],
                ["refund", "Refund payment"],
                ["reverse", "Reverse collection"],
              ]
                .filter(([action]) => action !== "refund" || allowRefund)
                .map(([action, label]) => {
                  const isActive = paymentOpen && paymentAction === action;
                  return (
                    <button
                      type="button"
                      key={action}
                      className={`inline-flex items-center justify-center rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                        isActive
                          ? "bg-[#0b1f3a] text-white shadow-xs"
                          : "text-[#68758c] hover:text-[#061224] hover:bg-white/80"
                      } disabled:opacity-50`}
                      disabled={
                        busy || (action === "collect" && collectionBlocked)
                      }
                      title={
                        action === "collect" && collectionBlocked
                          ? collectionReason
                          : undefined
                      }
                      aria-pressed={isActive}
                      onClick={() => {
                        setPaymentAction(action);
                        setReceiptId("");
                        setPending(null);
                        setPaymentOpen(true);
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
            </div>

            {collectionBlocked && (
              <p
                role="status"
                className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs font-medium text-amber-800"
              >
                {collectionReason}
              </p>
            )}

            {/* Concise Helper Banner */}
            <div className="flex items-start gap-2.5 rounded-xl border border-[#ede7dc] bg-[#fbfaf8] p-3 text-xs text-[#68758c]">
              <Info className="h-4 w-4 text-[#c89b3c] shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Record payments received directly from the guest. Use{" "}
                <strong className="text-[#061224]">Refund</strong> to return
                money, or{" "}
                <strong className="text-[#061224]">Reverse</strong> to correct an
                incorrect receipt.
              </p>
            </div>

            {allowRefund && data.refundExcessPaise > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900">
                <Info className="h-4 w-4 text-amber-700 shrink-0" />
                <p>
                  <strong>
                    {formatPaise(
                      Math.min(
                        data.refundExcessPaise,
                        hotelRefundReceipts.reduce(
                          (sum, r) => sum + remainingRecordedReceipt(r, data),
                          0
                        )
                      )
                    )}
                  </strong>{" "}
                  available to return against hotel collection receipts. Online
                  payments are handled separately.
                </p>
              </div>
            )}

            <div
              hidden={
                !paymentOpen || (paymentAction === "refund" && !allowRefund)
              }
              className="rounded-xl border border-[#ede7dc] bg-[#fdfdfc] p-4 space-y-3.5 shadow-2xs"
            >
              <form
                className="space-y-3.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const body =
                    paymentAction === "collect"
                      ? {
                          action: "collect",
                          amountPaise: Math.round(Number(amount) * 100),
                          method,
                          reference,
                          reason,
                        }
                      : paymentAction === "reverse"
                        ? { action: "reverse", receiptId, reason }
                        : {
                            action: "refund",
                            receiptId,
                            amountPaise: Math.round(Number(amount) * 100),
                            reference,
                            reason,
                          };
                  setPending(body);
                  setError("");
                }}
              >
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#68758c] space-y-1.5">
                  Action
                  <div className="relative">
                    <select
                      aria-label="Payment action"
                      className="w-full appearance-none rounded-xl border border-[#ede7dc] bg-white px-3.5 py-2.5 pr-8 text-xs font-semibold text-[#061224] shadow-xs focus:border-[#c89b3c] focus:outline-none focus:ring-1 focus:ring-[#c89b3c]"
                      value={paymentAction}
                      onChange={(e) => {
                        setPaymentAction(e.target.value);
                        setReceiptId("");
                        setPending(null);
                      }}
                    >
                      <option value="collect" disabled={collectionBlocked}>
                        Record collection
                      </option>
                      {allowRefund && (
                        <option value="refund">Return / refund payment</option>
                      )}
                      <option value="reverse">
                        Reverse incorrect collection
                      </option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8b96aa]" />
                  </div>
                </label>

                {paymentAction !== "collect" && (
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#68758c] space-y-1.5">
                    Original receipt
                    <div className="relative">
                      <select
                        aria-label="Original receipt"
                        className="w-full appearance-none rounded-xl border border-[#ede7dc] bg-white px-3.5 py-2.5 pr-8 text-xs font-semibold text-[#061224] shadow-xs focus:border-[#c89b3c] focus:outline-none focus:ring-1 focus:ring-[#c89b3c]"
                        required
                        value={receiptId}
                        onChange={(e) => {
                          setReceiptId(e.target.value);
                          setPending(null);
                        }}
                      >
                        <option value="">Select receipt</option>
                        {receipts
                          .filter(
                            (r) =>
                              data.payments.some(
                                (p) => p.id === r.id && p.type === "collection"
                              ) && remainingReceipt(r) > 0
                          )
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {(r.method || "payment").toUpperCase()} ·{" "}
                              {formatPaise(remainingReceipt(r))} remaining
                            </option>
                          ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8b96aa]" />
                    </div>
                  </label>
                )}

                {paymentAction !== "reverse" && (
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#68758c] space-y-1.5">
                    Amount (₹)
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#8b96aa]">
                        ₹
                      </span>
                      <input
                        type="number"
                        className="w-full rounded-xl border border-[#ede7dc] bg-white pl-8 pr-3.5 py-2.5 text-xs font-semibold text-[#061224] shadow-xs placeholder-[#8b96aa] focus:border-[#c89b3c] focus:outline-none focus:ring-1 focus:ring-[#c89b3c]"
                        required
                        min="0.01"
                        step="0.01"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => {
                          setAmount(e.target.value);
                          setPending(null);
                        }}
                      />
                    </div>
                  </label>
                )}

                {paymentAction === "collect" && (
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#68758c] space-y-1.5">
                    Collected by
                    <div className="relative">
                      <select
                        aria-label="Collected by"
                        className="w-full appearance-none rounded-xl border border-[#ede7dc] bg-white px-3.5 py-2.5 pr-8 text-xs font-semibold text-[#061224] shadow-xs focus:border-[#c89b3c] focus:outline-none focus:ring-1 focus:ring-[#c89b3c]"
                        value={method}
                        onChange={(e) => {
                          setMethod(e.target.value);
                          setPending(null);
                        }}
                      >
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                        <option value="card_terminal">Card terminal</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8b96aa]" />
                    </div>
                  </label>
                )}

                {paymentAction !== "reverse" && (
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#68758c] space-y-1.5">
                    Payment / return reference
                    <input
                      className="w-full rounded-xl border border-[#ede7dc] bg-white px-3.5 py-2.5 text-xs font-medium text-[#061224] shadow-xs placeholder-[#8b96aa] focus:border-[#c89b3c] focus:outline-none focus:ring-1 focus:ring-[#c89b3c]"
                      value={reference}
                      maxLength={180}
                      onChange={(e) => {
                        setReference(e.target.value);
                        setPending(null);
                      }}
                      placeholder="UPI reference, terminal reference or cash-return confirmation"
                    />
                  </label>
                )}

                <label className="block text-xs font-semibold uppercase tracking-wider text-[#68758c] space-y-1.5">
                  Reason{paymentAction === "collect" ? " (optional)" : ""}
                  <input
                    className="w-full rounded-xl border border-[#ede7dc] bg-white px-3.5 py-2.5 text-xs font-medium text-[#061224] shadow-xs placeholder-[#8b96aa] focus:border-[#c89b3c] focus:outline-none focus:ring-1 focus:ring-[#c89b3c]"
                    required={paymentAction !== "collect"}
                    minLength={paymentAction === "collect" ? undefined : 3}
                    maxLength={500}
                    placeholder={
                      paymentAction === "collect"
                        ? "Optional note (e.g. advance paid at desk)"
                        : "Reason for adjustment or return"
                    }
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      setPending(null);
                    }}
                  />
                </label>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-xl bg-[#0b1f3a] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#132c50] transition-colors disabled:opacity-50"
                    disabled={
                      busy || (paymentAction === "collect" && collectionBlocked)
                    }
                  >
                    Review{" "}
                    {paymentAction === "collect"
                      ? "collection"
                      : paymentAction === "refund"
                        ? "refund"
                        : "reversal"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-xl border border-[#ede7dc] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#68758c] hover:bg-[#f8f6f0] transition-colors"
                    disabled={busy}
                    onClick={() => setPaymentOpen(false)}
                  >
                    Hide payment form
                  </button>
                </div>
              </form>
            </div>

            {pending && (pending.action !== "refund" || allowRefund) && (
              <div
                role="group"
                aria-label="Confirm payment action"
                className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs"
              >
                <div className="flex items-start gap-2.5">
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-amber-100 text-amber-800 shrink-0">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <h5 className="font-bold text-[#061224] text-xs">
                      {pending.action === "collect"
                        ? "Confirm Payment Collection"
                        : pending.action === "reverse"
                          ? "Confirm Payment Reversal"
                          : "Confirm Guest Refund"}
                    </h5>
                    <p className="mt-1 font-medium text-amber-950">
                      {pending.action === "collect"
                        ? `Confirm ${formatPaise(Number(pending.amountPaise))} was collected?`
                        : pending.action === "reverse"
                          ? "Reverse this incorrect collection? The original receipt stays in history."
                          : receipts.find((r) => r.id === pending.receiptId)
                                ?.method === "online"
                            ? `Request an online refund of ${formatPaise(Number(pending.amountPaise))}?`
                            : `Confirm ${formatPaise(Number(pending.amountPaise))} has already been returned to the guest?`}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2.5 pt-1 pl-8">
                  <button
                    className="inline-flex items-center justify-center rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 transition-colors disabled:opacity-50"
                    disabled={
                      busy || (pending.action === "collect" && collectionBlocked)
                    }
                    onClick={() => void send(pending)}
                  >
                    {busy ? "Saving…" : "Confirm payment action"}
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-xl border border-[#ede7dc] bg-white px-3.5 py-2 text-xs font-semibold text-[#061224] hover:bg-[#f8f6f0] transition-colors"
                    disabled={busy}
                    onClick={() => setPending(null)}
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </>
    ),
    paymentRecords:
      data.paymentRecordsVisible === false ? (
        <p className="text-sm text-slate-500">
          Ask a cashier or manager for individual payment records. The
          reservation summary shows the stay balance.
        </p>
      ) : (
        <section className="space-y-3 border-t border-[#f3efe8] pt-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#061224]">
              Payment records
            </h4>
            <span className="text-[11px] font-semibold text-[#8b96aa]">
              {[...data.payments, ...data.onlinePayments, ...data.refunds]
                .length} entries
            </span>
          </div>

          {!data.payments.length &&
            !data.onlinePayments.length &&
            !data.refunds.length && (
              <p className="text-xs text-[#8b96aa]">
                No individual receipts recorded. Historical paid totals remain
                in the payment summary.
              </p>
            )}

          <div className="space-y-2">
            {[
              ...data.payments,
              ...data.onlinePayments.map((r) => ({
                ...r,
                type: "online_capture",
              })),
            ].map((r) => {
              const isReversal =
                r.type === "reversal" || (r.amountPaise ?? 0) < 0;
              const isOnline =
                r.type === "online_capture" || r.method === "online";
              return (
                <div
                  key={r.id}
                  data-receipt-id={r.id}
                  className="rounded-xl border border-[#ede7dc] bg-white p-3 text-xs shadow-2xs hover:border-[#dfd7c8] transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                          isReversal
                            ? "border-purple-200 bg-purple-50 text-purple-800"
                            : isOnline
                              ? "border-blue-200 bg-blue-50 text-blue-800"
                              : "border-emerald-200 bg-emerald-50 text-emerald-800"
                        }`}
                      >
                        {isReversal
                          ? "Reversal"
                          : isOnline
                            ? "Online Payment"
                            : "Collection"}
                      </span>
                      <span className="font-semibold capitalize text-[#061224]">
                        {r.method?.replaceAll("_", " ") || "Payment"}
                      </span>
                    </div>
                    <strong
                      className={`text-sm font-bold ${
                        isReversal ? "text-purple-900" : "text-[#061224]"
                      }`}
                    >
                      {formatPaise(r.amountPaise || 0)}
                    </strong>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#68758c]">
                    <span>{time(r.createdAt)}</span>
                    {r.reference ? (
                      <>
                        <span>•</span>
                        <span className="font-medium text-[#061224]">
                          Ref: {r.reference}
                        </span>
                      </>
                    ) : null}
                  </div>

                  {r.reason && (
                    <div className="mt-2 rounded-lg bg-[#f8f6f0] px-2.5 py-1.5 text-xs text-[#061224]">
                      <span className="font-semibold text-[#68758c]">
                        Note:{" "}
                      </span>
                      {r.reason}
                    </div>
                  )}
                </div>
              );
            })}

            {data.refunds.map((r) => (
              <div
                key={r.id}
                data-refund-id={r.id}
                className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-950 shadow-2xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900">
                      Refund
                    </span>
                    <span className="font-semibold capitalize">
                      Online refund
                    </span>
                  </div>
                  <strong className="text-sm font-bold text-amber-900">
                    {formatPaise(r.amountPaise || 0)}
                  </strong>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-amber-800">
                  <span className="capitalize">Status: {r.status}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ),
    feedback: (
      <>
        {query.isError && (
          <p role="alert" className="text-sm text-amber-800">
            The latest room and payment records could not load. Your edits have
            been kept.{" "}
            <button
              className="min-h-11 underline"
              onClick={() => void query.refetch()}
            >
              Retry controls
            </button>
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
            {unitId !== null && <button type="button" className="ml-2 min-h-10 underline" disabled={busy} onClick={async () => {
              await query.refetch(); assignmentRevision.current = null; setUnitId(null); setError("");
            }}>Reload assignment to review</button>}
          </p>
        )}
        {success && (
          <p role="status" className="sr-only">
            {success}
          </p>
        )}
      </>
    ),
  });
}

export function PhysicalRoomRegister({
  propertyId,
  rooms,
  onClose,
}: {
  propertyId: string;
  rooms: ReservationChoices["roomTypes"];
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ["partner", propertyId, "physical-units"],
    queryFn: () =>
      apiFetch<{ units: Row[] }>(
        `/api/partner/physical-units?propertyId=${propertyId}`,
      ),
  });
  const [label, setLabel] = useState(""),
    [room, setRoom] = useState(
      rooms.find((r) => r.status === "active")?.id || "",
    ),
    [editing, setEditing] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const save = async (body: object) => {
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/partner/physical-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, ...body }),
      });
      setEditing(null);
      setLabel("");
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save room.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open
      onClose={onClose}
      title="Room register"
      description="Numbered rooms for optional booking assignments"
    >
      <div className="space-y-5">
        <p className="text-sm text-slate-500">
          Adding a numbered room does not change the room type’s sellable
          inventory.
        </p>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save({
              label,
              roomTypeId: room,
              status: editing?.status || "active",
              ...(editing ? { id: editing.id } : {}),
            });
          }}
        >
          <label className="block text-xs text-slate-500">
            Room label
            <input
              className={input}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              maxLength={40}
              placeholder="e.g. 101"
            />
          </label>
          <label className="block text-xs text-slate-500">
            Room type
            <select
              className={input}
              required
              disabled={!!editing}
              value={room}
              onChange={(e) => setRoom(e.target.value)}
            >
              {rooms
                .filter((r) => r.status === "active")
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          </label>
          <button className={button} disabled={busy}>
            {editing ? "Save label" : "Add room"}
          </button>
          {editing && (
            <button
              type="button"
              className={button + " ml-2"}
              onClick={() => {
                setEditing(null);
                setLabel("");
              }}
            >
              Cancel edit
            </button>
          )}
        </form>
        {error && (
          <p role="alert" className="text-sm text-red-800">
            {error}
          </p>
        )}
        {query.isPending && <p role="status">Loading room register…</p>}
        {query.isError && (
          <p role="alert">
            Unable to load rooms.{" "}
            <button className="underline" onClick={() => void query.refetch()}>
              Retry
            </button>
          </p>
        )}
        <ul className="space-y-3">
          {query.data?.units.map((u) => (
            <li
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3"
            >
              <div>
                <p className="font-semibold">Room {u.label}</p>
                <p className="text-xs text-slate-500">
                  {rooms.find((r) => r.id === u.roomTypeId)?.name ||
                    "Room type"}{" "}
                  · {u.status}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => {
                    setEditing(u);
                    setLabel(u.label || "");
                    setRoom(u.roomTypeId || "");
                  }}
                >
                  Rename
                </button>
                <button
                  className={button}
                  disabled={busy}
                  onClick={() =>
                    void save({
                      id: u.id,
                      label: u.label,
                      roomTypeId: u.roomTypeId,
                      status: u.status === "active" ? "inactive" : "active",
                    })
                  }
                >
                  {u.status === "active" ? "Deactivate" : "Activate"}
                </button>
              </div>
            </li>
          ))}
        </ul>
        {query.data?.units.length === 0 && (
          <p className="text-sm text-slate-500">
            No numbered rooms yet. Add your first room above.
          </p>
        )}
      </div>
    </Drawer>
  );
}
