import "server-only";
import { AggregateField, FieldPath } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb as db } from "../firebase/admin";
import { ApiException } from "../api/errors";
import { hash } from "../accounting/domain";
import { decodeCursor } from "../api/pagination";
import { policySchema, resolvePolicy } from "../finance-settings/domain";
import { readinessStatus } from "../payout-readiness/domain";
import { readinessInTransaction } from "../payout-readiness/service";
import { dueGuidance } from "../payouts/domain";
import type { Payout } from "../payouts/service";
import { duesReportsCollection } from "../dues/report-domain";
import { authorizeCurrentOwner } from "../dues/reports";
import {
  ensureFreshOwnerProjections,
  ownerFinanceCollections,
  type AwaitingClearanceBreakdown,
  type OwnerFinanceActivityDoc,
  type OwnerFinanceBookingDoc,
} from "./projections";

import { scanFinancePage, validFinanceDate } from "./pagination";

export type OwnerActionPanel = {
  priority: "owner_action" | "helpkey_review" | "automatic_waiting" | "up_to_date";
  title: string;
  description: string;
  primaryAction: {
    label: string;
    kind: "report_dues" | "bank_setup" | "filter_bookings" | "view_reports" | null;
    href?: string;
    filterStatus?: string;
  } | null;
};

export type OwnerFinancesOverviewDto = {
  hotel: {
    id: string;
    name: string;
    timezone: string;
  };
  readyForPayment: {
    amountPaise: number;
    bookingsCount: number;
    minimumPayoutPaise: number | null;
    meetsMinimum: boolean;
    shortfallPaise: number | null;
    explanation: string;
  };
  awaitingClearance: AwaitingClearanceBreakdown;
  youOweHelpkey: {
    amountPaise: number;
    bookingsCount: number;
    maxSingleReportPaise: number;
    maxSingleReportBookingsCount: number;
    canReportPayment: boolean;
    pendingReportsCount: number;
    pendingReportsAmountPaise: number;
  };
  preparedPayouts: {
    totalPaise: number;
    count: number;
    items: {
      id: string;
      reference: string;
      finalPaise: number;
      bookingsCount: number;
      createdAt: string;
      statementUrl: string;
    }[];
  };
  bankReadiness: {
    status: string;
    next: string | null;
    maskedBank: {
      holderName: string;
      maskedAccount: string;
      ifsc: string;
      bankName: string;
    } | null;
    href: string;
    advisoryNote: string;
  };
  policySummary: {
    payoutCycle: string | null;
    payoutWeekday: string | null;
    minimumPayoutPaise: number | null;
    nextCycleGuidanceDate: string | null;
    duesWarningPaise: number | null;
    duesLimitPaise: number | null;
    duesLimitType: string | null;
  };
  actionPanel: OwnerActionPanel;
  freshness: {
    status: "fresh" | "updating" | "stale";
    lastUpdatedAt: string;
    pendingUpdatesCount: number;
    staleCount: number;
    message: string | null;
  };
  summaryTotals: {
    paidOutTotalPaise: number;
    duesClearedTotalPaise: number;
  };
};

export type OwnerBookingRowDto = {
  bookingId: string;
  reference: string;
  bookingStatus: string | null;
  relevantDate: string;
  checkoutAt: string | null;
  eligibleAt: string | null;
  stage: OwnerFinanceBookingDoc["stage"];
  filterGroup: OwnerFinanceBookingDoc["filterGroup"];
  direction: OwnerFinanceBookingDoc["direction"];
  awaitingClearanceCategory: OwnerFinanceBookingDoc["awaitingClearanceCategory"];
  awaitingClearanceAmountPaise: number | null;
  beforeUnassessedDeductions: boolean;
  readyForPaymentPaise: number;
  reservedPaise: number;
  duesPaise: number;
  payoutId: string | null;
  payoutReference: string | null;
  isProcessing: boolean;
  isStaleOrInvalid: boolean;
  amounts: OwnerFinanceBookingDoc["amounts"];
  ownerSummary: string;
  pendingReasons: string[];
};

