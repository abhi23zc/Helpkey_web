"use client";

import {
  useId,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BedDouble,
  CalendarDays,
  ChevronDown,
  Clock,
  CreditCard,
  LogIn,
  LogOut,
  Mail,
  Phone,
  Receipt,
  User2,
} from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { formatPaise } from "@/lib/currency";
import { StayRequestList } from "@/components/stay/stay-request-list";
import { BookingReceiptModal } from "@/components/trips/booking-receipt-modal";
import { supplementalFinancials } from "@/lib/stay/agreements";
import { requestGroup } from "@/lib/stay/workspace";
import type { StayBookingData } from "@/lib/stay/contracts";
import { ReservationOperations } from "./reservation-operations";
import { Drawer } from "./drawer";

type Reservation = Partial<StayBookingData> &
  import("@/components/trips/booking-receipt-modal").BookingReceiptData & {
    propertyId: string;
    source?: string;
    roomTypeId?: string | null;
    specialRequest?: string;
    timezone?: string;
    startAt?: string;
    endAt?: string;
  };
type WorkspaceProps = {
  bookingId: string | null;
  propertyId: string;
  onClose: () => void;
  onChanged: () => void;
};
const button =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#e4ded2] bg-white px-4 py-2 text-xs font-bold text-[#4d5870] shadow-2xs hover:border-[#c89b3c] hover:bg-[#fbf5e8] hover:text-[#061224] transition-all disabled:opacity-50";
const heading = "text-xs font-bold uppercase tracking-[0.06em] text-[#061224]";

function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "G";
  const letters =
    parts.length === 1
      ? parts[0].slice(0, 2)
      : `${parts[0][0]}${parts[parts.length - 1][0]}`;
  return letters.toUpperCase();
}

/** A different reservation always starts with fresh forms and confirmations. */
export function ReservationWorkspace(props: WorkspaceProps) {
  return (
    <ReservationDetails
      key={`${props.propertyId}:${props.bookingId ?? "closed"}`}
      {...props}
    />
  );
}

