"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { apiFetch } from "@/lib/api/client";
import { formatPaise as formatCurrency } from "@/lib/currency";
const formatPaise = (value: number) =>
  formatCurrency(value, { withFractions: true });
import { resolveLocal } from "@/lib/booking/domain";
import type { StayChangeInput } from "@/lib/partner/reservations/stay-change-domain";
import type { ReportReservationDraft } from "./reservation-operations";
import {
  ArrowRightLeft,
  BedDouble,
  CheckCircle2,
  ChevronDown,
  Clock,
  ShieldAlert,
} from "lucide-react";

const selectClass =
  "h-10 w-full appearance-none rounded-xl border border-slate-200/90 bg-slate-50/70 pl-3.5 pr-9 text-xs font-semibold text-[#061224] shadow-2xs outline-none transition hover:bg-white hover:border-slate-300 focus:border-[#c89b3c] focus:bg-white focus:ring-2 focus:ring-[#c89b3c]/20 disabled:bg-slate-100 disabled:text-slate-400";
const inputClass =
  "h-10 w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 text-xs font-semibold text-[#061224] shadow-2xs outline-none transition hover:bg-white hover:border-slate-300 focus:border-[#c89b3c] focus:bg-white focus:ring-2 focus:ring-[#c89b3c]/20 disabled:bg-slate-100 disabled:text-slate-400";
const textareaClass =
  "w-full resize-none rounded-xl border border-slate-200/90 bg-slate-50/70 p-3 text-xs font-medium text-[#061224] shadow-2xs outline-none transition placeholder:text-slate-400 hover:bg-white hover:border-slate-300 focus:border-[#c89b3c] focus:bg-white focus:ring-2 focus:ring-[#c89b3c]/20 disabled:bg-slate-100 disabled:text-slate-400";
const button =
  "min-h-10 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:border-[#c89b3c] hover:bg-[#fbf5e8] hover:text-[#061224] disabled:opacity-50 active:scale-98 transition";
const primaryButton =
  "min-h-10 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#061224] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#0c1f3b] disabled:opacity-50 active:scale-98 transition";