export type OwnerActivityRowDto = {
  id: string;
  type: string;
  typeGroup: OwnerFinanceActivityDoc["typeGroup"];
  title: string;
  purpose: string;
  amountPaise: number;
  occurredAt: string | null;
  localDate: string;
  direction: "in" | "out" | "record_only";
  status: string;
  bookingIds: string[];
  bookingReferences: { bookingId: string; reference: string }[];
  payoutId: string | null;
  payoutReference: string | null;
  statementUrl: string | null;
  receiptId: string | null;
  receiptReference: string | null;
  paymentMethod: string | null;
  transactionReference: string | null;
  correctionReason: string | null;
  replacesReceiptId: string | null;
  replacedByReceiptId: string | null;
};

function buildActionPanel(params: {
  propertyId: string;
  youOweHelpkeyPaise: number;
  pendingReportsCount: number;
  bankReadyStatus: string;
  bankHref: string;
  readyForPaymentPaise: number;
  minimumPayoutPaise: number | null;
  preparedCount: number;
  awaiting: AwaitingClearanceBreakdown;
}): OwnerActionPanel {
  const {
    youOweHelpkeyPaise,
    pendingReportsCount,
    bankReadyStatus,
    bankHref,
    readyForPaymentPaise,
    minimumPayoutPaise,
    preparedCount,
    awaiting,
  } = params;

  if (youOweHelpkeyPaise > 0 && pendingReportsCount === 0) {
    return {
      priority: "owner_action",
      title: "Report your dues payment when transferred",
      description:
        "You have verified dues owed to Helpkey on hotel-collected stays. Once you transfer the payment, submit a report so Helpkey can verify and allocate it.",
      primaryAction: {
        label: "Report payment",
        kind: "report_dues",
      },
    };
  }

  if (bankReadyStatus === "Setup incomplete") {
    return {
      priority: "owner_action",
      title: "Complete bank & business details (advisory)",
      description:
        "Your bank or business setup is incomplete. Completing your payout profile helps Helpkey verify payout destination details when settlements are processed.",
      primaryAction: {
        label: "Update bank details",
        kind: "bank_setup",
        href: bankHref,
      },
    };
  }

  if (pendingReportsCount > 0) {
    return {
      priority: "helpkey_review",
      title: "Reported dues payment awaiting verification",
      description:
        "Helpkey is verifying your submitted payment report. Reported payments remain separate until confirmed and allocated.",
      primaryAction: {
        label: "View reported payments",
        kind: "view_reports",
      },
    };
  }

  if (awaiting.evidenceReviewPaise > 0 || awaiting.evidenceReviewUnknownCount > 0) {
    return {
      priority: "helpkey_review",
      title: "Helpkey review in progress for flagged bookings",
      description:
        "One or more bookings have refunds, cancellations, or payment evidence under review before settlement can clear.",
      primaryAction: {
        label: "Review bookings",
        kind: "filter_bookings",
        filterStatus: "awaiting",
      },
    };
  }

  if (awaiting.deductionReviewPaise > 0) {
    return {
      priority: "helpkey_review",
      title: "Deduction review pending",
      description:
        "Bookings past their waiting period are awaiting Helpkey deduction review. Displayed amounts are before unassessed deductions.",
      primaryAction: {
        label: "View awaiting bookings",
        kind: "filter_bookings",
        filterStatus: "awaiting",
      },
    };
  }

  if (preparedCount > 0) {
    return {
      priority: "helpkey_review",
      title: "Prepared payout awaiting external payment recording",
      description:
        "A payout batch has been prepared and its bookings are reserved. Payment will appear under Payments once Helpkey records the transfer.",
      primaryAction: {
        label: "View prepared bookings",
        kind: "filter_bookings",
        filterStatus: "prepared",
      },
    };
  }

  if (awaiting.waitingPeriodPaise > 0 || awaiting.checkoutPaise > 0) {
    return {
      priority: "automatic_waiting",
      title: "Balances clearing through checkout and waiting period",
      description:
        "No action needed from you. Collections clear automatically after checkout and the hotel's saved payout waiting period elapse.",
      primaryAction: {
        label: "View awaiting clearance",
        kind: "filter_bookings",
        filterStatus: "awaiting",
      },
    };
  }

  if (
    readyForPaymentPaise > 0 &&
    minimumPayoutPaise !== null &&
    readyForPaymentPaise < minimumPayoutPaise
  ) {
    return {
      priority: "automatic_waiting",
      title: "Ready balance is below the hotel minimum payout",
      description:
        "Verified bookings are ready, and will become eligible for batching once combined ready funds reach your configured minimum payout.",
      primaryAction: {
        label: "View ready bookings",
        kind: "filter_bookings",
        filterStatus: "ready",
      },
    };
  }

  return {
    priority: "up_to_date",
    title: "All settlement balances are up to date",
    description:
      "You have no pending owner finance actions right now. Payouts are recorded by Helpkey once batches are settled.",
    primaryAction: null,
  };
}