function ReservationDetails({
  bookingId,
  propertyId,
  onClose,
  onChanged,
}: WorkspaceProps) {
  const [now, setNow] = useState(() => Date.now());
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [closeWarning, setCloseWarning] = useState(false);
  const [drafts, setDrafts] = useState<
    Record<string, { dirty: boolean; busy: boolean }>
  >({});
  const keepEditing = useRef<HTMLButtonElement>(null);
  const moreActions = useRef<HTMLDivElement>(null);
  const moreActionsId = useId();
  const paymentDetails = useRef<HTMLDetailsElement>(null);
  const dirty = Object.values(drafts).some((d) => d.dirty);
  const saving = Object.values(drafts).some((d) => d.busy);
  const reportDraft = useCallback(
    (section: string, changed: boolean, busy = false) => {
      setDrafts((old) =>
        old[section]?.dirty === changed && old[section]?.busy === busy
          ? old
          : { ...old, [section]: { dirty: changed, busy } },
      );
    },
    [],
  );
  useEffect(() => {
    if (!bookingId) return;
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [bookingId]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || saving) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);
  useEffect(() => {
    if (closeWarning) keepEditing.current?.focus();
  }, [closeWarning]);

  const query = useQuery({
    queryKey: ["partner", propertyId, "booking", bookingId],
    enabled: !!bookingId,
    queryFn: ({ signal }) =>
      apiFetch<{
        booking: Reservation;
        readiness?: { assigned: boolean; status: string };
        cancellationPreview?: {
          onlineRefundPaise: number;
          propertyReturnPaise: number;
          noShowOnlineRefundPaise?: number;
        };
      }>(`/api/partner/bookings/${encodeURIComponent(bookingId!)}`, { signal }),
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const booking =
    query.data?.booking.propertyId === propertyId
      ? query.data.booking
      : undefined;
  const refresh = () => {
    void query.refetch();
    onChanged();
  };
  const mutation = useMutation({
    mutationFn: (status: string) =>
      apiFetch(
        `/api/partner/bookings/${encodeURIComponent(bookingId!)}/status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      ),
    onSuccess: () => {
      setConfirm(null);
      refresh();
    },
  });
  const refetch = query.refetch;
  useEffect(() => {
    const listener = () => {
      void refetch();
      onChanged();
    };
    window.addEventListener("stay-request-updated", listener);
    return () => window.removeEventListener("stay-request-updated", listener);
  }, [refetch, onChanged]);

  function requestClose() {
    if (receiptOpen) {
      setReceiptOpen(false);
      return;
    }
    if (mutation.isPending || saving) return;
    if (dirty) setCloseWarning(true);
    else onClose();
  }
  const local = (value?: string | null) =>
    value
      ? new Intl.DateTimeFormat("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: booking?.timezone || "Asia/Kolkata",
        }).format(new Date(value))
      : "Not provided";
  const status = booking?.bookingStatus;
  const active = status === "confirmed" || status === "checked_in";
  const primary =
    status === "confirmed"
      ? "checked_in"
      : status === "checked_in"
        ? "checked_out"
        : null;
  const tooEarly = !!booking?.startAt && Date.parse(booking.startAt) > now;
  const stayEnded = !!booking?.endAt && Date.parse(booking.endAt) <= now;
  const checkInUnavailable =
    primary === "checked_in" && (tooEarly || stayEnded);
  const secondary =
    status === "confirmed"
      ? [
          ["no_show", "Mark no-show"],
          ["cancelled", "Cancel reservation"],
        ]
      : status === "pending_payment"
        ? [["cancelled", "Cancel reservation"]]
        : [];
  const actionTitle =
    confirm === "checked_in"
      ? "Check in guest"
      : confirm === "checked_out"
        ? "Check out guest"
        : confirm === "no_show"
          ? "Mark no-show"
          : "Cancel reservation";
  const supplemental = supplementalFinancials(
    booking?.customizations ?? [],
    booking?.stayPaymentReceipts,
  );
  const balance = booking?.balanceDuePaise ?? 0;
  const openRequests = (booking?.customizations ?? []).filter(
    (r) => active && requestGroup(r) !== "completed",
  );
  const otherRequests = (booking?.customizations ?? []).filter(
    (r) => !openRequests.includes(r),
  );
  const readiness = query.data?.readiness;
  const roomWarning =
    status === "confirmed" &&
    readiness &&
    (!readiness.assigned || !["clean", "inspected"].includes(readiness.status));
  const needsAttention =
    balance > 0 ||
    roomWarning ||
    openRequests.length > 0 ||
    booking?.preCheckin?.notes ||
    booking?.specialRequest;
  function openPaymentDetails() {
    if (paymentDetails.current) {
      paymentDetails.current.open = true;
      paymentDetails.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
      paymentDetails.current.querySelector<HTMLElement>("summary")?.focus();
    }
  }
  const requestList = (
    requests: NonNullable<Reservation["customizations"]>,
  ) => (
    <StayRequestList
      requests={requests}
      currency={booking!.currency}
      timezone={booking!.timezone || "Asia/Kolkata"}
      staff={{
        bookingId: booking!.id,
        revision: booking!.stayRevision ?? 0,
        enabled: active,
        refresh,
      }}
      onDraftChange={reportDraft}
      compactStaff
    />
  );

  return (
    <Drawer
      spacious
      open={!!bookingId}
      onClose={requestClose}
      title="Reservation details"
      badge={
        booking ? (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold capitalize border ${
              status === "confirmed"
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : status === "checked_in"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : ["cancelled", "no_show"].includes(status ?? "")
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-slate-200 bg-slate-100 text-slate-700"
            }`}
          >
            {status === "checked_in"
              ? "In-house"
              : status?.replaceAll("_", " ")}
          </span>
        ) : undefined
      }
      description={
        booking?.confirmationCode
          ? `Booking reference #${booking.confirmationCode}`
          : "Loading reservation details…"
      }
      footer={
        booking && (primary || secondary.length > 0 || closeWarning) ? (
          <div className="relative space-y-3 text-xs">
            {closeWarning ? (
              <div
                role="alertdialog"
                aria-label="Unsaved reservation changes"
                className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4"
              >
                <p className="text-sm font-bold text-amber-950">
                  You have unsaved changes.
                </p>
                <p className="text-xs text-amber-900/80">
                  Keep editing to save your work, or discard the unfinished
                  changes and close.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    ref={keepEditing}
                    className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#061224] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#0c1f3b] transition-all"
                    onClick={() => setCloseWarning(false)}
                  >
                    Keep editing
                  </button>
                  <button className={button} onClick={onClose}>
                    Discard changes and close
                  </button>
                </div>
              </div>
            ) : (
              <>
                {checkInUnavailable && (
                  <div className="flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3.5 py-2 text-xs font-medium text-amber-900">
                    <Clock size={14} className="shrink-0 text-amber-600" />
                    <p
                      id="check-in-availability"
                      className="leading-snug text-xs text-amber-950 font-medium"
                    >
                      {tooEarly
                        ? `Check-in opens ${local(booking.startAt)} (hotel time).`
                        : "The booked stay has ended. Check-in is no longer available."}
                    </p>
                  </div>
                )}
                {confirm ? (
                  <div
                    role="group"
                    aria-label="Confirm reservation action"
                    className="space-y-3 rounded-2xl border border-[#ede7dc] bg-[#fafaf8] p-4 shadow-xs"
                  >
                    <p className="text-sm font-bold text-[#061224]">
                      {actionTitle}?
                    </p>
                    {confirm === "cancelled" && (
                      <p className="text-xs leading-5 text-[#68758c]">
                        {formatPaise(
                          query.data?.cancellationPreview?.onlineRefundPaise ??
                            0,
                        )}{" "}
                        online refund will be queued. Up to{" "}
                        {formatPaise(
                          query.data?.cancellationPreview
                            ?.propertyReturnPaise ?? 0,
                        )}{" "}
                        collected at the property must be returned separately.
                        Cancellation releases the reserved room capacity.
                      </p>
                    )}
                    {confirm === "no_show" && (
                      <p className="text-xs leading-5 text-[#68758c]">
                        {formatPaise(
                          query.data?.cancellationPreview
                            ?.noShowOnlineRefundPaise ?? 0,
                        )}{" "}
                        online refund will be queued under the saved
                        cancellation policy. Marking no-show releases the
                        reserved capacity.
                      </p>
                    )}
                    {dirty && (
                      <p className="text-xs font-semibold text-amber-800">
                        There are unfinished edits in this reservation. Save
                        them before changing its status.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#061224] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#0c1f3b] disabled:opacity-50 transition-all"
                        disabled={mutation.isPending || saving}
                        onClick={() => mutation.mutate(confirm)}
                      >
                        {mutation.isPending ? "Saving…" : "Confirm action"}
                      </button>
                      <button
                        className={button}
                        disabled={mutation.isPending}
                        onClick={() => setConfirm(null)}
                      >
                        Keep unchanged
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    {primary && (
                      <button
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#061224] px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#0c1f3b] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        disabled={
                          mutation.isPending || saving || checkInUnavailable
                        }
                        aria-describedby={
                          checkInUnavailable
                            ? "check-in-availability"
                            : undefined
                        }
                        onClick={() => {
                          setConfirm(primary);
                          mutation.reset();
                        }}
                      >
                        {primary === "checked_in" ? (
                          <LogIn size={15} />
                        ) : (
                          <LogOut size={15} />
                        )}
                        <span>
                          {primary === "checked_in" ? "Check in" : "Check out"}
                        </span>
                      </button>
                    )}
                    {secondary.length > 0 && (
                      <div>
                        <button
                          type="button"
                          popoverTarget={moreActionsId}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#e4ded2] bg-white px-4 py-2.5 text-xs font-bold text-[#4d5870] shadow-2xs hover:border-[#c89b3c] hover:bg-[#fbf5e8] hover:text-[#061224] transition-all cursor-pointer"
                        >
                          <span>More actions</span> <ChevronDown size={14} />
                        </button>
                        <div
                          ref={moreActions}
                          id={moreActionsId}
                          popover="auto"
                          style={{
                            inset: "auto 1.5rem 5.5rem auto",
                            margin: 0,
                          }}
                          className="fixed w-60 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-[#e4ded2] bg-white p-2 shadow-2xl shadow-[#061224]/15"
                        >
                          {secondary.map(([value, label]) => (
                            <button
                              key={value}
                              className="inline-flex min-h-10 w-full items-center justify-start gap-2 rounded-xl px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 transition-colors disabled:opacity-50"
                              disabled={
                                mutation.isPending ||
                                saving ||
                                (value === "no_show" &&
                                  (!booking.startAt || tooEarly))
                              }
                              onClick={() => {
                                setConfirm(value);
                                mutation.reset();
                                if (moreActions.current)
                                  moreActions.current.hidePopover();
                              }}
                            >
                              {label}
                            </button>
                          ))}
                          {status === "confirmed" &&
                            (!booking.startAt || tooEarly) && (
                              <p className="px-3 py-2 text-[11px] font-medium text-[#8b96aa]">
                                No-show becomes available after the booked
                                arrival time.
                              </p>
                            )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {mutation.isError && (
                  <p
                    role="alert"
                    className="text-xs font-semibold text-rose-700"
                  >
                    {mutation.error.message}
                  </p>
                )}
              </>
            )}
          </div>
        ) : undefined
      }
    >
      {query.isPending ? (
        <p role="status" className="py-6 text-xs font-semibold text-[#8b96aa]">
          Loading reservation…
        </p>
      ) : query.isError && !booking ? (
        <div
          role="alert"
          className="space-y-3 text-xs font-semibold text-rose-700"
        >
          <p>Unable to load reservation. {query.error.message}</p>
          <button className={button} onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      ) : !booking ? (
        <p role="alert" className="text-xs font-semibold text-[#8b96aa]">
          This reservation does not belong to the selected property.
        </p>
      ) : (
        <ReservationOperations
          booking={booking}
          propertyId={propertyId}
          onChanged={refresh}
          onDraftChange={reportDraft}
          render={(sections) => (
            <div className="space-y-5 pb-3 text-xs text-[#061224]">
              {query.isError && (
                <p
                  role="alert"
                  className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800"
                >
                  The latest reservation details could not load. Your edits have
                  been kept.{" "}
                  <button
                    className="font-bold underline"
                    onClick={() => void query.refetch()}
                  >
                    Retry refresh
                  </button>
                </p>
              )}

              {/* 1. Guest Profile Hero Card */}
              <section
                aria-label="Guest"
                className="rounded-2xl border border-[#ede7dc] bg-white p-5 shadow-xs transition-shadow"
              >
                <div className="flex items-start gap-3.5">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#061224] text-white shadow-xs ring-2 ring-[#c89b3c]/25">
                    <span className="text-sm font-black tracking-wider text-[#c89b3c]">
                      {toInitials(booking.leadGuest?.name || "Guest")}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words text-xl font-bold tracking-tight text-[#061224]">
                        {booking.leadGuest?.name || "Guest"}
                      </h3>
                      <span className="rounded-md border border-[#e4ded2] bg-[#fbf5e8] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#8a7044]">
                        {booking.source === "manual_partner"
                          ? "Front desk"
                          : "Helpkey Online"}
                      </span>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-[#68758c]">
                      <span>
                        {booking.adults ?? 1}{" "}
                        {(booking.adults ?? 1) === 1 ? "adult" : "adults"}
                        {booking.children
                          ? ` · ${booking.children} ${booking.children === 1 ? "child" : "children"}`
                          : ""}
                        {booking.infants
                          ? ` · ${booking.infants} ${booking.infants === 1 ? "infant" : "infants"}`
                          : ""}
                      </span>
                      {booking.confirmationCode && (
                        <>
                          <span>•</span>
                          <span className="font-mono font-bold text-[#061224]">
                            #{booking.confirmationCode}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <GuestContactDetails
                  leadGuest={booking.leadGuest}
                  guestNames={booking.guestNames}
                />
              </section>

              {/* 2. Stay & Arrival Card */}
              <section
                aria-labelledby="reservation-stay-heading"
                className="rounded-2xl border border-[#ede7dc] bg-white p-5 shadow-xs space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f3efe8] pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#fbf5e8] text-[#c89b3c]">
                      <CalendarDays className="h-4 w-4" />
                    </span>
                    <h3 id="reservation-stay-heading" className={heading}>
                      Stay & arrival
                    </h3>
                  </div>
                  <span className="rounded-md bg-[#f4f2ee] px-2 py-0.5 text-[10px] font-bold text-[#68758c]">
                    {booking.timezone === "Asia/Kolkata"
                      ? "Hotel time · IST"
                      : `Hotel time · ${booking.timezone || "Asia/Kolkata"}`}
                  </span>
                </div>

                <dl className="grid grid-cols-2 gap-3">
                  <Detail label="Booked check-in">
                    {booking.startAt ? local(booking.startAt) : booking.checkIn}
                  </Detail>
                  <Detail label="Booked check-out">
                    {booking.endAt ? local(booking.endAt) : booking.checkOut}
                  </Detail>
                  <Detail label="Room type" icon={BedDouble}>
                    {booking.roomName}
                  </Detail>
                  <Detail label="Stay duration" icon={Clock}>
                    {booking.bookingMode === "hourly"
                      ? `${Math.round(((booking.durationMinutes ?? 0) / 60) * 10) / 10} hours`
                      : `${booking.nights ?? 1} ${(booking.nights ?? 1) === 1 ? "night" : "nights"}`}
                  </Detail>
                </dl>

                {sections.assignment}

                <div className="rounded-xl border border-[#e4ded2] bg-[#fbfbf9] p-3.5">
                  <div className="flex items-start gap-2.5">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#8b96aa]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-[#061224]">
                        {booking.preCheckin?.arrivalChoice === "unknown"
                          ? "Arrival time: Not sure yet"
                          : booking.preCheckin?.expectedArrivalAt
                            ? `Expected arrival: ${local(booking.preCheckin.expectedArrivalAt)}`
                            : "Arrival time not provided"}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-[#68758c]">
                        {booking.preCheckin?.status === "submitted"
                          ? "Online pre-check-in submitted"
                          : "Online pre-check-in incomplete"}{" "}
                        ·{" "}
                        {status === "checked_in"
                          ? "Guest checked in at the hotel"
                          : status === "checked_out"
                            ? "Guest checked out"
                            : "Separate from check-in at the hotel"}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* 3. Needs Attention Alert Card */}
              {needsAttention ? (
                <section
                  aria-labelledby="reservation-attention-heading"
                  className="rounded-2xl border border-amber-200/90 bg-[#fefdfa] p-5 shadow-xs space-y-3.5"
                >
                  <div className="flex items-center gap-2 border-b border-amber-200/60 pb-2.5">
                    <span className="grid h-6 w-6 place-items-center rounded-lg bg-amber-100 text-amber-700">
                      <AlertCircle className="h-3.5 w-3.5" />
                    </span>
                    <h3
                      id="reservation-attention-heading"
                      className="text-xs font-bold uppercase tracking-[0.06em] text-amber-950"
                    >
                      Needs attention
                    </h3>
                  </div>

                  {(balance > 0 || roomWarning) && (
                    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5">
                      {balance > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-bold text-amber-950">
                            Balance due · {formatPaise(balance)}
                          </p>
                          <button
                            className="text-xs font-bold text-[#c89b3c] hover:underline underline-offset-4"
                            onClick={openPaymentDetails}
                          >
                            View payment details
                          </button>
                        </div>
                      )}
                      {roomWarning && (
                        <p className="flex gap-2 text-xs leading-5 text-amber-950">
                          <AlertCircle
                            size={15}
                            className="mt-0.5 shrink-0 text-amber-600"
                          />
                          <span>
                            {readiness?.assigned
                              ? `Assigned room is ${readiness.status.replaceAll("_", " ")}. Check that it is ready before guest check-in.`
                              : "Assign a room and check that it is ready before guest check-in."}
                          </span>
                        </p>
                      )}
                    </div>
                  )}
                  {booking.preCheckin?.notes && (
                    <GuestNote
                      title="Arrival note"
                      text={booking.preCheckin.notes}
                    />
                  )}
                  {booking.specialRequest && (
                    <GuestNote
                      title="Booking special request"
                      text={booking.specialRequest}
                    />
                  )}
                  {openRequests.length > 0 && (
                    <div className="space-y-3 border-t border-amber-200/60 pt-3">
                      <h4 className={heading}>
                        Guest requests{" "}
                        <span className="text-[#8b96aa]">
                          ({openRequests.length})
                        </span>
                      </h4>
                      {requestList(openRequests)}
                    </div>
                  )}
                </section>
              ) : null}

              {/* 4. Payment Summary Card */}
              <section
                aria-labelledby="reservation-payment-heading"
                className="rounded-2xl border border-[#ede7dc] bg-white p-5 shadow-xs space-y-4"
              >
                <div className="flex items-center justify-between border-b border-[#f3efe8] pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#fbf5e8] text-[#c89b3c]">
                      <CreditCard className="h-4 w-4" />
                    </span>
                    <h3 id="reservation-payment-heading" className={heading}>
                      Payment summary
                    </h3>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold border ${
                      balance > 0
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : booking.paymentStatus === "paid" ||
                            booking.paymentStatus === "paid_at_property"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-slate-200 bg-slate-100 text-slate-700"
                    }`}
                  >
                    {balance > 0
                      ? `${formatPaise(balance)} due`
                      : booking.paymentStatus === "paid" ||
                          booking.paymentStatus === "paid_at_property"
                        ? "Paid"
                        : booking.paymentStatus.replaceAll("_", " ")}
                  </span>
                </div>

                <dl className="space-y-2 rounded-xl border border-[#f0ece4] bg-[#fdfdfc] p-3.5 text-xs">
                  <Amount
                    label="Booking total"
                    value={booking.effectiveTotalPaise ?? booking.totalPaise}
                  />
                  <Amount label="Collected" value={booking.paidPaise} />
                  {(booking.refundDuePaise ?? 0) > 0 && (
                    <Amount
                      label="Refund pending"
                      value={booking.refundDuePaise!}
                    />
                  )}
                  {(booking.refundedPaise ?? 0) > 0 && (
                    <Amount label="Refunded" value={booking.refundedPaise!} />
                  )}
                </dl>
                {supplemental.paidPaise > 0 && (
                  <p className="text-[11px] font-medium text-[#68758c]">
                    Extras paid separately:{" "}
                    <strong className="text-[#061224]">
                      {formatPaise(supplemental.paidPaise)}
                    </strong>
                    {supplemental.refundDuePaise > 0
                      ? ` · Refund pending: ${formatPaise(supplemental.refundDuePaise)}`
                      : ""}
                    {supplemental.refundedPaise > 0
                      ? ` · Refunded: ${formatPaise(supplemental.refundedPaise)}`
                      : ""}
                    . These retain their own receipts.
                  </p>
                )}
                <details
                  ref={paymentDetails}
                  className="group border-t border-[#f3efe8] pt-3"
                >
                  <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-xs font-bold text-[#061224]">
                    <span className="flex items-center gap-1.5">
                      <Receipt size={14} className="text-[#c89b3c]" />
                      Payment details
                    </span>
                    <ChevronDown
                      size={14}
                      className="text-[#8b96aa] transition-transform duration-200 group-open:rotate-180"
                    />
                  </summary>
                  <div className="space-y-4 pt-3">
                    <button
                      className={button}
                      onClick={() => setReceiptOpen(true)}
                    >
                      <Receipt size={14} className="text-[#c89b3c]" />
                      <span>View / print receipt</span>
                    </button>
                    {sections.paymentForm}
                    {sections.paymentRecords}
                  </div>
                </details>
              </section>

              {otherRequests.length > 0 && (
                <details className="rounded-2xl border border-[#ede7dc] bg-white p-5 shadow-xs group">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-xs font-bold uppercase tracking-[0.06em] text-[#061224]">
                    <span>
                      {active ? "Closed guest requests" : "Guest requests"} (
                      {otherRequests.length})
                    </span>
                    <ChevronDown
                      size={14}
                      className="text-[#8b96aa] transition-transform duration-200 group-open:rotate-180"
                    />
                  </summary>
                  <div className="pt-3 border-t border-[#f3efe8] mt-3">
                    {requestList(otherRequests)}
                  </div>
                </details>
              )}

              {/* 5. Notes, Amendments, and Feedback */}
              {sections.notes}
              {sections.feedback}
            </div>
          )}
        />
      )}
      {receiptOpen && booking && (
        <BookingReceiptModal
          booking={booking}
          onClose={() => setReceiptOpen(false)}
        />
      )}
    </Drawer>
  );
}

function Detail({
  label,
  children,
  icon: Icon,
}: {
  label: string;
  children: ReactNode;
  icon?: typeof BedDouble;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[#f0ece4] bg-[#fdfdfc] p-3.5">
      <dt className="text-[11px] font-semibold text-[#8b96aa]">{label}</dt>
      <dd className="mt-1 flex items-center gap-1.5 break-words text-sm font-bold text-[#061224]">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-[#c89b3c]" />}
        <span>{children}</span>
      </dd>
    </div>
  );
}

function Amount({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <dt className="font-semibold text-[#68758c]">{label}</dt>
      <dd className="font-bold text-[#061224]">{formatPaise(value)}</dd>
    </div>
  );
}

function GuestNote({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-amber-200/60 bg-amber-50/60 p-3">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-amber-900">
        {title}
      </h4>
      <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-[#061224]">
        {text}
      </p>
    </div>
  );
}

function GuestContactDetails({
  leadGuest,
  guestNames,
}: {
  leadGuest?: { name?: string; phone?: string; email?: string } | null;
  guestNames?: string[];
}) {
  const [open, setOpen] = useState(false);
  const hasPhone = Boolean(leadGuest?.phone);
  const hasDetails = Boolean(leadGuest?.phone || leadGuest?.email || guestNames?.length);

  if (!hasPhone && !hasDetails) return null;

  return (
    <div className="mt-4 border-t border-[#f3efe8] pt-3.5 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {hasPhone && (
          <a
            href={`tel:${leadGuest?.phone}`}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-[#ede7dc] bg-[#fdfdfc] px-3.5 py-1.5 text-xs font-bold text-[#061224] shadow-2xs hover:border-[#c89b3c] hover:bg-[#fbf5e8] active:scale-[0.99] transition-all"
          >
            <Phone size={13} className="text-[#c89b3c]" />
            <span>Call guest</span>
          </a>
        )}
        {hasDetails && (
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-bold transition-all shadow-2xs active:scale-[0.99] ${
              open
                ? "border-[#c89b3c] bg-[#fbf5e8] text-[#8a7044]"
                : "border-[#ede7dc] bg-[#fdfdfc] text-[#4d5870] hover:border-[#c89b3c] hover:bg-[#fbf5e8] hover:text-[#061224]"
            }`}
          >
            <Mail size={13} className={open ? "text-[#c89b3c]" : "text-[#8b96aa]"} />
            <span>Contact details</span>
            <ChevronDown
              size={13}
              className={`transition-transform duration-200 ${
                open ? "rotate-180 text-[#8a7044]" : "text-[#8b96aa]"
              }`}
            />
          </button>
        )}
      </div>

      {open && (
        <div className="w-full rounded-xl border border-[#ede7dc] bg-[#fafaf8] p-3 text-xs space-y-2 shadow-2xs">
          {leadGuest?.phone && (
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[#68758c]">
                <Phone size={12} className="text-[#8b96aa] shrink-0" />
                <span className="font-medium">Phone</span>
              </span>
              <a
                href={`tel:${leadGuest.phone}`}
                className="font-semibold text-[#061224] hover:text-[#c89b3c] hover:underline"
              >
                {leadGuest.phone}
              </a>
            </div>
          )}
          {leadGuest?.email && (
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[#68758c]">
                <Mail size={12} className="text-[#8b96aa] shrink-0" />
                <span className="font-medium">Email</span>
              </span>
              <a
                href={`mailto:${leadGuest.email}`}
                className="break-all font-semibold text-[#061224] hover:text-[#c89b3c] hover:underline text-right"
              >
                {leadGuest.email}
              </a>
            </div>
          )}
          {!!guestNames?.length && (
            <div className="pt-2 border-t border-[#ede7dc] flex items-start gap-2 text-[#68758c]">
              <User2 size={12} className="text-[#8b96aa] mt-0.5 shrink-0" />
              <div>
                <span className="font-medium">Guests: </span>
                <strong className="text-[#061224]">
                  {guestNames.join(", ")}
                </strong>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