type Summary = {
  before: { room: string; category: string; departure: string };
  after: { room: string; category: string; departure: string };
  effectiveAt: string;
  adjustmentPaise?: number;
  balanceDuePaise?: number;
  refundableExcessPaise?: number;
  documentFollowUp: string;
  notice: string;
  token: string;
};
type Options = {
  reductionSources?: { id: string; description: string; amountPaise: number }[];
  capabilities: Record<string, boolean>;
  currentRoomTypeId?: string;
  units: {
    id: string;
    label: string;
    roomTypeId: string;
    condition: string;
    action: string;
    eligible: boolean;
    blocker: string | null;
  }[];
  rates: { id: string; name: string; roomTypeId: string }[];
  history: {
    id: string;
    changeId: string | null;
    room: string;
    category: string;
    startAt: string;
    endAt: string;
  }[];
  original: { room: string; category: string; departure: string } | null;
  timezone: string;
  bookingMode: string;
  departure: string;
};
type Pending = { key: string; body: string };
const labels = {
  move: "Move room",
  category: "Change room category",
  extend: "Extend stay",
  early_departure: "Record early departure",
};
export function ReservationStayChanges({
  bookingId,
  propertyId,
  onChanged,
  onDraftChange,
  currentRoom,
  currentCategory,
}: {
  bookingId: string;
  propertyId: string;
  onChanged: () => void;
  onDraftChange: ReportReservationDraft;
  currentRoom?: string | null;
  currentCategory?: string | null;
}) {
  const { appUser } = useAuth();
  const url = `/api/partner/bookings/${bookingId}/stay-change`,
    storageKey = `helpkey-stay-change:${appUser?.uid}:${propertyId}:${bookingId}`;
  const query = useQuery({
    queryKey: ["partner", propertyId, bookingId, "stay-change"],
    queryFn: ({ signal }) => apiFetch<Options>(url, { signal }),
    refetchOnWindowFocus: true,
  });
  const client = useQueryClient();
  const [action, setAction] = useState<keyof typeof labels>("move"),
    [unitId, setUnitId] = useState(""),
    [settlement, setSettlement] = useState(""),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(""),
    [minutes, setMinutes] = useState("60"),
    [rateId, setRateId] = useState(""),
    [reason, setReason] = useState(""),
    [departureNow, setDepartureNow] = useState(true),
    [negotiated, setNegotiated] = useState(false);
  const [reductionSourceId, setReductionSourceId] = useState("booking");
  const [review, setReview] = useState<Summary | null>(null),
    [pending, setPending] = useState<Pending | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active || !appUser?.uid) return;
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const p = JSON.parse(saved);
          if (typeof p.key === "string" && typeof p.body === "string")
            setPending(p);
        }
      } catch {
        setError(
          "Saved submission could not be loaded. Contact the owner before submitting another stay change.",
        );
      }
    });
    return () => {
      active = false;
    };
  }, [storageKey, appUser?.uid]);
  const dirty = !!(reason || review || pending || unitId || date || amount);
  useEffect(() => {
    onDraftChange("stay-change", dirty, busy || !!pending);
  }, [dirty, busy, pending, onDraftChange]);
  useEffect(() => () => onDraftChange("stay-change", false), [onDraftChange]);
  const options = query.data;
  const when = (s: string) =>
    new Intl.DateTimeFormat("en-IN", {
      timeZone: options?.timezone || "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(s));
  async function preview() {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const paise = Math.round(Number(amount) * 100);
      if (!reason.trim() || reason.trim().length < 3)
        throw new Error("Enter a reason of at least three characters.");
      if (
        ((action === "category" && settlement !== "complimentary") ||
          (action === "early_departure" && settlement === "reduce") ||
          (action === "extend" && negotiated)) &&
        (!amount ||
          !Number.isSafeInteger(paise) ||
          paise < 0 ||
          !/^\d+(\.\d{1,2})?$/.test(amount))
      )
        throw new Error(
          "Enter an exact nonnegative amount with at most two decimal places.",
        );
      let input: StayChangeInput;
      if (action === "move") input = { action, unitId };
      else if (action === "category") {
        if (!["complimentary", "charge", "credit"].includes(settlement))
          throw new Error("Choose the agreed financial settlement.");
        input = {
          action,
          unitId,
          settlement: settlement as "complimentary" | "charge" | "credit",
          reductionSourceId,
          adjustmentPaise:
            settlement === "complimentary"
              ? 0
              : settlement === "credit"
                ? -paise
                : paise,
        };
      } else if (action === "extend")
        input = {
          action,
          ...(options?.bookingMode === "hourly"
            ? { additionalMinutes: Number(minutes) }
            : { departureDate: date }),
          ...(rateId ? { ratePlanId: rateId } : {}),
          ...(negotiated ? { negotiatedPaise: paise } : {}),
        };
      else {
        if (!["retain", "reduce"].includes(settlement))
          throw new Error(
            "Choose whether to retain the charge or record an exact reduction.",
          );
        let departure = "now";
        if (!departureNow) {
          const [day, time] = date.split("T");
          departure = new Date(
            resolveLocal(day, time, options!.timezone),
          ).toISOString();
        }
        input = {
          action,
          departure,
          settlement: settlement as "retain" | "reduce",
          reductionSourceId,
          adjustmentPaise: settlement === "reduce" ? -paise : 0,
        };
      }
      setReview(
        await apiFetch<Summary>(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
      );
    } catch (e) {
      setReview(null);
      setError(
        e instanceof Error ? e.message : "Could not review this change.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    setBusy(true);
    setError("");
    const request = pending ?? {
      key: crypto.randomUUID(),
      body: JSON.stringify({ token: review!.token, reason }),
    };
    try {
      // Persist before sending. A lost response freezes the exact payload across reloads.
      localStorage.setItem(storageKey, JSON.stringify(request));
      setPending(request);
      await apiFetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": request.key,
        },
        body: request.body,
      });
      localStorage.removeItem(storageKey);
      setPending(null);
      setReview(null);
      setReason("");
      setAmount("");
      setUnitId("");
      setDate("");
      setSuccess(
        "Stay change recorded. Checkout, payment, refund and documents remain separate actions.",
      );
      await client.invalidateQueries({ queryKey: ["partner", propertyId] });
      onChanged();
    } catch (e) {
      // Once uncertain, later errors cannot prove that the original request did not commit.
      const code =
        e && typeof e === "object" && "code" in e ? String(e.code) : "";
      const definitive = [
        "STAY_REVIEW_CHANGED",
        "PREVIEW_EXPIRED",
        "ROOM_ALREADY_ASSIGNED",
        "STAY_CAPACITY_CONFLICT",
        "INVALID_DEPARTURE",
        "ROOM_NOT_CLEAN",
        "ROOM_MAINTENANCE",
        "RESOLVE_SERVICE_COMMITMENTS",
      ];
      if (!pending && definitive.includes(code)) {
        localStorage.removeItem(storageKey);
        setPending(null);
        setReview(null);
      }
      setError(
        e instanceof Error
          ? e.message
          : "Submission outcome is uncertain. Retry this exact submission.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (pending && !options)
    return (
      <section aria-label="In-house stay changes">
        <p>
          Saved submission awaiting a confirmed outcome. Its exact request is
          retained.
        </p>
        <button
          className={button}
          disabled={busy}
          onClick={() => void confirm()}
        >
          Retry saved submission
        </button>
        {error && <p role="alert">{error}</p>}
      </section>
    );
  if (
    !options ||
    (!pending && !Object.values(options.capabilities).some(Boolean))
  )
    return query.isError ? (
      <p role="alert">
        Stay-change options could not load.{" "}
        <button className={button} onClick={() => void query.refetch()}>
          Retry
        </button>
      </p>
    ) : null;
  return (
    <section
      aria-label="In-house stay changes"
      className="space-y-4 rounded-2xl border border-slate-200/90 bg-[#fdfdfc] p-4 sm:p-5 shadow-xs"
    >
      {/* Header & Context */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#061224] text-white">
            <ArrowRightLeft size={13} />
          </span>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold uppercase tracking-[0.06em] text-[#061224]">
              In-house stay changes
            </h3>
            <span className="rounded-full bg-emerald-100/80 px-2.5 py-0.5 text-[10px] font-bold text-emerald-900 border border-emerald-200">
              In-House Stay
            </span>
          </div>
        </div>

        {/* Current Assigned Room Pill */}
        {currentRoom && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/90 px-2.5 py-1 text-xs font-bold text-emerald-900 shadow-2xs">
            <BedDouble size={13} className="text-emerald-700" />
            <span>Room {currentRoom}</span>
          </span>
        )}
      </div>

      {pending ? (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3"
        >
          <div className="flex items-center gap-2 text-xs font-bold text-amber-950">
            <Clock className="h-4 w-4 text-amber-600" />
            <span>Submission in progress</span>
          </div>
          <p className="text-xs text-amber-900">
            A submission is awaiting a confirmed outcome. Its exact request is
            retained; edits are frozen.
          </p>
          <button
            className={primaryButton}
            disabled={busy}
            onClick={() => void confirm()}
          >
            Retry saved submission
          </button>
        </div>
      ) : (
        <>
          <fieldset
            disabled={busy || !!review}
            className="grid gap-3 sm:grid-cols-2"
          >
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Action
              <div className="relative mt-1">
                <select
                  aria-label="Action"
                  className={selectClass}
                  value={action}
                  onChange={(e) => {
                    setAction(e.target.value as keyof typeof labels);
                    setSettlement("");
                    setDate("");
                    setUnitId("");
                  }}
                >
                  {Object.entries(labels)
                    .filter(([a]) => options.capabilities[a])
                    .map(([a, label]) => (
                      <option key={a} value={a}>
                        {label}
                      </option>
                    ))}
                </select>
                <ChevronDown
                  size={14}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
              </div>
            </label>

            {(action === "move" || action === "category") && (
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Destination room
                <div className="relative mt-1">
                  <select
                    aria-label="Destination room"
                    className={selectClass}
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                  >
                    <option value="">Select a room</option>
                    {options.units
                      .filter((u) => u.action === action)
                      .map((u) => (
                        <option key={u.id} value={u.id} disabled={!u.eligible}>
                          Room {u.label} · {u.condition}
                          {u.blocker ? ` — ${u.blocker}` : " · available"}
                        </option>
                      ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                </div>
              </label>
            )}

            {action === "category" && (
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Settlement
                <div className="relative mt-1">
                  <select
                    aria-label="Settlement"
                    className={selectClass}
                    value={settlement}
                    onChange={(e) => setSettlement(e.target.value)}
                  >
                    <option value="">Choose explicitly</option>
                    <option value="complimentary">Complimentary change</option>
                    <option value="charge">Additional agreed charge</option>
                    <option value="credit">Agreed credit</option>
                  </select>
                  <ChevronDown
                    size={14}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                </div>
              </label>
            )}

            {action === "extend" && (
              <>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Extension rate
                  <div className="relative mt-1">
                    <select
                      className={selectClass}
                      value={rateId}
                      onChange={(e) => setRateId(e.target.value)}
                    >
                      <option value="">Current rate, if eligible</option>
                      {options.rates
                        .filter(
                          (r) => r.roomTypeId === options.currentRoomTypeId,
                        )
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>
                </label>
                {options.bookingMode === "hourly" ? (
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Additional duration
                    <div className="relative mt-1">
                      <select
                        className={selectClass}
                        value={minutes}
                        onChange={(e) => setMinutes(e.target.value)}
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={(i + 1) * 60}>
                            {i + 1} hour(s)
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={14}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                    </div>
                  </label>
                ) : (
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    New hotel-local departure date
                    <input
                      type="date"
                      className={`${inputClass} mt-1`}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </label>
                )}
                <label className="sm:col-span-2 flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-[#061224] focus:ring-[#c89b3c]"
                    checked={negotiated}
                    onChange={(e) => setNegotiated(e.target.checked)}
                  />{" "}
                  <span>Use a negotiated final extension charge</span>
                </label>
                <p className="sm:col-span-2 text-[11px] text-slate-500 font-medium">
                  If this room is unavailable, move first, then review the
                  extension again. Moving reserves only the existing stay; the
                  extension can still fail if availability changes.
                </p>
              </>
            )}

            {action === "early_departure" && (
              <>
                <label className="sm:col-span-2 flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-[#061224] focus:ring-[#c89b3c]"
                    checked={departureNow}
                    onChange={(e) => setDepartureNow(e.target.checked)}
                  />{" "}
                  <span>Depart now</span>
                </label>
                {!departureNow && (
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    New departure ({options.timezone})
                    <input
                      type="datetime-local"
                      className={`${inputClass} mt-1`}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </label>
                )}
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Settlement
                  <div className="relative mt-1">
                    <select
                      aria-label="Settlement"
                      className={selectClass}
                      value={settlement}
                      onChange={(e) => setSettlement(e.target.value)}
                    >
                      <option value="">Choose explicitly</option>
                      <option value="retain">Retain the existing charge</option>
                      <option value="reduce">
                        Record an exact agreed reduction
                      </option>
                    </select>
                    <ChevronDown
                      size={14}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>
                </label>
                <p className="sm:col-span-2 text-[11px] text-slate-500 font-medium">
                  No automatic unused-night refund is calculated. Recording this
                  change does not check the guest out or return money.
                </p>
              </>
            )}

            {((action === "category" &&
              ["charge", "credit"].includes(settlement)) ||
              (action === "extend" && negotiated) ||
              (action === "early_departure" && settlement === "reduce")) && (
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Exact final{" "}
                {settlement === "credit" || settlement === "reduce"
                  ? "reduction"
                  : "charge"}{" "}
                (₹)
                <input
                  inputMode="decimal"
                  className={`${inputClass} mt-1`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
            )}

            {((action === "category" && settlement === "credit") ||
              (action === "early_departure" && settlement === "reduce")) && (
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Accommodation source to reduce
                <div className="relative mt-1">
                  <select
                    className={selectClass}
                    value={reductionSourceId}
                    onChange={(e) => setReductionSourceId(e.target.value)}
                  >
                    {options.reductionSources?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.description} · {formatPaise(s.amountPaise)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                </div>
              </label>
            )}

            <label className="sm:col-span-2 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Reason
              <textarea
                aria-label="Reason"
                rows={2}
                className={`${textareaClass} mt-1`}
                maxLength={500}
                placeholder="Reason for change (e.g. guest requested room upgrade, AC maintenance, or extension)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </fieldset>

          {!review && (
            <div className="pt-1">
              <button
                type="button"
                className={primaryButton}
                disabled={busy || !options.capabilities[action]}
                onClick={() => void preview()}
              >
                {busy ? "Checking availability…" : "Review change"}
              </button>
            </div>
          )}

          {review && (
            <div
              className="space-y-3.5 rounded-xl border border-amber-300 bg-amber-50/50 p-4 shadow-xs"
              aria-label="Confirm stay change"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-amber-950">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Ready to confirm stay change</span>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
                <div className="rounded-lg border border-amber-200/80 bg-white p-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Room Transfer
                  </span>
                  <p className="font-bold text-[#061224]">
                    {review.before.room} · {review.before.category} →{" "}
                    {review.after.room} · {review.after.category}
                  </p>
                </div>
                <div className="rounded-lg border border-amber-200/80 bg-white p-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Departure Time
                  </span>
                  <p className="font-bold text-[#061224]">
                    {when(review.before.departure)} →{" "}
                    {when(review.after.departure)}
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-amber-900 font-medium">
                Effective immediately on server confirmation. Review expires in
                five minutes.
              </p>

              {review.adjustmentPaise !== undefined && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200/80 bg-white p-2.5 text-xs font-semibold">
                  <span>
                    Final adjustment:{" "}
                    <strong
                      className={
                        review.adjustmentPaise > 0
                          ? "text-amber-800"
                          : review.adjustmentPaise < 0
                            ? "text-emerald-700"
                            : "text-slate-800"
                      }
                    >
                      {formatPaise(review.adjustmentPaise)}
                    </strong>
                    .
                  </span>
                  <span>
                    Resulting balance:{" "}
                    <strong>{formatPaise(review.balanceDuePaise ?? 0)}</strong>.
                  </span>
                  {!!review.refundableExcessPaise && (
                    <span className="text-emerald-700">
                      Potential refundable excess:{" "}
                      <strong>
                        {formatPaise(review.refundableExcessPaise)}
                      </strong>
                      .
                    </span>
                  )}
                </div>
              )}

              {review.documentFollowUp && (
                <p className="text-[11px] text-slate-600">
                  {review.documentFollowUp}
                </p>
              )}
              {review.notice && (
                <p className="text-[11px] text-slate-600">{review.notice}</p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  className={primaryButton}
                  disabled={busy}
                  onClick={() => void confirm()}
                >
                  {busy
                    ? "Confirming…"
                    : `Confirm ${labels[action].toLowerCase()}`}
                </button>
                <button
                  type="button"
                  className={button}
                  disabled={busy}
                  onClick={() => setReview(null)}
                >
                  Edit and review again
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2"
        >
          <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">{error}</p>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
              <a
                className="underline hover:text-rose-950"
                href={`/partner/rooms?propertyId=${encodeURIComponent(propertyId)}`}
              >
                Review rooms
              </a>
              <span>·</span>
              <a
                className="underline hover:text-rose-950"
                href="#workspace-requests"
              >
                Stay requests
              </a>
              <span>·</span>
              <a
                className="underline hover:text-rose-950"
                href="#workspace-billing"
              >
                Billing
              </a>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 flex items-center gap-2"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {(!!options.history.length || !!options.original) && (
        <details className="rounded-xl border border-slate-200/90 bg-white p-3.5 group transition-all" open={options.history.length > 0}>
          <summary className="cursor-pointer font-bold text-xs text-slate-700 hover:text-[#061224] flex items-center justify-between select-none">
            <div className="flex items-center gap-2">
              <span className="grid h-5 w-5 place-items-center rounded-md bg-slate-100 text-slate-600">
                <Clock size={12} />
              </span>
              <span>Room assignment history</span>
              {options.history.length > 0 && (
                <span className="rounded-full bg-slate-100 px-2 py-0.2 text-[10px] font-bold text-slate-600">
                  {options.history.length} {options.history.length === 1 ? "record" : "records"}
                </span>
              )}
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400 group-open:rotate-180 transition-transform" />
          </summary>

          <div className="mt-3 space-y-2.5 border-t border-slate-100 pt-3 text-xs">
            {options.original && (
              <div className="flex items-start gap-2.5 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-2.5">
                <span className="mt-1 h-2 w-2 rounded-full bg-slate-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-700">Initial Booking</span>
                    <span className="rounded bg-white border border-slate-200 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                      Room {options.original.room} · {options.original.category}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500 font-medium">
                    Originally scheduled departure was {when(options.original.departure)}
                  </p>
                </div>
              </div>
            )}

            {options.history.length > 0 && (
              <ol className="relative border-l border-slate-200 ml-2.5 pl-4 space-y-3">
                {options.history.map((s, idx) => {
                  const isCurrent = idx === options.history.length - 1;
                  return (
                    <li key={s.id} className="relative">
                      <span
                        className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white ${
                          isCurrent ? "bg-emerald-600 ring-2 ring-emerald-100" : "bg-slate-300"
                        }`}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-800">
                            <strong>Room {s.room}</strong> · {s.category}: {when(s.startAt)} – {when(s.endAt)}
                          </p>
                          <p className="text-[11px] text-slate-400 font-medium">
                            {isCurrent ? "Current occupancy" : "Previous stay interval"}
                          </p>
                        </div>
                        {s.changeId && (
                          <a
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#c89b3c] hover:underline"
                            href="#workspace-billing"
                          >
                            Linked billing and documents
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </details>
      )}
    </section>
  );
}