export async function readOwnerFinancesOverview(
  uid: string,
  propertyId: string,
  now = new Date(),
): Promise<OwnerFinancesOverviewDto> {
  const access = await authorizeCurrentOwner(uid, propertyId);
  const overview = await ensureFreshOwnerProjections(db, propertyId, now);

  const [
    globalSnap,
    localSnap,
    preparedSnap,
    preparedTotals,
    pendingReportTotals,
    dirtyAccountingSnap,
    readiness,
  ] = await Promise.all([
    db.collection("hotelFinanceSettingsV1").doc("global").get(),
    db.collection("hotelFinanceSettingsV1").doc(`hotel_${propertyId}`).get(),
    db
      .collection("hotelPayoutsV1")
      .where("propertyId", "==", propertyId)
      .where("status", "==", "Prepared")
      .limit(50)
      .get(),
    db
      .collection("hotelPayoutsV1")
      .where("propertyId", "==", propertyId)
      .where("status", "==", "Prepared")
      .aggregate({ count: AggregateField.count(), amountPaise: AggregateField.sum("finalPaise") })
      .get(),
    db
      .collection(duesReportsCollection)
      .where("propertyId", "==", propertyId)
      .where("status", "==", "awaiting_verification")
      .aggregate({ count: AggregateField.count(), amountPaise: AggregateField.sum("amountPaise") })
      .get(),
    db
      .collection("hotelAccountingStateV1")
      .where("propertyId", "==", propertyId)
      .where("dirty", "==", true)
      .limit(50)
      .get(),
    db.runTransaction((tx) => readinessInTransaction(tx, propertyId)),
  ]);

  const policy = resolvePolicy(
    policySchema.parse(globalSnap.get("settings") ?? {}),
    policySchema.parse(localSnap.get("settings") ?? {}),
  ).effective;
  const timezone =
    (access.property.timezone as string | undefined) || "Asia/Kolkata";
  const hotelName = String(access.property.name ?? propertyId);

  const preparedPayouts = preparedSnap.docs
    .map((d) => d.data() as Payout)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const preparedTotalPaise = preparedTotals.data().amountPaise;
  const pendingReportsCount = pendingReportTotals.data().count;
  const pendingReportsAmountPaise = pendingReportTotals.data().amountPaise;

  const minimumPayoutPaise =
    typeof policy.minimumPayoutPaise === "number"
      ? policy.minimumPayoutPaise
      : null;
  const meetsMinimum =
    minimumPayoutPaise !== null &&
    overview.readyForPaymentPaise >= minimumPayoutPaise;
  const shortfallPaise =
    minimumPayoutPaise !== null &&
    overview.readyForPaymentPaise > 0 &&
    overview.readyForPaymentPaise < minimumPayoutPaise
      ? minimumPayoutPaise - overview.readyForPaymentPaise
      : null;

  let readyExplanation = "";
  if (overview.readyForPaymentPaise === 0) {
    readyExplanation =
      "No unreserved bookings are currently ready for a new payout.";
  } else if (minimumPayoutPaise === null) {
    readyExplanation =
      "Verified bookings are ready, awaiting hotel minimum payout configuration by Helpkey.";
  } else if (!meetsMinimum) {
    readyExplanation = `Combined ready amount is ₹${(shortfallPaise! / 100).toFixed(2)} below the hotel's ₹${(minimumPayoutPaise / 100).toFixed(2)} minimum payout threshold.`;
  } else {
    readyExplanation =
      "Meets the hotel's minimum payout threshold. Helpkey prepares and records payout batches manually; payouts do not transfer automatically.";
  }

  const bankReady = readinessStatus(readiness.complete, readiness.reviewed);
  const bankHref = `/partner/settings/bank?propertyId=${encodeURIComponent(propertyId)}`;

  const pendingUpdatesCount = Math.max(
    overview.processingCount,
    dirtyAccountingSnap.size,
  );
  const freshnessStatus: "fresh" | "updating" | "stale" =
    pendingUpdatesCount > 0
      ? "updating"
      : overview.staleCount > 0
        ? "stale"
        : "fresh";
  const freshnessMessage =
    pendingUpdatesCount > 0
      ? `${pendingUpdatesCount} booking update${pendingUpdatesCount === 1 ? " is" : "s are"} still processing and excluded from verified availability.`
      : overview.staleCount > 0
        ? `${overview.staleCount} booking${overview.staleCount === 1 ? " requires" : "s require"} settlement review and ${overview.staleCount === 1 ? "is" : "are"} excluded from verified availability.`
        : null;

  const dueGuide = dueGuidance(policy, timezone, now);

  return {
    hotel: {
      id: propertyId,
      name: hotelName,
      timezone,
    },
    readyForPayment: {
      amountPaise: overview.readyForPaymentPaise,
      bookingsCount: overview.readyBookingsCount,
      minimumPayoutPaise,
      meetsMinimum,
      shortfallPaise,
      explanation: readyExplanation,
    },
    awaitingClearance: overview.awaitingClearance,
    youOweHelpkey: {
      amountPaise: overview.youOweHelpkeyPaise,
      bookingsCount: overview.collectibleDuesBookingsCount,
      maxSingleReportPaise: overview.oldest50DuesCapPaise,
      maxSingleReportBookingsCount: overview.oldest50DuesBookingCount,
      canReportPayment: overview.oldest50DuesCapPaise > 0,
      pendingReportsCount,
      pendingReportsAmountPaise,
    },
    preparedPayouts: {
      totalPaise: preparedTotalPaise,
      count: preparedTotals.data().count,
      items: preparedPayouts.map((p) => ({
        id: p.id,
        reference: p.reference,
        finalPaise: p.finalPaise,
        bookingsCount: p.bookings.length,
        createdAt: p.createdAt,
        statementUrl: `/api/partner/properties/${encodeURIComponent(propertyId)}/payouts/${encodeURIComponent(p.id)}/statement`,
      })),
    },
    bankReadiness: {
      status: bankReady.status,
      next: bankReady.next,
      maskedBank: readiness.masked
        ? {
            holderName: readiness.masked.holderName,
            maskedAccount: readiness.masked.maskedAccount,
            ifsc: readiness.masked.ifsc,
            bankName: readiness.masked.bankName,
          }
        : null,
      href: bankHref,
      advisoryNote:
        "Bank readiness is advisory and does not hold booking clearance or trigger automatic transfers.",
    },
    policySummary: {
      payoutCycle: policy.payoutCycle ?? null,
      payoutWeekday: policy.payoutWeekday ?? null,
      minimumPayoutPaise,
      nextCycleGuidanceDate: dueGuide.date,
      duesWarningPaise: policy.duesWarningPaise ?? null,
      duesLimitPaise:
        policy.duesLimit?.type === "limited"
          ? policy.duesLimit.amountPaise
          : null,
      duesLimitType: policy.duesLimit?.type ?? null,
    },
    actionPanel: buildActionPanel({
      propertyId,
      youOweHelpkeyPaise: overview.youOweHelpkeyPaise,
      pendingReportsCount,
      bankReadyStatus: bankReady.status,
      bankHref,
      readyForPaymentPaise: overview.readyForPaymentPaise,
      minimumPayoutPaise,
      preparedCount: preparedTotals.data().count,
      awaiting: overview.awaitingClearance,
    }),
    freshness: {
      status: freshnessStatus,
      lastUpdatedAt: overview.projectedAt,
      pendingUpdatesCount,
      staleCount: overview.staleCount,
      message: freshnessMessage,
    },
    summaryTotals: {
      paidOutTotalPaise: overview.paidOutTotalPaise,
      duesClearedTotalPaise: overview.duesClearedTotalPaise,
    },
  };
}

