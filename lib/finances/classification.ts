import { assess, hash, iso } from "../accounting/domain";
import { eligible, summary } from "../accounting/posting";
import { duesPosition } from "../dues/domain";
import { bookingPosition, type Evidence } from "../payouts/domain";
import type { Assessment } from "../payouts/deductions";
import type { RecordData } from "../partner/dashboard/domain";

export type FinanceStage =
  | "ready_for_payment"
  | "prepared_payout"
  | "paid_out"
  | "dues_outstanding"
  | "dues_cleared"
  | "awaiting_checkout"
  | "awaiting_waiting_period"
  | "awaiting_deduction_review"
  | "awaiting_evidence_review"
  | "processing"
  | "historical"
  | "settled_zero";

export type AwaitingClearanceCategory =
  | "checkout"
  | "waiting_period"
  | "deduction_review"
  | "evidence_review";

export type FinanceFilterGroup =
  | "ready"
  | "awaiting"
  | "dues"
  | "prepared"
  | "paid"
  | "historical";

export type FinanceDirection =
  | "payable"
  | "dues"
  | "settled"
  | "pending"
  | "excluded";

export type OwnerBookingAmounts = {
  onlineCollectedPaise: number;
  hotelCollectedPaise: number;
  commissionPaise: number | null;
  grossPayablePaise: number | null;
  deductionsPaise: number | null;
  finalPayablePaise: number | null;
  duesPaise: number | null;
  guestOutstandingPaise: number | null;
  pendingOnlinePaise: number;
  pendingHotelPaise: number;
  reviewOnlinePaise: number;
  reviewHotelPaise: number;
};

export type ClassifiedBookingFinance = {
  bookingId: string;
  propertyId: string;
  reference: string;
  bookingStatus: string | null;
  relevantDate: string;
  sortAt: string;
  checkoutAt: string | null;
  eligibleAt: string | null;
  waitingPeriodPending: boolean;
  firstDuesRecordedAt: string | null;
  stage: FinanceStage;
  filterGroup: FinanceFilterGroup;
  direction: FinanceDirection;
  awaitingClearanceCategory: AwaitingClearanceCategory | null;
  awaitingClearanceAmountPaise: number | null;
  beforeUnassessedDeductions: boolean;
  readyForPaymentPaise: number;
  reservedPaise: number;
  duesPaise: number;
  payoutId: string | null;
  payoutReference: string | null;
  includedInAccounting: boolean;
  isProcessing: boolean;
  isStaleOrInvalid: boolean;
  amounts: OwnerBookingAmounts;
  ownerSummary: string;
  pendingReasons: string[];
};

export function toHotelLocalDate(
  isoTimestamp: string | null | undefined,
  timezone: string,
): string | null {
  if (!isoTimestamp || !Number.isFinite(Date.parse(isoTimestamp))) return null;
  const zone = timezone || "Asia/Kolkata";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(isoTimestamp));
    const get = (k: string) => parts.find((p) => p.type === k)?.value;
    const y = get("year"),
      m = get("month"),
      d = get("day");
    return y && m && d ? `${y}-${m}-${d}` : null;
  } catch {
    return isoTimestamp.slice(0, 10);
  }
}

function ownerReason(reason: string): string {
  if (/waiting period/i.test(reason))
    return "Waiting period after checkout has not finished yet.";
  if (/deduction/i.test(reason))
    return "Helpkey is reviewing final settlement deductions.";
  if (/Completed, reconciled checkout is required/i.test(reason))
    return "Stay must finish checkout before settlement is finalized.";
  if (/Accounting processing is pending|needs another processing attempt/i.test(reason))
    return "Accounting update is still processing.";
  if (/Cached summary differs|Journal summary differs|Recognition differs/i.test(reason))
    return "Settlement totals are being refreshed from the ledger.";
  if (/refund/i.test(reason))
    return "A guest refund requires settlement review.";
  if (/Cancellation, no-show|failed-booking/i.test(reason))
    return "Cancellation or no-show treatment is under review.";
  if (/guest payment is still being confirmed|reconciliation/i.test(reason))
    return "A guest payment is still being confirmed.";
  if (/Historical/i.test(reason))
    return "Historical booking from before current accounting enrollment.";
  if (/Invalid journal|cannot be reliably assessed|cannot be verified/i.test(reason))
    return "Financial records are under review by Helpkey.";
  if (/exceed/i.test(reason))
    return "Recorded dues payments require reconciliation review.";
  if (/Debit hotel payable/i.test(reason))
    return "Recorded payout balance requires reconciliation review.";
  if (/agreement unavailable/i.test(reason))
    return "Saved commercial agreement is unavailable and requires review.";
  return "Under settlement review by Helpkey.";
}

