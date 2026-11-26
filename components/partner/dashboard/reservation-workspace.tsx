"use client";

import { BookingPaymentSummary } from "@/components/booking/payment-summary";
import { paymentSummary } from "@/lib/stay/payment-summary";

import { BookingFinanceSection } from "@/components/booking-finance/booking-finance-section";
import { ServiceMoveApprovals } from "./service-move-approvals";
import { ReservationStayChanges } from "./reservation-stay-changes";
import { ReservationFolio } from "./reservation-folio";
import { ReservationGuests } from "./reservation-guests";

import {
  useId,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  MessageSquare,
  Phone,
  Receipt,
  User2,
} from "lucide-react";
import type { ActionEligibility } from "@/lib/partner/reservations/eligibility";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { formatPaise as formatCurrency } from "@/lib/currency";
const formatPaise = (value: number) =>
  formatCurrency(value, { withFractions: true });
import { StayRequestList } from "@/components/stay/stay-request-list";
import { BookingReceiptModal } from "@/components/trips/booking-receipt-modal";
import { supplementalFinancials } from "@/lib/stay/agreements";
import { requestGroup } from "@/lib/stay/workspace";
import type { StayBookingData } from "@/lib/stay/contracts";
import { ReservationOperations } from "./reservation-operations";
import { Drawer } from "./drawer";
import { useSearchParams } from "next/navigation";
import {
  useReservationNavigationGuard,
  workspaceSection,
  workspaceSections,
  type WorkspaceTab,
} from "./reservation-navigation";