const bookingsQuerySchema = z.object({
  detailId: z.string().min(1).max(200).refine((v) => !v.includes("/")).optional(),
  status: z
    .enum(["all", "ready", "awaiting", "dues", "prepared", "paid", "historical"])
    .default("all"),
  awaitingCategory: z
    .enum([
      "all",
      "checkout",
      "waiting_period",
      "deduction_review",
      "evidence_review",
    ])
    .default("all"),
  direction: z.enum(["all", "payable", "dues"]).default("all"),
  q: z.string().trim().max(120).optional().default(""),
  from: z
    .string()
    .refine(validFinanceDate, "Enter a valid calendar date.")
    .optional(),
  to: z
    .string()
    .refine(validFinanceDate, "Enter a valid calendar date.")
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(2048).optional(),
});

function toBookingRowDto(b: OwnerFinanceBookingDoc): OwnerBookingRowDto {
  if (b.dirty) {
    b = {
      ...b, stage: "processing", filterGroup: "awaiting", direction: "pending",
      isProcessing: true, readyForPaymentPaise: 0, duesPaise: 0,
      awaitingClearanceAmountPaise: null,
      ownerSummary: "Recent changes are processing. Displayed breakdowns are last recorded amounts, excluded from verified availability.",
      pendingReasons: ["Accounting update is in progress."],
    };
  }
  return {
    bookingId: b.bookingId,
    reference: b.reference,
    bookingStatus: b.bookingStatus,
    relevantDate: b.relevantDate,
    checkoutAt: b.checkoutAt,
    eligibleAt: b.eligibleAt,
    stage: b.stage,
    filterGroup: b.filterGroup,
    direction: b.direction,
    awaitingClearanceCategory: b.awaitingClearanceCategory,
    awaitingClearanceAmountPaise: b.awaitingClearanceAmountPaise,
    beforeUnassessedDeductions: b.beforeUnassessedDeductions,
    readyForPaymentPaise: b.readyForPaymentPaise,
    reservedPaise: b.reservedPaise,
    duesPaise: b.duesPaise,
    payoutId: b.payoutId,
    payoutReference: b.payoutReference,
    isProcessing: b.isProcessing,
    isStaleOrInvalid: b.isStaleOrInvalid,
    amounts: b.amounts,
    ownerSummary: b.ownerSummary,
    pendingReasons: b.pendingReasons,
  };
}

