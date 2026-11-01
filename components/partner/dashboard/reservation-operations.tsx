"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { formatPaise } from "@/lib/currency";
import { Drawer } from "./drawer";
import type { ReservationChoices } from "./partner-reservations-page";
const button =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#e4ded2] bg-white px-3.5 py-2 text-xs font-bold text-[#4d5870] shadow-2xs hover:border-[#c89b3c] hover:bg-[#fbf5e8] hover:text-[#061224] active:scale-98 transition disabled:opacity-50";
const input =
  "mt-1 block min-h-10 w-full rounded-xl border border-[#e4ded2] bg-[#fdfdfc] px-3.5 py-2 text-xs font-semibold text-[#061224] shadow-2xs outline-none transition placeholder:font-normal placeholder:text-[#a0aec0] focus:border-[#c89b3c] focus:bg-white focus:ring-2 focus:ring-[#c89b3c]/15";
type Row = {
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
  payments: Row[];
  onlinePayments: Row[];
  refunds: Row[];
  units: Row[];
  features: { allocation: boolean; payments: boolean; amendments: boolean };
  revision: number;
  assignedUnitId: string | null;
  assignedUnitLabel: string | null;
  refundExcessPaise: number;
};
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
  render,
}: {
  booking: Booking;
  propertyId: string;
  onChanged: () => void;
  onDraftChange: ReportReservationDraft;
  render: (sections: ReservationOperationSections) => ReactNode;
}) {
  const query = useQuery({
    queryKey: ["partner", propertyId, booking.id, "operations"],
    queryFn: ({ signal }) =>
      apiFetch<Operations>(`/api/partner/bookings/${booking.id}/operations`, {
        signal,
      }),
    refetchOnWindowFocus: true,
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
  const data = query.data;
  const allowRefund =
    !["online", "razorpay"].includes(booking.paymentMethod ?? "") &&
    !data?.onlinePayments?.length;
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
    if (body.action === "refund" && !allowRefund) return;
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
  const remainingReceipt = (r: Row) =>
    Math.max(
      0,
      (r.amountPaise || 0) -
        (data.payments ?? [])
          .filter((p) => p.receiptId === r.id)
          .reduce((sum, p) => sum + (p.amountPaise || 0), 0) -
        (data.refunds ?? [])
          .filter((p) => p.paymentId === r.id && p.status !== "failed")
          .reduce((sum, p) => sum + (p.amountPaise || 0), 0),
    );
  return render({
    assignment: (
      <>
        {" "}
        {data.features?.allocation && (
          <section
            aria-label="Room assignment"
            className="rounded-xl border border-[#f0ece4] bg-[#fbfbf9] p-3.5 space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-[#061224]">
                  Room assignment
                </h4>
                {data.assignedUnitLabel ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                    Room {data.assignedUnitLabel}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                    Unassigned
                  </span>
                )}
              </div>
              {["confirmed", "checked_in"].includes(booking.bookingStatus) && (
                <button
                  type="button"
                  className="text-xs font-bold text-[#c89b3c] hover:underline"
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
            {data.assignedUnitId && (
              <p className="text-[11px] text-[#68758c]">
                Housekeeping:{" "}
                <strong className="capitalize text-[#061224]">
                  {data.units.find((u) => u.id === data.assignedUnitId)
                    ?.housekeepingStatus || "unknown"}
                </strong>
              </p>
            )}
            {assignmentOpen &&
              ["confirmed", "checked_in"].includes(booking.bookingStatus) && (
                <div className="flex items-end gap-2 pt-2 border-t border-[#ede7dc]">
                  <label className="flex-1 text-xs font-semibold text-[#4d5870]">
                    Physical room
                    <select
                      aria-label="Physical room"
                      className={input}
                      value={unitId ?? data.assignedUnitId ?? ""}
                      onChange={(e) => setUnitId(e.target.value)}
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
                            Room {u.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    disabled={busy}
                    className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#061224] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#0c1f3b] disabled:opacity-50 transition-all"
                    onClick={() =>
                      void send({
                        action: "assign",
                        unitId: (unitId ?? data.assignedUnitId) || null,
                        revision: data.revision,
                      })
                    }
                  >
                    Save room
                  </button>
                </div>
              )}
          </section>
        )}
      </>
    ),
    notes: (
      <>
        {" "}
        <details className="rounded-2xl border border-[#ede7dc] bg-white p-5 shadow-xs group">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-xs font-bold uppercase tracking-[0.06em] text-[#061224]">
            <span>
              Add staff note{" "}
              <span className="font-normal lowercase text-[#8b96aa]">
                · Private
              </span>
            </span>
            <span className="text-[#8b96aa] text-xs font-semibold group-open:hidden">
              Expand
            </span>
            <span className="text-[#8b96aa] text-xs font-semibold hidden group-open:inline">
              Collapse
            </span>
          </summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send({ action: "note", text: note });
            }}
            className="mt-3 space-y-2.5 border-t border-[#f3efe8] pt-3"
          >
            <label className="block text-xs font-semibold text-[#4d5870]">
              New note
              <textarea
                aria-label="New note"
                className={input}
                value={note}
                maxLength={2000}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add an internal note for hotel staff…"
                required
              />
            </label>
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#061224] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#0c1f3b] transition-all disabled:opacity-50"
              disabled={busy || !note.trim()}
            >
              Save note
            </button>
          </form>
          <p className="mt-2 text-[11px] font-medium text-[#8b96aa]">
            Notes are visible only to authorized hotel staff.
          </p>
          {data.events
            .filter((e) => e.type === "staff_note")
            .slice(0, 3)
            .map((e) => (
              <div
                key={e.id}
                className="mt-3 rounded-xl border border-[#e4ded2] bg-[#fbfbf9] p-3"
              >
                <p className="whitespace-pre-wrap text-xs font-medium text-[#061224]">
                  {e.text}
                </p>
                <p className="mt-1 text-[10px] font-semibold text-[#8b96aa]">
                  {time(e.createdAt)}
                </p>
              </div>
            ))}
        </details>
      </>
    ),
    paymentForm: (
      <>
        {" "}
        {data.features.payments && (
          <section aria-label="Collections and refunds" className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {[
                ["collect", "Record collection"],
                ["refund", "Refund payment"],
                ["reverse", "Reverse collection"],
              ]
                .filter(([action]) => action !== "refund" || allowRefund)
                .map(([action, label]) => (
                  <button
                    type="button"
                    key={action}
                    className={button}
                    disabled={busy}
                    aria-pressed={paymentOpen && paymentAction === action}
                    onClick={() => {
                      setPaymentAction(action);
                      setReceiptId("");
                      setPending(null);
                      setPaymentOpen(true);
                    }}
                  >
                    {label}
                  </button>
                ))}
            </div>
            <p className="text-xs text-slate-500">
              Only record money actually collected or returned. Online refunds
              are processed separately.
            </p>
            {allowRefund && data.refundExcessPaise > 0 && (
              <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
                {formatPaise(data.refundExcessPaise)} available to return
                against recorded receipts.
              </p>
            )}
            <div
              hidden={
                !paymentOpen || (paymentAction === "refund" && !allowRefund)
              }
            >
              <form
                className="space-y-3"
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
                <label className="block text-xs text-slate-500">
                  Action
                  <select
                    aria-label="Payment action"
                    className={input}
                    value={paymentAction}
                    onChange={(e) => {
                      setPaymentAction(e.target.value);
                      setReceiptId("");
                      setPending(null);
                    }}
                  >
                    <option value="collect">Record collection</option>
                    {allowRefund && (
                      <option value="refund">Return / refund payment</option>
                    )}
                    <option value="reverse">
                      Reverse incorrect collection
                    </option>
                  </select>
                </label>
                {paymentAction !== "collect" && (
                  <label className="block text-xs text-slate-500">
                    Original receipt
                    <select
                      aria-label="Original receipt"
                      className={input}
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
                            (paymentAction !== "reverse" ||
                              r.method !== "online") &&
                            remainingReceipt(r) > 0,
                        )
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.method} · {formatPaise(remainingReceipt(r))}{" "}
                            remaining · {r.id.slice(0, 10)}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {paymentAction !== "reverse" && (
                  <label className="block text-xs text-slate-500">
                    Amount (₹)
                    <input
                      type="number"
                      className={input}
                      required
                      min="0.01"
                      step="0.01"
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value);
                        setPending(null);
                      }}
                    />
                  </label>
                )}
                {paymentAction === "collect" && (
                  <label className="block text-xs text-slate-500">
                    Collected by
                    <select
                      aria-label="Collected by"
                      className={input}
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
                  </label>
                )}
                {paymentAction !== "reverse" && (
                  <label className="block text-xs text-slate-500">
                    Payment / return reference
                    <input
                      className={input}
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
                <label className="block text-xs text-slate-500">
                  Reason{paymentAction === "collect" ? " (optional)" : ""}
                  <input
                    className={input}
                    required={paymentAction !== "collect"}
                    minLength={paymentAction === "collect" ? undefined : 3}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      setPending(null);
                    }}
                  />
                </label>
                <button className={button} disabled={busy}>
                  Review{" "}
                  {paymentAction === "collect"
                    ? "collection"
                    : paymentAction === "refund"
                      ? "refund"
                      : "reversal"}
                </button>
              </form>
            </div>
            {paymentOpen && (
              <button
                type="button"
                className={button}
                disabled={busy}
                onClick={() => setPaymentOpen(false)}
              >
                Hide payment form
              </button>
            )}
            {pending && (pending.action !== "refund" || allowRefund) && (
              <div
                role="group"
                aria-label="Confirm payment action"
                className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
              >
                <p className="font-semibold">
                  {pending.action === "collect"
                    ? `Confirm ${formatPaise(Number(pending.amountPaise))} was collected?`
                    : pending.action === "reverse"
                      ? "Reverse this incorrect collection? The original receipt stays in history."
                      : receipts.find((r) => r.id === pending.receiptId)
                            ?.method === "online"
                        ? `Request an online refund of ${formatPaise(Number(pending.amountPaise))}?`
                        : `Confirm ${formatPaise(Number(pending.amountPaise))} has already been returned to the guest?`}
                </p>
                <div className="flex gap-3">
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() => void send(pending)}
                  >
                    {busy ? "Saving…" : "Confirm payment action"}
                  </button>
                  <button
                    className={button}
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
    paymentRecords: (
      <>
        {" "}
        <section className="space-y-3 border-t border-slate-200 pt-4">
          <h4 className="text-sm font-semibold text-[#061224]">
            Payment records
          </h4>
          {!receipts.length && (
            <p className="text-xs text-slate-600">
              No individual receipts recorded. Historical paid totals remain in
              the payment summary.
            </p>
          )}
          <div className="space-y-2">
            {[
              ...data.payments,
              ...data.onlinePayments.map((r) => ({
                ...r,
                type: "online_capture",
              })),
            ].map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs"
              >
                <div className="flex justify-between gap-3">
                  <span className="capitalize font-medium text-slate-700">
                    {(r.type || "payment").replaceAll("_", " ")} · {r.method}
                  </span>
                  <strong className="text-slate-900">
                    {formatPaise(r.amountPaise || 0)}
                  </strong>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {time(r.createdAt)} · {r.reference || r.id}
                </p>
                {r.reason && (
                  <p className="mt-1 text-slate-600 font-medium">{r.reason}</p>
                )}
              </div>
            ))}
            {data.refunds.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900"
              >
                Online refund · {formatPaise(r.amountPaise || 0)} · {r.status}
              </div>
            ))}
          </div>
        </section>
      </>
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