type Reservation = Partial<StayBookingData> &
  import("@/components/trips/booking-receipt-modal").BookingReceiptData & {
    propertyId: string;
    source?: string;
    roomTypeId?: string | null;
    specialRequest?: string;
    timezone?: string;
    startAt?: string;
    endAt?: string;
    physicalUnitLabel?: string | null;
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
  const queryClient = useQueryClient();
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
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get("section");
  const focusedSection = workspaceSection(sectionParam);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => focusedSection);
  const [syncedSection, setSyncedSection] = useState(sectionParam);

  // Adjust the active tab during render when history navigation changes the URL.
  if (sectionParam !== syncedSection) {
    setSyncedSection(sectionParam);
    if (sectionParam) setActiveTab(workspaceSection(sectionParam));
  }

  const setTab = useCallback((tab: WorkspaceTab) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("section", tab);
    window.history.replaceState(null, "", url);
  }, []);
  const dirty = Object.values(drafts).some((d) => d.dirty);
  const saving = Object.values(drafts).some((d) => d.busy);
  const draftsRef = useRef(drafts);
  const reportDraft = useCallback(
    (section: string, changed: boolean, busy = false) => {
      const old = draftsRef.current;
      if (old[section]?.dirty === changed && old[section]?.busy === busy)
        return;
      const next = { ...old, [section]: { dirty: changed, busy } };
      // Closing can race React's next render while a request starts.
      draftsRef.current = next;
      setDrafts(next);
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
        actionEligibility?: Record<string, ActionEligibility>;
        operationalPolicies?: import("@/lib/partner/reservations/operational-policies").OperationalPolicies;
        readiness?: { assigned: boolean; status: string };
        cancellationPreview?: {
          onlineRefundPaise: number;
          propertyReturnPaise: number;
          noShowOnlineRefundPaise?: number;
        };
      }>(
        `/api/partner/bookings/${encodeURIComponent(bookingId!)}?propertyId=${encodeURIComponent(propertyId)}`,
        { signal },
      ),
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const booking =
    query.data?.booking.propertyId === propertyId
      ? query.data.booking
      : undefined;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["partner", propertyId] });
    void queryClient.invalidateQueries({
      queryKey: ["partner", propertyId, "registration", bookingId],
    });
    void query.refetch();
    onChanged();
  };
  const lifecycleRequest = useRef<{
    status: string;
    idempotencyKey: string;
    expectedEligibilityVersion?: string;
  } | null>(null);
  function openConfirmation(status: string) {
    lifecycleRequest.current = {
      status,
      idempotencyKey: crypto.randomUUID(),
      expectedEligibilityVersion:
        query.data?.actionEligibility?.[status]?.eligibilityVersion,
    };
    setConfirm(status);
  }
  const mutation = useMutation({
    mutationFn: (status: string) =>
      apiFetch(
        `/api/partner/bookings/${encodeURIComponent(bookingId!)}/status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            lifecycleRequest.current?.status === status
              ? lifecycleRequest.current
              : { status },
          ),
        },
      ),
    onError: (error) => {
      if (
        error instanceof ApiClientError &&
        [403, 409, 422].includes(error.status)
      ) {
        lifecycleRequest.current = null;
        setConfirm(null);
        refresh();
      }
    },
    onSuccess: () => {
      setConfirm(null);
      lifecycleRequest.current = null;
      refresh();
    },
  });
  const allowNavigation = useCallback(() => {
    const current = Object.values(draftsRef.current);
    if (mutation.isPending || current.some((d) => d.busy)) return false;
    if (!current.some((d) => d.dirty)) return true;
    const discard = window.confirm(
      "Discard unsaved reservation edits and leave this workspace?",
    );
    if (discard) draftsRef.current = {};
    return discard;
  }, [mutation.isPending]);
  useReservationNavigationGuard(!!bookingId, allowNavigation);
  useEffect(() => {
    if (!query.data) return;
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(`workspace-${focusedSection}`);
      element?.closest("details")?.setAttribute("open", "");
      element?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusedSection, bookingId, !!query.data]);
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
    const currentDrafts = Object.values(draftsRef.current);
    if (mutation.isPending || currentDrafts.some((draft) => draft.busy)) return;
    if (currentDrafts.some((draft) => draft.dirty)) setCloseWarning(true);
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
  const checkInUnavailable =
    !!primary && query.data?.actionEligibility?.[primary]?.allowed !== true;
  const secondaryActions =
    status === "confirmed"
      ? [
          ["no_show", "Mark no-show"],
          ["cancelled", "Cancel reservation"],
        ]
      : status === "pending_payment"
        ? [["cancelled", "Cancel reservation"]]
        : [];
  const secondary = secondaryActions.filter(
    ([value]) =>
      query.data?.actionEligibility?.[value]?.blockers?.[0]?.category !==
      "permission",
  );
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
    setTab("payments");
    requestAnimationFrame(() => {
      if (paymentDetails.current) {
        paymentDetails.current.open = true;
        paymentDetails.current
          .querySelector<HTMLElement>("summary")
          ?.focus({ preventScroll: true });
      }
    });
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
                  <button
                    className={button}
                    onClick={() => {
                      draftsRef.current = {};
                      onClose();
                    }}
                  >
                    Discard changes and close
                  </button>
                </div>
              </div>
            ) : (
              <>
                {primary && (
                  <EligibilityMessages
                    eligibility={query.data?.actionEligibility?.[primary]}
                    propertyId={propertyId}
                    onSelectTab={setTab}
                  />
                )}
                {mutation.error instanceof ApiClientError &&
                  mutation.error.eligibility && (
                    <EligibilityMessages
                      eligibility={mutation.error.eligibility}
                      propertyId={propertyId}
                      onSelectTab={setTab}
                    />
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
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* Left: Quick balance status */}
                    {balance > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-900">
                          <AlertCircle size={12} className="text-amber-700" />
                          <span>{formatPaise(balance)} due</span>
                        </span>
                        <button
                          type="button"
                          className="rounded-lg border border-amber-300 bg-amber-100/70 px-2.5 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-200 transition cursor-pointer"
                          onClick={openPaymentDetails}
                        >
                          Collect
                        </button>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-800 border border-emerald-200/60">
                        Paid in full
                      </span>
                    )}

                    <div className="flex items-center gap-2 ml-auto">
                      {primary &&
                        query.data?.actionEligibility?.[primary]?.blockers?.[0]
                          ?.category !== "permission" && (
                          <button
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#061224] px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#0c1f3b] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            disabled={
                              mutation.isPending || saving || checkInUnavailable
                            }
                            aria-describedby={
                              checkInUnavailable
                                ? "lifecycle-availability"
                                : undefined
                            }
                            onClick={() => {
                              openConfirmation(primary);
                              mutation.reset();
                            }}
                          >
                            {primary === "checked_in" ? (
                              <LogIn size={15} />
                            ) : (
                              <LogOut size={15} />
                            )}
                            <span>
                              {primary === "checked_in"
                                ? "Check in"
                                : "Check out"}
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
                                  query.data?.actionEligibility?.[value]
                                    ?.allowed !== true
                                }
                                onClick={() => {
                                  openConfirmation(value);
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
                  </div>
                )}
                {mutation.isError && (
                  <p
                    role="alert"
                    className="text-xs font-semibold text-rose-700"
                  >
                    {mutation.error.message}{" "}
                    {confirm &&
                      "Retry confirms the same request key; it will recover a committed result without repeating the action."}
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
          collectionEligibility={query.data?.actionEligibility?.collect}
          booking={booking}
          propertyId={propertyId}
          onChanged={refresh}
          onDraftChange={reportDraft}
          render={(sections) => {
            const tabList = [
              {
                id: "overview" as const,
                label: "Overview",
                icon: CalendarDays,
              },
              ...(sections.billingRead
                ? [{ id: "billing" as const, label: "Billing", icon: Receipt }]
                : []),
              { id: "payments" as const, label: "Payments", icon: CreditCard },
              { id: "guests" as const, label: "Guests", icon: User2 },
              { id: "activity" as const, label: "Activity", icon: Clock },
            ];

            return (
              <div className="space-y-4 pb-3 text-xs text-[#061224]">
                {/* 1. Guest Profile Hero Card (Persistent across all tabs) */}
                <div id="workspace-summary" tabIndex={-1} />
                <section
                  aria-label="Guest"
                  className="rounded-2xl border border-[#ede7dc] bg-white p-4 sm:p-5 shadow-xs transition-shadow"
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

                {/* Error Banner if live details failed */}
                {query.isError && (
                  <p
                    role="alert"
                    className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800"
                  >
                    The latest reservation details could not load. Your edits
                    have been kept.{" "}
                    <button
                      className="font-bold underline"
                      onClick={() => void query.refetch()}
                    >
                      Retry refresh
                    </button>
                  </p>
                )}

                {/* 2. Modern 5-Tab Segmented Navigation */}
                <nav
                  aria-label="Reservation sections"
                  className="flex flex-wrap items-center gap-1.5 border-b border-slate-200/80 pb-2"
                >
                  {tabList.map(({ id, label, icon: TabIcon }) => {
                    const isSelected = activeTab === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-label={id}
                        aria-current={isSelected ? "page" : undefined}
                        onClick={() => setTab(id as WorkspaceTab)}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[#061224] text-white shadow-xs"
                            : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                        }`}
                      >
                        <TabIcon
                          size={14}
                          className={
                            isSelected ? "text-[#c89b3c]" : "text-slate-400"
                          }
                        />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </nav>

                {/* TAB 1: OVERVIEW */}
                {activeTab === "overview" && (
                  <div className="space-y-4">
                    {/* Stay & Room Card */}
                    <section
                      aria-labelledby="reservation-stay-heading"
                      className="rounded-2xl border border-[#ede7dc] bg-white p-4 sm:p-5 shadow-xs space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f3efe8] pb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#fbf5e8] text-[#c89b3c]">
                            <CalendarDays className="h-4 w-4" />
                          </span>
                          <h3 id="reservation-stay-heading" className={heading}>
                            Stay & room details
                          </h3>
                        </div>
                        <span className="rounded-md bg-[#f4f2ee] px-2 py-0.5 text-[10px] font-bold text-[#68758c]">
                          {booking.timezone === "Asia/Kolkata"
                            ? "Hotel time · IST"
                            : `Hotel time · ${booking.timezone || "Asia/Kolkata"}`}
                        </span>
                      </div>

                      <dl className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                        <Detail label="Booked check-in">
                          {booking.startAt
                            ? local(booking.startAt)
                            : booking.checkIn}
                        </Detail>
                        <Detail label="Booked check-out">
                          {booking.endAt
                            ? local(booking.endAt)
                            : booking.checkOut}
                        </Detail>
                        <Detail label="Room category" icon={BedDouble}>
                          {booking.roomName}
                        </Detail>
                        <Detail label="Stay duration" icon={Clock}>
                          {booking.bookingMode === "hourly"
                            ? `${Math.round(((booking.durationMinutes ?? 0) / 60) * 10) / 10} hours`
                            : `${booking.nights ?? 1} ${(booking.nights ?? 1) === 1 ? "night" : "nights"}`}
                        </Detail>
                      </dl>

                      {/* Arrival Status */}
                      <div className="rounded-xl border border-slate-200/80 bg-[#fbfbf9] p-3.5">
                        <div className="flex items-start gap-2.5">
                          <span className="grid h-7 w-7 place-items-center rounded-lg bg-white border border-slate-200/60 text-slate-500 shrink-0">
                            <Clock className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-[#061224]">
                              {booking.preCheckin?.arrivalChoice === "unknown"
                                ? "Arrival time: Not specified"
                                : booking.preCheckin?.expectedArrivalAt
                                  ? `Expected arrival: ${local(booking.preCheckin.expectedArrivalAt)}`
                                  : "Arrival time not provided"}
                            </p>
                            <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                              {booking.preCheckin?.status === "submitted"
                                ? "Online pre-check-in completed"
                                : "Desk check-in"}{" "}
                              ·{" "}
                              {status === "checked_in"
                                ? "Guest checked in at property"
                                : status === "checked_out"
                                  ? "Guest checked out"
                                  : "Check-in pending"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </section>

                    {bookingId && <ServiceMoveApprovals bookingId={bookingId} />}
                    {/* 2. Room Assignment (Before check-in) OR In-House Stay Changes (In-house) as its own separate section */}
                    <div id="workspace-assignment" tabIndex={-1} />
                    {status !== "checked_in" ? (
                      sections.assignment
                    ) : (
                      <ReservationStayChanges
                        key={booking.id}
                        bookingId={booking.id}
                        propertyId={propertyId}
                        currentRoom={booking.physicalUnitLabel}
                        currentCategory={booking.roomName}
                        onChanged={refresh}
                        onDraftChange={reportDraft}
                      />
                    )}

                    {/* Needs Attention Alert Card */}
                    {needsAttention ? (
                      <section
                        aria-labelledby="reservation-attention-heading"
                        className="rounded-2xl border border-amber-200/90 bg-[#fefdfa] p-4 sm:p-5 shadow-xs space-y-3.5"
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
                                <div>
                                  <p className="text-xs font-bold text-amber-950">
                                    Balance due · {formatPaise(balance)}
                                  </p>
                                  <p className="text-[11px] text-amber-800">
                                    Payment collection pending before checkout
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  className="inline-flex min-h-9 items-center justify-center rounded-xl bg-[#061224] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#0c1f3b] transition"
                                  onClick={openPaymentDetails}
                                >
                                  Collect payment
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
                                    ? `Assigned room is ${readiness.status.replaceAll("_", " ")}. Ensure room is clean and ready.`
                                    : "Assign a room and verify cleanliness before check-in."}
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
                            title="Special request"
                            text={booking.specialRequest}
                          />
                        )}
                        {openRequests.length > 0 && (
                          <div className="space-y-3 border-t border-amber-200/60 pt-3">
                            <h4 className={heading}>
                              Guest requests ({openRequests.length})
                            </h4>
                            <div id="workspace-requests" tabIndex={-1} />
                            {requestList(openRequests)}
                          </div>
                        )}
                      </section>
                    ) : null}

                    {/* Completed Requests */}
                    {otherRequests.length > 0 && (
                      <details className="rounded-2xl border border-[#ede7dc] bg-white p-4 sm:p-5 shadow-xs group">
                        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-xs font-bold uppercase tracking-[0.06em] text-[#061224]">
                          <span>
                            {active
                              ? "Closed guest requests"
                              : "Guest requests"}{" "}
                            ({otherRequests.length})
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
                  </div>
                )}

                {/* TAB 2: BILLING & FOLIO */}
                {activeTab === "billing" && (
                  <div className="space-y-4">
                    <div id="workspace-billing" tabIndex={-1} />
                    <BookingFinanceSection bookingId={booking.id} audience="partner" revision={`${booking.totalPaise}:${booking.paidPaise}:${booking.bookingStatus}:${booking.stayRevision}`} />
                    {sections.billingRead ? (
                      <ReservationFolio
                        bookingId={booking.id}
                        propertyId={propertyId}
                        onChanged={refresh}
                        onDraftChange={reportDraft}
                      />
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
                        You do not have permission to view billing statements.
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: PAYMENTS */}
                {activeTab === "payments" && (
                  <div className="space-y-4 pb-28">
                    {/* Payment Summary Card */}
                    <section
                      aria-labelledby="reservation-payment-heading"
                      className="rounded-2xl border border-[#ede7dc] bg-white p-4 sm:p-5 shadow-xs space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f3efe8] pb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#fbf5e8] text-[#c89b3c]">
                            <CreditCard className="h-4 w-4" />
                          </span>
                          <div>
                            <h3
                              id="reservation-payment-heading"
                              className={heading}
                            >
                              Payment summary
                            </h3>
                            <p className="text-[11px] text-[#8b96aa]">
                              Live collection balance & receipts
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#ede7dc] bg-[#fbf5e8]/50 px-2.5 py-1 text-xs font-semibold text-[#061224] hover:bg-[#fbf5e8] transition-colors"
                            onClick={() => setReceiptOpen(true)}
                          >
                            <Receipt size={13} className="text-[#c89b3c]" />
                            <span>View / print receipt</span>
                          </button>
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
                              ? `${formatPaise(balance)} balance due`
                              : booking.paymentStatus === "paid" ||
                                  booking.paymentStatus === "paid_at_property"
                                ? "Paid in full"
                                : booking.paymentStatus.replaceAll("_", " ")}
                          </span>
                        </div>
                      </div>

                      {/* 3 Metric Stat Grid */}
                      <BookingPaymentSummary summary={booking.paymentSummary ?? paymentSummary(booking)} currency={booking.currency} />
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-xl border border-[#f0ece4] bg-[#fdfdfc] p-3.5">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8b96aa]">
                            Room booking
                          </span>
                          <p className="mt-1 text-lg font-bold text-[#061224]">
                            {formatPaise(
                              booking.effectiveTotalPaise ?? booking.totalPaise
                            )}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#8b96aa]">
                            Original room agreement
                          </p>
                        </div>
                        <div className="rounded-xl border border-[#f0ece4] bg-[#fdfdfc] p-3.5">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8b96aa]">
                            Room payment collected
                          </span>
                          <p className="mt-1 text-lg font-bold text-emerald-700">
                            {formatPaise(booking.paidPaise)}
                          </p>
                          {(booking.refundedPaise ?? 0) > 0 ? (
                            <p className="mt-0.5 text-[11px] text-[#8b96aa]">
                              <span>Refunded</span>: {formatPaise(booking.refundedPaise!)}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-[11px] text-[#8b96aa]">
                              Recorded collections
                            </p>
                          )}
                        </div>
                        <div
                          className={`rounded-xl border p-3.5 ${
                            balance > 0
                              ? "border-amber-200 bg-amber-50/50"
                              : (booking.refundDuePaise ?? 0) > 0
                                ? "border-amber-200 bg-amber-50/50"
                                : "border-emerald-200 bg-emerald-50/40"
                          }`}
                        >
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8b96aa]">
                            {balance > 0
                              ? "Balance Due"
                              : (booking.refundDuePaise ?? 0) > 0
                                ? "Refund Pending"
                                : "Settlement"}
                          </span>
                          <p
                            className={`mt-1 text-lg font-bold ${
                              balance > 0
                                ? "text-[#061224]"
                                : (booking.refundDuePaise ?? 0) > 0
                                  ? "text-amber-800"
                                  : "text-emerald-700"
                            }`}
                          >
                            {balance > 0
                              ? formatPaise(balance)
                              : (booking.refundDuePaise ?? 0) > 0
                                ? formatPaise(booking.refundDuePaise!)
                                : "Settled in full"}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#8b96aa]">
                            {balance > 0
                              ? "Outstanding from guest"
                              : (booking.refundDuePaise ?? 0) > 0
                                ? "Awaiting disbursement"
                                : "All payments cleared"}
                          </p>
                        </div>
                      </div>

                      {supplemental.paidPaise > 0 && (
                        <p className="text-[11px] font-medium text-[#68758c]">
                          Extras paid separately:{" "}
                          <strong className="text-[#061224]">
                            {formatPaise(supplemental.paidPaise)}
                          </strong>
                          {supplemental.refundDuePaise > 0
                            ? ` · Refund pending: ${formatPaise(
                                supplemental.refundDuePaise
                              )}`
                            : ""}
                          {supplemental.refundedPaise > 0
                            ? ` · Refunded: ${formatPaise(
                                supplemental.refundedPaise
                              )}`
                            : ""}
                        </p>
                      )}
                    </section>

                    {/* Collection & Refund Form and Records */}
                    <div id="workspace-payments" tabIndex={-1} />
                    <details
                      ref={paymentDetails}
                      open
                      className="group rounded-2xl border border-[#ede7dc] bg-white p-4 sm:p-5 shadow-xs space-y-4"
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
                        {sections.paymentForm}
                        {sections.paymentRecords}
                      </div>
                    </details>
                  </div>
                )}

                {/* TAB 4: GUESTS & REGISTRATION */}
                {activeTab === "guests" && (
                  <div className="space-y-4 pb-28">
                    <div id="workspace-guests" tabIndex={-1} />
                    <ReservationGuests
                      bookingId={booking.id}
                      propertyId={propertyId}
                      onChanged={refresh}
                      onDraftChange={reportDraft}
                    />
                  </div>
                )}

                {/* TAB 5: ACTIVITY LOG & STAFF NOTES */}
                {activeTab === "activity" && (
                  <div className="space-y-4 pb-28">
                    <div id="workspace-activity" tabIndex={-1} />
                    {sections.notes}
                    {sections.feedback}
                  </div>
                )}
              </div>
            );
          }}
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
      <dd className="mt-1 flex min-w-0 items-center gap-1.5 break-words [overflow-wrap:anywhere] text-sm font-bold text-[#061224]">
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
  const hasDetails = Boolean(
    leadGuest?.phone || leadGuest?.email || guestNames?.length,
  );

  if (!hasPhone && !hasDetails) return null;

  return (
    <div className="mt-4 border-t border-[#f3efe8] pt-3.5 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {hasPhone && (
          <>
            <a
              href={`tel:${leadGuest?.phone}`}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-[#ede7dc] bg-[#fdfdfc] px-3.5 py-1.5 text-xs font-bold text-[#061224] shadow-2xs hover:border-[#c89b3c] hover:bg-[#fbf5e8] active:scale-[0.99] transition-all"
            >
              <Phone size={13} className="text-[#c89b3c]" />
              <span>Call guest</span>
            </a>
            {(() => {
              const digits = (leadGuest?.phone || "").replace(/\D/g, "");
              if (digits.length < 10) return null;
              const waNumber = digits.length === 10 ? `91${digits}` : digits;
              return (
                <a
                  href={`https://wa.me/${waNumber}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3.5 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs hover:border-emerald-300 hover:bg-emerald-100/70 active:scale-[0.99] transition-all"
                >
                  <MessageSquare size={13} className="text-emerald-700" />
                  <span>WhatsApp</span>
                </a>
              );
            })()}
          </>
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
            <Mail
              size={13}
              className={open ? "text-[#c89b3c]" : "text-[#8b96aa]"}
            />
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
            <div className="flex flex-wrap items-center justify-between gap-3">
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
            <div className="flex flex-wrap items-center justify-between gap-3">
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

function EligibilityMessages({
  eligibility,
  propertyId,
  onSelectTab,
}: {
  eligibility?: ActionEligibility;
  propertyId: string;
  onSelectTab?: (tab: WorkspaceTab) => void;
}) {
  if (!eligibility?.blockers?.length) return null;
  return (
    <ul
      id="lifecycle-availability"
      className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3"
      aria-label="Action blockers"
    >
      {eligibility.blockers.map((blocker) => (
        <li key={blocker.code} className="text-xs text-amber-950">
          {blocker.message}
          {blocker.resolution && (
            <>
              {" "}
              <a
                className="font-bold underline"
                href={
                  blocker.resolution === "settings"
                    ? `/partner/settings?propertyId=${encodeURIComponent(propertyId)}`
                    : blocker.resolution === "housekeeping"
                      ? `/partner/rooms?section=housekeeping&propertyId=${encodeURIComponent(propertyId)}`
                      : `#workspace-${blocker.resolution}`
                }
                onClick={(e) => {
                  if (
                    ["guests", "assignment", "payments"].includes(
                      blocker.resolution!,
                    )
                  ) {
                    e.preventDefault();
                    if (blocker.resolution === "guests")
                      onSelectTab?.("guests");
                    else if (blocker.resolution === "payments")
                      onSelectTab?.("payments");
                    else onSelectTab?.("overview");
                    const target = document.getElementById(
                      `workspace-${blocker.resolution}`,
                    );
                    target?.closest("details")?.setAttribute("open", "");
                    target?.focus({ preventScroll: true });
                  }
                }}
              >
                Review {blocker.resolution}
              </a>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