export async function listOwnerFinanceBookings(
  uid: string,
  propertyId: string,
  rawQuery: Record<string, unknown>,
  now = new Date(),
) {
  const access = await authorizeCurrentOwner(uid, propertyId);
  const f = bookingsQuerySchema.parse(rawQuery);
  if ((f.from && !f.to) || (!f.from && f.to) || (f.from && f.to && f.from > f.to)) {
    throw new ApiException(
      "INVALID_DATE_RANGE",
      422,
      "Provide a valid hotel-local date range.",
    );
  }
  await ensureFreshOwnerProjections(db, propertyId, now);

  const hasRange = !!(f.from && f.to);
  const qNorm = f.q.trim().toLowerCase();
  const filterFingerprint = hash({
    propertyId,
    status: f.status,
    awaitingCategory: f.awaitingCategory,
    direction: f.direction,
    q: qNorm,
    from: f.from ?? null,
    to: f.to ?? null,
  });

  const cursor = f.cursor ? decodeCursor(f.cursor) : null;
  if (cursor && cursor.values[0] !== filterFingerprint) {
    throw new ApiException(
      "INVALID_CURSOR",
      422,
      "Filters changed. Start from the first page.",
    );
  }

  let query: FirebaseFirestore.Query = db
    .collection(ownerFinanceCollections.bookings)
    .where("propertyId", "==", propertyId);

  // Pick one primary indexed equality/contains filter; secondary filters are applied
  // on the bounded scanned page if combined.
  if (f.detailId) {
    query = query.where(FieldPath.documentId(), "==", f.detailId);
  } else if (qNorm) {
    query = query.where("searchTokens", "array-contains", qNorm);
  } else if (f.awaitingCategory !== "all") {
    query = query.where(
      "awaitingClearanceCategory",
      "==",
      f.awaitingCategory,
    );
  } else if (f.status !== "all") {
    query = query.where("filterGroup", "==", f.status);
  } else if (f.direction !== "all") {
    query = query.where("direction", "==", f.direction);
  }

  if (hasRange) {
    query = query
      .where("relevantDate", ">=", f.from!)
      .where("relevantDate", "<=", f.to!)
      .orderBy("relevantDate", "desc")
      .orderBy("sortAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
  } else {
    query = query
      .orderBy("sortAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
  }

  const { items: collected, nextCursor } = await scanFinancePage<OwnerFinanceBookingDoc>({
    query, cursor, fingerprint: filterFingerprint, limit: f.limit,
    matches: (b) => (f.status === "all" || b.filterGroup === f.status) && (f.awaitingCategory === "all" || b.awaitingClearanceCategory === f.awaitingCategory) && (f.direction === "all" || b.direction === f.direction),
    sortValues: (b) => hasRange ? [b.relevantDate, b.sortAt] : [b.sortAt],
  });

  return {
    timezone: (access.property.timezone as string | undefined) || "Asia/Kolkata",
    items: collected.map(toBookingRowDto),
    nextCursor,
  };
}

const activityQuerySchema = z.object({
  detailId: z.string().min(1).max(200).refine((v) => !v.includes("/")).optional(),
  type: z
    .enum(["all", "collections", "refunds", "payouts", "dues_receipts"])
    .default("all"),
  q: z.string().trim().max(120).optional().default(""),
  from: z
    .string()
    .refine(validFinanceDate, "Enter a valid calendar date.")
    .optional(),
  to: z
    .string()
    .refine(validFinanceDate, "Enter a valid calendar date.")
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(2048).optional(),
});

export async function listOwnerFinanceActivity(
  uid: string,
  propertyId: string,
  rawQuery: Record<string, unknown>,
  now = new Date(),
) {
  const access = await authorizeCurrentOwner(uid, propertyId);
  const f = activityQuerySchema.parse(rawQuery);
  if ((f.from && !f.to) || (!f.from && f.to) || (f.from && f.to && f.from > f.to)) {
    throw new ApiException(
      "INVALID_DATE_RANGE",
      422,
      "Provide a valid hotel-local date range.",
    );
  }
  await ensureFreshOwnerProjections(db, propertyId, now);

  const hasRange = !!(f.from && f.to);
  const qNorm = f.q.trim().toLowerCase();
  const filterFingerprint = hash({
    propertyId,
    type: f.type,
    q: qNorm,
    from: f.from ?? null,
    to: f.to ?? null,
  });

  const cursor = f.cursor ? decodeCursor(f.cursor) : null;
  if (cursor && cursor.values[0] !== filterFingerprint) {
    throw new ApiException(
      "INVALID_CURSOR",
      422,
      "Filters changed. Start from the first page.",
    );
  }

  let query: FirebaseFirestore.Query = db
    .collection(ownerFinanceCollections.activity)
    .where("propertyId", "==", propertyId);

  if (f.detailId) {
    query = query.where(FieldPath.documentId(), "==", hash([propertyId, f.detailId]));
  } else if (qNorm) {
    query = query.where("searchTokens", "array-contains", qNorm);
  } else if (f.type !== "all") {
    query = query.where("typeGroup", "==", f.type);
  }

  if (hasRange) {
    query = query
      .where("localDate", ">=", f.from!)
      .where("localDate", "<=", f.to!)
      .orderBy("localDate", "desc")
      .orderBy("sortAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
  } else {
    query = query
      .orderBy("sortAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
  }

  const { items: collected, nextCursor } = await scanFinancePage<OwnerFinanceActivityDoc>({
    query, cursor, fingerprint: filterFingerprint, limit: f.limit,
    matches: (a) => f.type === "all" || a.typeGroup === f.type,
    sortValues: (a) => hasRange ? [a.localDate, a.sortAt] : [a.sortAt],
  });

  return {
    timezone: (access.property.timezone as string | undefined) || "Asia/Kolkata",
    items: collected.map((a): OwnerActivityRowDto => ({
      id: a.id,
      type: a.type,
      typeGroup: a.typeGroup,
      title: a.title,
      purpose: a.purpose,
      amountPaise: a.amountPaise,
      occurredAt: a.occurredAt,
      localDate: a.localDate,
      direction: a.direction,
      status: a.status,
      bookingIds: a.bookingIds,
      bookingReferences: a.bookingReferences,
      payoutId: a.payoutId,
      payoutReference: a.payoutReference,
      statementUrl:
        a.statementAvailable && a.payoutId
          ? `/api/partner/properties/${encodeURIComponent(propertyId)}/payouts/${encodeURIComponent(a.payoutId)}/statement`
          : null,
      receiptId: a.receiptId,
      receiptReference: a.receiptReference,
      paymentMethod: a.paymentMethod,
      transactionReference: a.transactionReference,
      correctionReason: a.correctionReason,
      replacesReceiptId: a.replacesReceiptId,
      replacedByReceiptId: a.replacedByReceiptId,
    })),
    nextCursor,
  };
}