function uniqueOwnerReasons(reasons: string[]): string[] {
  return [...new Set(reasons.map(ownerReason))];
}

function sumOnlineCollections(evidence: Evidence): number {
  return -evidence.journal
    .filter((j) => ["capture", "online_refund"].includes(j.type))
    .reduce(
      (n, j) =>
        n +
        j.lines
          .filter((l) => l.account === "pending_online")
          .reduce((v, l) => v + l.debitPaise - l.creditPaise, 0),
      0,
    );
}

function sumHotelCollections(evidence: Evidence): number {
  return evidence.journal
    .filter((j) =>
      ["hotel_collection", "hotel_refund", "hotel_reversal"].includes(j.type),
    )
    .reduce(
      (n, j) =>
        n +
        j.lines
          .filter((l) => l.account === "hotel_collection_clearing")
          .reduce((v, l) => v + l.debitPaise - l.creditPaise, 0),
      0,
    );
}

export function classifyBookingFinance(params: {
  bookingId: string;
  evidence: Evidence;
  assessment: Assessment | null;
  reservation: RecordData | null;
  payout?: { id: string; reference: string; status: string } | null;
  duesHistoryReasons?: string[];
  timezone?: string | null;
  now?: Date;
}): ClassifiedBookingFinance {
  const {
    bookingId,
    evidence,
    assessment,
    reservation,
    payout = null,
    duesHistoryReasons = [],
    timezone = "Asia/Kolkata",
    now = new Date(),
  } = params;
  const { booking: b, agreement, proof, sources, journal, state } = evidence;
  const propertyId = String(b?.propertyId ?? state.propertyId ?? "");
  const reference = String(
    b?.confirmationCode ?? b?.bookingReference ?? bookingId,
  );
  const tz = timezone || "Asia/Kolkata";

  const included = !!(b && eligible(b, state));
  let actual = summary([]);
  let invalidJournal = false;
  try {
    actual = summary(journal);
  } catch {
    invalidJournal = true;
  }

  const summaryMismatch =
    included && !!state.summary && hash(actual) !== hash(state.summary);
  const isProcessing = included && (!!state.dirty || !state.processedAt);
  const hasProcessingError = included && !!state.lastError;
  const isStaleOrInvalid =
    included &&
    (invalidJournal ||
      summaryMismatch ||
      hasProcessingError ||
      actual.payablePaise < 0 ||
      actual.duesPaise < 0 ||
      journal.some(
        (j) =>
          j.propertyId !== propertyId ||
          j.bookingId !== bookingId ||
          (b?.currency && j.currency !== b.currency),
      ));

  let expected: ReturnType<typeof assess> | null = null;
  if (b) {
    try {
      expected = assess(bookingId, b, agreement, proof, sources);
    } catch {
      expected = null;
    }
  }

  const payoutPos = b
    ? bookingPosition(bookingId, evidence, assessment, now)
    : null;
  const duesPos = duesPosition(bookingId, evidence, duesHistoryReasons);

  const onlineCollectedPaise = sumOnlineCollections(evidence);
  const hotelCollectedPaise = sumHotelCollections(evidence);
  const commissionPaise =
    payoutPos?.commissionPaise ?? expected?.commissionPaise ?? null;
  const guestOutstandingPaise =
    expected?.guestOutstandingPaise ??
    (typeof state.guestOutstandingPaise === "number"
      ? state.guestOutstandingPaise
      : null);

  const deductionsPaise =
    payoutPos && payoutPos.assessmentCurrent && payoutPos.deductionsPaise !== null
      ? payoutPos.deductionsPaise
      : null;
  const finalPayablePaise =
    !invalidJournal && deductionsPaise !== null
      ? Math.max(0, actual.payablePaise - deductionsPaise)
      : null;

  const amounts: OwnerBookingAmounts = {
    onlineCollectedPaise,
    hotelCollectedPaise,
    commissionPaise,
    grossPayablePaise: invalidJournal ? null : actual.payablePaise,
    deductionsPaise,
    finalPayablePaise,
    duesPaise: invalidJournal ? null : actual.duesPaise,
    guestOutstandingPaise,
    pendingOnlinePaise: invalidJournal ? 0 : actual.pendingOnlinePaise,
    pendingHotelPaise: invalidJournal ? 0 : actual.pendingHotelPaise,
    reviewOnlinePaise: invalidJournal ? 0 : actual.reviewOnlinePaise,
    reviewHotelPaise: invalidJournal ? 0 : actual.reviewHotelPaise,
  };

  const checkoutIso = iso(b?.actualCheckOutAt) ?? iso((proof as RecordData | null)?.createdAt);
  const createdIso = iso(b?.createdAt);
  const checkOutDate =
    typeof b?.checkOut === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.checkOut)
      ? b.checkOut
      : null;
  const checkInDate =
    typeof b?.checkIn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.checkIn)
      ? b.checkIn
      : null;

  const relevantDate =
    toHotelLocalDate(checkoutIso, tz) ??
    checkOutDate ??
    checkInDate ??
    toHotelLocalDate(createdIso, tz) ??
    toHotelLocalDate(now.toISOString(), tz) ??
    "1970-01-01";
  const sortAt =
    checkoutIso ??
    (checkOutDate ? `${checkOutDate}T12:00:00.000Z` : null) ??
    createdIso ??
    new Date(0).toISOString();

  const reserved = !!reservation && reservation.status === "reserved";
  const payoutRecorded =
    reservation?.status === "consumed" ||
    (journal.some((j) => j.type === "payout") &&
      actual.payablePaise === 0 &&
      actual.duesPaise === 0 &&
      !duesPos.reasons.length &&
      state.status === "recognized");

  const activePayoutId =
    (reserved || payoutRecorded
      ? (payout?.id ?? (typeof reservation?.payoutId === "string" ? reservation.payoutId : null))
      : null) ?? null;
  const activePayoutReference =
    payout?.reference ??
    (activePayoutId ? `HKP-${activePayoutId.slice(0, 16).toUpperCase()}` : null);

  let stage: FinanceStage;
  let filterGroup: FinanceFilterGroup;
  let direction: FinanceDirection;
  let awaitingClearanceCategory: AwaitingClearanceCategory | null = null;
  let awaitingClearanceAmountPaise: number | null = null;
  let beforeUnassessedDeductions = false;
  let readyForPaymentPaise = 0;
  let reservedPaise = 0;
  let duesPaise = 0;
  let ownerSummary = "";
  let pendingReasons: string[] = [];

  if (!included) {
    if (!invalidJournal && (duesPos.reasons.length > 0 && (actual.duesPaise > 0 || actual.payablePaise > 0))) {
      stage = "awaiting_evidence_review";
      filterGroup = "awaiting";
      direction = "pending";
      awaitingClearanceCategory = "evidence_review";
      awaitingClearanceAmountPaise =
        actual.reviewOnlinePaise +
        actual.reviewHotelPaise +
        Math.max(0, actual.payablePaise) +
        Math.max(0, actual.duesPaise);
      ownerSummary = "Requires accounting reconciliation before inclusion.";
      pendingReasons = uniqueOwnerReasons(duesPos.reasons);
    } else {
      stage = "historical";
      filterGroup = "historical";
      direction = "excluded";
      ownerSummary = "Historical booking excluded from current balances.";
      pendingReasons = [
        agreement
          ? "Historical booking requires explicit accounting enrollment if it needs settlement."
          : "Historical booking from before current finance tracking.",
      ];
    }
  } else if (isProcessing) {
    stage = "processing";
    filterGroup = "awaiting";
    direction = "pending";
    ownerSummary =
      "Recent booking changes are processing. Totals exclude this booking until processing finishes.";
    pendingReasons = ["Accounting update is in progress."];
  } else if (isStaleOrInvalid) {
    stage = "awaiting_evidence_review";
    filterGroup = "awaiting";
    direction = "pending";
    awaitingClearanceCategory = "evidence_review";
    awaitingClearanceAmountPaise = invalidJournal
      ? null
      : actual.reviewOnlinePaise +
        actual.reviewHotelPaise +
        actual.pendingOnlinePaise +
        actual.pendingHotelPaise +
        Math.max(0, actual.payablePaise) +
        Math.max(0, actual.duesPaise);
    ownerSummary =
      "Booking balances are excluded from verified availability while Helpkey reconciles an update.";
    pendingReasons = uniqueOwnerReasons([
      ...(hasProcessingError ? ["Accounting needs another processing attempt."] : []),
      ...(summaryMismatch ? ["Journal summary differs; reconcile accounting."] : []),
      ...(invalidJournal ? ["Invalid journal entries."] : []),
      ...(payoutPos?.reasons ?? []),
      ...duesPos.reasons,
    ]);
  } else if (reserved) {
    stage = "prepared_payout";
    filterGroup = "prepared";
    direction = "payable";
    reservedPaise =
      typeof reservation?.finalPaise === "number"
        ? reservation.finalPaise
        : (payoutPos?.finalPaise ?? 0);
    ownerSummary = activePayoutReference
      ? `Included in prepared payout ${activePayoutReference}. Payment has not yet been recorded.`
      : "Included in a prepared payout. Payment has not yet been recorded.";
    if (payoutPos && !payoutPos.eligible) {
      pendingReasons = uniqueOwnerReasons(payoutPos.reasons);
    }
  } else if (payoutPos?.eligible) {
    stage = "ready_for_payment";
    filterGroup = "ready";
    direction = "payable";
    readyForPaymentPaise = payoutPos.finalPaise!;
    ownerSummary =
      "Verified and eligible to be included in a payout batch once the hotel minimum is met.";
  } else if (duesPos.collectible) {
    stage = "dues_outstanding";
    filterGroup = "dues";
    direction = "dues";
    duesPaise = duesPos.duesPaise;
    ownerSummary =
      "Commission owed to Helpkey on hotel-collected payments. Report a payment once transferred.";
  } else if (payoutRecorded) {
    stage = "paid_out";
    filterGroup = "paid";
    direction = "settled";
    ownerSummary = activePayoutReference
      ? `Settled via payout ${activePayoutReference}.`
      : "Settled via recorded hotel payout.";
  } else if (
    duesPos.status === "Cleared" &&
    actual.payablePaise === 0 &&
    actual.duesPaise === 0 &&
    state.status === "recognized"
  ) {
    stage = "dues_cleared";
    filterGroup = "paid";
    direction = "settled";
    ownerSummary = "Hotel dues for this booking have been cleared.";
  } else if (
    state.status === "recognized" &&
    actual.payablePaise === 0 &&
    actual.duesPaise === 0 &&
    !duesPos.reasons.length &&
    !expected?.reasons.length &&
    actual.pendingOnlinePaise === 0 &&
    actual.pendingHotelPaise === 0
  ) {
    stage = "settled_zero";
    filterGroup = "paid";
    direction = "settled";
    ownerSummary = "Stay settled with no remaining hotel payout or dues balance.";
  } else if (
    payoutPos &&
    !payoutPos.baseReasons.length &&
    (!payoutPos.assessmentCurrent || payoutPos.deductionsPaise === null) &&
    actual.payablePaise > 0
  ) {
    stage = "awaiting_deduction_review";
    filterGroup = "awaiting";
    direction = "payable";
    awaitingClearanceCategory = "deduction_review";
    awaitingClearanceAmountPaise = actual.payablePaise;
    beforeUnassessedDeductions = true;
    ownerSummary =
      "Amount shown is before unassessed deductions. Helpkey has not finalized applicable deductions yet.";
    pendingReasons = ["Helpkey is reviewing final settlement deductions."];
  } else if (
    payoutPos &&
    payoutPos.baseReasons.length === 1 &&
    payoutPos.baseReasons[0] === "Saved payout waiting period has not elapsed." &&
    actual.payablePaise > 0
  ) {
    stage = "awaiting_waiting_period";
    filterGroup = "awaiting";
    direction = "payable";
    awaitingClearanceCategory = "waiting_period";
    awaitingClearanceAmountPaise = payoutPos.finalPaise ?? actual.payablePaise;
    beforeUnassessedDeductions =
      !payoutPos.assessmentCurrent || payoutPos.deductionsPaise === null;
    ownerSummary = payoutPos.eligibleAt
      ? `Within post-checkout waiting period until ${toHotelLocalDate(payoutPos.eligibleAt, tz) ?? payoutPos.eligibleAt.slice(0, 10)}.`
      : "Within post-checkout waiting period.";
    pendingReasons = [
      payoutPos.eligibleAt
        ? `Waiting period ends on ${toHotelLocalDate(payoutPos.eligibleAt, tz) ?? payoutPos.eligibleAt.slice(0, 10)}.`
        : "Waiting period after checkout has not elapsed.",
    ];
  } else if (
    state.status === "pending" &&
    !["checked_out", "completed"].includes(String(b?.bookingStatus)) &&
    (!expected || expected.status === "pending") &&
    !b?.paymentReconciliationPending &&
    !b?.stayQuoteReconciliationPending &&
    actual.reviewOnlinePaise + actual.reviewHotelPaise === 0 &&
    !["cancelled", "no_show", "expired", "payment_failed", "failed"].includes(
      String(b?.bookingStatus ?? ""),
    ) &&
    !(expected?.reasons.length ?? 0)
  ) {
    stage = "awaiting_checkout";
    filterGroup = "awaiting";
    direction = "pending";
    awaitingClearanceCategory = "checkout";
    awaitingClearanceAmountPaise =
      actual.pendingOnlinePaise + actual.pendingHotelPaise;
    ownerSummary =
      "Collections stay pending until guest checkout is completed and reconciled.";
    pendingReasons = ["Stay checkout has not been completed yet."];
  } else {
    stage = "awaiting_evidence_review";
    filterGroup = "awaiting";
    direction =
      actual.duesPaise > 0
        ? "dues"
        : actual.payablePaise > 0
          ? "payable"
          : "pending";
    awaitingClearanceCategory = "evidence_review";
    awaitingClearanceAmountPaise =
      actual.reviewOnlinePaise +
      actual.reviewHotelPaise +
      actual.pendingOnlinePaise +
      actual.pendingHotelPaise +
      Math.max(0, actual.payablePaise) +
      Math.max(0, actual.duesPaise);
    beforeUnassessedDeductions =
      actual.payablePaise > 0 &&
      (!payoutPos?.assessmentCurrent || payoutPos?.deductionsPaise === null);
    const combinedReasons = [
      ...(payoutPos?.reasons ?? []),
      ...duesPos.reasons,
    ].filter(
      (r) =>
        r !== "No outstanding hotel payable." &&
        r !== "Deduction assessment is missing or evidence changed." &&
        r !== "All deduction categories require an explicit assessment.",
    );
    ownerSummary =
      "Under evidence or settlement review before funds can clear.";
    pendingReasons = combinedReasons.length
      ? uniqueOwnerReasons(combinedReasons)
      : ["Settlement evidence is under review."];
    if (["checked_out", "completed"].includes(String(b?.bookingStatus)) &&
        guestOutstandingPaise !== null && guestOutstandingPaise > 0) {
      ownerSummary = "Checkout is complete. Guest payment remains outstanding before settlement can clear.";
      pendingReasons = ["Collect and reconcile the remaining guest balance from the reservation."];
    }
  }

  return {
    bookingId,
    propertyId,
    reference,
    bookingStatus: b?.bookingStatus ?? null,
    relevantDate,
    sortAt,
    checkoutAt: payoutPos?.checkoutAt ?? checkoutIso ?? null,
    eligibleAt: payoutPos?.eligibleAt ?? null,
    waitingPeriodPending: stage === "awaiting_waiting_period",
    firstDuesRecordedAt: duesPos.firstRecordedAt,
    stage,
    filterGroup,
    direction,
    awaitingClearanceCategory,
    awaitingClearanceAmountPaise,
    beforeUnassessedDeductions,
    readyForPaymentPaise,
    reservedPaise,
    duesPaise,
    payoutId: activePayoutId,
    payoutReference: activePayoutReference,
    includedInAccounting: included,
    isProcessing,
    isStaleOrInvalid,
    amounts,
    ownerSummary,
    pendingReasons,
  };
}
