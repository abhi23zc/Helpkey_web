import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { hash } from "../accounting/domain";
import {
  eligible,
  journalCollection,
  readEvidence,
  summary,
  type Journal,
} from "../accounting/posting";
import { paymentHistory } from "../accounting/payments";
import { duesCollections, journalFindings } from "../dues/journal";
import type { Correction, Receipt } from "../dues/domain";
import type { Assessment } from "../payouts/deductions";
import type { Payout } from "../payouts/service";
import type { RecordData } from "../partner/dashboard/domain";
import {
  classifyBookingFinance,
  toHotelLocalDate,
  type ClassifiedBookingFinance,
} from "./classification";

export const ownerFinanceCollections = {
  bookings: "hotelOwnerFinanceBookingsV1",
  activity: "hotelOwnerFinanceActivityV1",
  overview: "hotelOwnerFinanceOverviewV1",
} as const;

export const PROJECTION_VERSION = 1;

export type OwnerFinanceBookingDoc = ClassifiedBookingFinance & {
  searchTokens: string[];
  dirty: boolean;
  projectedAt: string;
  projectionVersion: number;
};

export type ActivityTypeGroup =
  | "collections"
  | "refunds"
  | "payouts"
  | "dues_receipts";

export type OwnerFinanceActivityDoc = {
  docId: string;
  id: string;
  propertyId: string;
  type: string;
  typeGroup: ActivityTypeGroup;
  title: string;
  purpose: string;
  amountPaise: number;
  occurredAt: string | null;
  localDate: string;
  sortAt: string;
  direction: "in" | "out" | "record_only";
  status: string;
  bookingId: string;
  bookingIds: string[];
  bookingReferences: { bookingId: string; reference: string }[];
  payoutId: string | null;
  payoutReference: string | null;
  statementAvailable: boolean;
  receiptId: string | null;
  receiptReference: string | null;
  paymentMethod: string | null;
  transactionReference: string | null;
  correctionReason: string | null;
  replacesReceiptId: string | null;
  replacedByReceiptId: string | null;
  searchTokens: string[];
  projectedAt: string;
  projectionVersion: number;
};

export type AwaitingClearanceBreakdown = {
  checkoutPaise: number;
  waitingPeriodPaise: number;
  deductionReviewPaise: number;
  deductionReviewBeforeAssessment: boolean;
  evidenceReviewPaise: number;
  evidenceReviewUnknownCount: number;
  totalKnownPaise: number;
};

export type OwnerFinanceOverviewDoc = {
  propertyId: string;
  readyForPaymentPaise: number;
  readyBookingsCount: number;
  preparedPayoutsPaise: number;
  preparedPayoutsCount: number;
  awaitingClearance: AwaitingClearanceBreakdown;
  youOweHelpkeyPaise: number;
  collectibleDuesBookingsCount: number;
  oldest50DuesCapPaise: number;
  oldest50DuesBookingCount: number;
  paidOutTotalPaise: number;
  duesClearedTotalPaise: number;
  processingCount: number;
  staleCount: number;
  nextWaitingExpiryAt: string | null;
  dirty: boolean;
  activityDirty?: boolean;
  projectedAt: string;
  projectionVersion: number;
};

export function buildSearchTokens(values: (string | null | undefined)[]): string[] {
  const tokens = new Set<string>();
  for (const raw of values) {
    if (!raw) continue;
    const lower = raw.trim().toLowerCase();
    if (!lower) continue;
    tokens.add(lower);
    for (let len = 2; len <= Math.min(lower.length, 20); len++) {
      tokens.add(lower.slice(0, len));
    }
    const parts = lower.split(/[^a-z0-9]+/).filter(Boolean);
    for (const part of parts) {
      tokens.add(part);
      for (let len = 2; len <= Math.min(part.length, 16); len++) {
        tokens.add(part.slice(0, len));
      }
    }
    for (let i = 0; i < parts.length; i++) {
      if (i + 1 < parts.length) {
        tokens.add(`${parts[i]}-${parts[i + 1]}`);
      }
    }
    const compact = lower.replace(/[^a-z0-9]/g, "");
    if (compact.length >= 2) {
      for (let len = 2; len <= Math.min(compact.length, 16); len++) {
        tokens.add(compact.slice(0, len));
      }
    }
    if (tokens.size >= 60) break;
  }
  return [...tokens].slice(0, 60);
}

function activityTypeGroup(type: string): ActivityTypeGroup {
  if (type === "payout") return "payouts";
  if (["dues_payment", "dues_correction"].includes(type)) return "dues_receipts";
  if (["online_refund", "hotel_refund", "refund_pending"].includes(type))
    return "refunds";
  return "collections";
}

function summarizeOverviewFromBookings(
  propertyId: string,
  bookings: OwnerFinanceBookingDoc[],
  preparedPayouts: { finalPaise: number }[],
  paidOutTotalPaise: number,
  duesClearedTotalPaise: number,
  nowIso: string,
): OwnerFinanceOverviewDoc {
  let readyForPaymentPaise = 0;
  let readyBookingsCount = 0;
  let checkoutPaise = 0;
  let waitingPeriodPaise = 0;
  let deductionReviewPaise = 0;
  let deductionReviewBeforeAssessment = false;
  let evidenceReviewPaise = 0;
  let evidenceReviewUnknownCount = 0;
  let processingCount = 0;
  let staleCount = 0;
  let nextWaitingExpiryAt: string | null = null;

  const collectibleDues: OwnerFinanceBookingDoc[] = [];

  for (const b of bookings) {
    if (b.dirty || b.isProcessing) {
      processingCount += 1;
      continue;
    }
    if (b.isStaleOrInvalid) {
      staleCount += 1;
    }
    if (b.stage === "ready_for_payment") {
      readyForPaymentPaise += b.readyForPaymentPaise;
      readyBookingsCount += 1;
    } else if (b.stage === "dues_outstanding" && b.duesPaise > 0) {
      collectibleDues.push(b);
    } else if (b.awaitingClearanceCategory === "checkout") {
      checkoutPaise += b.awaitingClearanceAmountPaise ?? 0;
    } else if (b.awaitingClearanceCategory === "waiting_period") {
      waitingPeriodPaise += b.awaitingClearanceAmountPaise ?? 0;
      if (
        b.eligibleAt &&
        (!nextWaitingExpiryAt || b.eligibleAt < nextWaitingExpiryAt)
      ) {
        nextWaitingExpiryAt = b.eligibleAt;
      }
    } else if (b.awaitingClearanceCategory === "deduction_review") {
      deductionReviewPaise += b.awaitingClearanceAmountPaise ?? 0;
      deductionReviewBeforeAssessment = true;
    } else if (b.awaitingClearanceCategory === "evidence_review") {
      if (b.awaitingClearanceAmountPaise === null) {
        evidenceReviewUnknownCount += 1;
      } else {
        evidenceReviewPaise += b.awaitingClearanceAmountPaise;
      }
    }
  }

  collectibleDues.sort(
    (a, b) =>
      (a.firstDuesRecordedAt ?? "").localeCompare(b.firstDuesRecordedAt ?? "") ||
      a.bookingId.localeCompare(b.bookingId),
  );
  const youOweHelpkeyPaise = collectibleDues.reduce(
    (n, b) => n + b.duesPaise,
    0,
  );
  const oldest50 = collectibleDues.slice(0, 50);
  const oldest50DuesCapPaise = oldest50.reduce((n, b) => n + b.duesPaise, 0);

  return {
    propertyId,
    readyForPaymentPaise,
    readyBookingsCount,
    preparedPayoutsPaise: preparedPayouts.reduce((n, p) => n + p.finalPaise, 0),
    preparedPayoutsCount: preparedPayouts.length,
    awaitingClearance: {
      checkoutPaise,
      waitingPeriodPaise,
      deductionReviewPaise,
      deductionReviewBeforeAssessment,
      evidenceReviewPaise,
      evidenceReviewUnknownCount,
      totalKnownPaise:
        checkoutPaise +
        waitingPeriodPaise +
        deductionReviewPaise +
        evidenceReviewPaise,
    },
    youOweHelpkeyPaise,
    collectibleDuesBookingsCount: collectibleDues.length,
    oldest50DuesCapPaise,
    oldest50DuesBookingCount: oldest50.length,
    paidOutTotalPaise,
    duesClearedTotalPaise,
    processingCount,
    staleCount,
    nextWaitingExpiryAt,
    dirty: false,
    activityDirty: false,
    projectedAt: nowIso,
    projectionVersion: PROJECTION_VERSION,
  };
}

function buildBookingProjectionDoc(
  classified: ClassifiedBookingFinance,
  nowIso: string,
): OwnerFinanceBookingDoc {
  return {
    ...classified,
    searchTokens: buildSearchTokens([
      classified.bookingId,
      classified.reference,
      classified.payoutReference,
    ]),
    dirty: false,
    projectedAt: nowIso,
    projectionVersion: PROJECTION_VERSION,
  };
}

/**
 * Rebuilds all owner finance projections for a property from authoritative
 * booking, accounting, payout, and dues records. Never writes to the journal.
 */
export async function rebuildOwnerFinanceProjections(
  db: Firestore,
  propertyId: string,
  now = new Date(),
): Promise<OwnerFinanceOverviewDoc> {
  const [bookings, existing, receipts] = await Promise.all([
    db.collection("bookings").where("propertyId", "==", propertyId).select().get(),
    db.collection(ownerFinanceCollections.bookings).where("propertyId", "==", propertyId).select().get(),
    db.collection(duesCollections.receipts).where("propertyId", "==", propertyId).select("allocations").get(),
  ]);
  const ids = [...new Set([
    ...[...bookings.docs, ...existing.docs].map((d) => d.id),
    ...receipts.docs.flatMap((d) => (d.get("allocations") as Receipt["allocations"]).map((a) => a.bookingId)),
  ])];
  for (let i = 0; i < ids.length; i += 25) {
    await refreshBoundedOwnerBookings(db, propertyId, ids.slice(i, i + 25), now, false);
  }
  await syncOwnerActivityForProperty(db, propertyId, now);
  return recomputeOwnerOverview(db, propertyId, now);
}

/**
 * Refreshes specific dirty or waiting-period-expired bookings authoritatively
 * without scanning unrelated property history, then updates the overview doc.
 */
export async function refreshBoundedOwnerBookings(
  db: Firestore,
  propertyId: string,
  bookingIds: string[],
  now = new Date(),
  updateOverview = true,
): Promise<void> {
  const ids = [...new Set(bookingIds)].filter(Boolean).slice(0, 100);
  for (const bookingId of ids) {
    // Publish with the evidence read, so concurrent source writes/invalidation
    // force a transaction retry instead of being overwritten by an older read.
    await db.runTransaction(async (tx) => {
      const ref = db.collection(ownerFinanceCollections.bookings).doc(bookingId);
      const [evidence, assessment, reservation, property, receiptsSnap, correctionsSnap, previous] = await Promise.all([
        readEvidence(db, tx, bookingId),
        tx.get(db.collection("hotelPayoutAssessmentsV1").doc(bookingId)),
        tx.get(db.collection("hotelPayoutReservationsV1").doc(bookingId)),
        tx.get(db.collection("properties").doc(propertyId)),
        tx.get(db.collection(duesCollections.receipts).where("propertyId", "==", propertyId)),
        tx.get(db.collection(duesCollections.corrections).where("propertyId", "==", propertyId)),
        tx.get(ref),
      ]);
      const actualProperty = evidence.booking?.propertyId ?? evidence.state.propertyId ?? previous.get("propertyId");
      if (actualProperty !== propertyId) {
        if (previous.get("propertyId") === propertyId) tx.delete(ref);
        return;
      }
      if (!evidence.booking && !evidence.state.propertyId) evidence.state.propertyId = propertyId;
      const payoutId = reservation.get("payoutId");
      const payout = typeof payoutId === "string"
        ? (await tx.get(db.collection("hotelPayoutsV1").doc(payoutId))).data() as Payout | undefined
        : undefined;
      const classified = classifyBookingFinance({
        bookingId, evidence,
        assessment: assessment.exists ? assessment.data() as Assessment : null,
        reservation: reservation.exists ? reservation.data() as RecordData : null,
        payout: payout ? { id: payout.id, reference: payout.reference, status: payout.status } : null,
        duesHistoryReasons: journalFindings(bookingId, propertyId, evidence.journal,
          receiptsSnap.docs.map((d) => d.data() as Receipt),
          correctionsSnap.docs.map((d) => d.data() as Correction)),
        timezone: property.get("timezone") || "Asia/Kolkata", now,
      });
      tx.set(ref, buildBookingProjectionDoc(classified, now.toISOString()));
    });
  }
  if (updateOverview) await recomputeOwnerOverview(db, propertyId, now);
}

async function recomputeOwnerOverview(db: Firestore, propertyId: string, now: Date) {
  return db.runTransaction(async (tx) => {
    const ref = db.collection(ownerFinanceCollections.overview).doc(propertyId);
    const [previous, bookings, payoutsSnap, receiptsSnap, correctionsSnap] = await Promise.all([
      tx.get(ref),
      tx.get(db.collection(ownerFinanceCollections.bookings).where("propertyId", "==", propertyId)),
      tx.get(db.collection("hotelPayoutsV1").where("propertyId", "==", propertyId)),
      tx.get(db.collection(duesCollections.receipts).where("propertyId", "==", propertyId)),
      tx.get(db.collection(duesCollections.corrections).where("propertyId", "==", propertyId)),
    ]);
    const payouts = payoutsSnap.docs.map((d) => d.data() as Payout);
    const corrected = new Set(correctionsSnap.docs.map((d) => d.get("paymentId")));
    const overview = summarizeOverviewFromBookings(propertyId,
      bookings.docs.map((d) => d.data() as OwnerFinanceBookingDoc),
      payouts.filter((p) => p.status === "Prepared"),
      payouts.filter((p) => p.status === "Paid").reduce((n, p) => n + p.finalPaise, 0),
      receiptsSnap.docs.filter((d) => !corrected.has(d.id)).reduce((n, d) => n + d.get("amountPaise"), 0),
      now.toISOString());
    overview.activityDirty = previous.get("activityDirty") === true;
    overview.dirty = overview.processingCount > 0;
    tx.set(ref, overview);
    return overview;
  });
}

/**
 * Transaction-safe invalidation marker (writes only, zero reads).
 * Marks the overview and affected booking projections dirty so workers or the
 * next owner read refresh them without touching any financial journal records.
 */
export function markOwnerFinanceDirty(
  db: Firestore,
  writer: {
    set(
      ref: FirebaseFirestore.DocumentReference,
      data: FirebaseFirestore.DocumentData,
      options?: FirebaseFirestore.SetOptions,
    ): unknown;
  },
  propertyId: string,
  bookingIds: string[] = [],
  options: { processing?: boolean; activityDirty?: boolean } = {},
) {
  if (!propertyId) return;
  writer.set(
    db.collection(ownerFinanceCollections.overview).doc(propertyId),
    {
      propertyId,
      dirty: true,
      ...(options.activityDirty ? { activityDirty: true } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  for (const bookingId of [...new Set(bookingIds)].filter(Boolean)) {
    writer.set(
      db.collection(ownerFinanceCollections.bookings).doc(bookingId),
      {
        propertyId,
        bookingId,
        dirty: true,
        ...(options.processing !== undefined
          ? { isProcessing: options.processing }
          : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
}

/**
 * Rebuilds only the owner activity projection (`hotelOwnerFinanceActivityV1`)
 * from authoritative journal, payout, refund, and dues records. Never writes to journal.
 */
export async function syncOwnerActivityForProperty(
  db: Firestore,
  propertyId: string,
  now = new Date(),
): Promise<void> {
  const overviewRef = db.collection(ownerFinanceCollections.overview).doc(propertyId);
  const overviewBefore = await overviewRef.get();
  const nowIso = now.toISOString();
  const [
    propertySnap,
    bookingsSnap,
    journalSnap,
    refundsSnap,
    payoutsSnap,
    receiptsSnap,
    correctionsSnap,
    existingActivitySnap,
  ] = await Promise.all([
    db.collection("properties").doc(propertyId).get(),
    db.collection("bookings").where("propertyId", "==", propertyId).get(),
    db.collection(journalCollection).where("propertyId", "==", propertyId).get(),
    db.collection("refunds").where("propertyId", "==", propertyId).get(),
    db.collection("hotelPayoutsV1").where("propertyId", "==", propertyId).get(),
    db
      .collection(duesCollections.receipts)
      .where("propertyId", "==", propertyId)
      .get(),
    db
      .collection(duesCollections.corrections)
      .where("propertyId", "==", propertyId)
      .get(),
    db
      .collection(ownerFinanceCollections.activity)
      .where("propertyId", "==", propertyId)
      .select()
      .get(),
  ]);

  const timezone =
    (propertySnap.get("timezone") as string | undefined) || "Asia/Kolkata";
  const receipts = receiptsSnap.docs.map((d) => d.data() as Receipt);
  const corrections = correctionsSnap.docs.map((d) => d.data() as Correction);
  const payouts = payoutsSnap.docs.map((d) => d.data() as Payout);
  const payoutById = new Map(payouts.map((p) => [p.id, p]));
  const journal = journalSnap.docs.map(
    (d) => ({ ...d.data(), id: d.id }) as Journal,
  );
  const bookingDocs = bookingsSnap.docs.map(
    (d) => ({ ...d.data(), id: d.id }) as RecordData,
  );
  const bookingRefById = new Map<string, string>(
    bookingDocs.map((b) => [
      b.id,
      String(b.confirmationCode ?? b.bookingReference ?? b.id),
    ]),
  );
  const refunds = refundsSnap.docs.map(
    (d) => ({ ...d.data(), id: d.id }) as RecordData,
  );
  const groupedPayments = paymentHistory(journal, bookingDocs, refunds);
  const correctionByPaymentId = new Map(
    corrections.map((c) => [c.paymentId, c]),
  );
  const replacedByReceiptId = new Map<string, string>();
  for (const r of receipts) {
    if (r.replacesId) replacedByReceiptId.set(r.replacesId, r.id);
  }
  const receiptById = new Map(receipts.map((r) => [r.id, r]));

  const activityDocs: OwnerFinanceActivityDoc[] = groupedPayments.map((row) => {
    const sampleJournal = journal.find(
      (j) =>
        j.type === row.type &&
        row.bookingIds.includes(j.bookingId) &&
        (row.type === "payout" ||
        row.type === "dues_payment" ||
        row.type === "dues_correction"
          ? hash([j.type, j.sourcePath]) === row.id
          : j.id === row.id),
    );
    const sourcePath = sampleJournal?.sourcePath ?? "";
    const payoutId =
      row.type === "payout" && sourcePath.startsWith("hotelPayoutsV1/")
        ? sourcePath.slice("hotelPayoutsV1/".length)
        : null;
    const payout = payoutId ? payoutById.get(payoutId) : undefined;
    const receiptId =
      row.type === "dues_payment" &&
      sourcePath.startsWith(`${duesCollections.receipts}/`)
        ? sourcePath.slice(`${duesCollections.receipts}/`.length)
        : row.type === "dues_correction" &&
            sourcePath.startsWith(`${duesCollections.corrections}/`)
          ? sourcePath.slice(`${duesCollections.corrections}/`.length)
          : null;
    const receipt = receiptId ? receiptById.get(receiptId) : undefined;
    const correction = receiptId
      ? correctionByPaymentId.get(receiptId)
      : undefined;

    const occurredAt = row.occurredAt;
    const localDate =
      (row.type === "dues_payment" && receipt?.paymentDate) ||
      (row.type === "payout" && payout?.payment?.paymentDate) ||
      toHotelLocalDate(occurredAt, timezone) ||
      toHotelLocalDate(nowIso, timezone) ||
      "1970-01-01";

    const bookingReferences = row.bookingIds.map((bid) => ({
      bookingId: bid,
      reference: bookingRefById.get(bid) ?? bid,
    }));

    const payoutReference =
      payout?.reference ??
      (payoutId ? `HKP-${payoutId.slice(0, 16).toUpperCase()}` : null);
    const receiptReference =
      receipt?.reference ??
      (receiptId ? `HKD-${receiptId.slice(0, 16).toUpperCase()}` : null);
    const transactionReference =
      receipt?.transactionReference ?? payout?.payment?.reference ?? null;
    const paymentMethod = receipt?.method ?? payout?.payment?.method ?? null;

    const docId = hash([propertyId, row.id]);
    return {
      docId,
      id: row.id,
      propertyId,
      type: row.type,
      typeGroup: activityTypeGroup(row.type),
      title: row.title,
      purpose: row.purpose,
      amountPaise: row.amountPaise,
      occurredAt,
      localDate,
      sortAt: occurredAt ?? `${localDate}T00:00:00.000Z`,
      direction: row.direction,
      status: row.status,
      bookingId: row.bookingId,
      bookingIds: row.bookingIds,
      bookingReferences,
      payoutId,
      payoutReference,
      statementAvailable: row.type === "payout" && !!payoutId,
      receiptId,
      receiptReference,
      paymentMethod,
      transactionReference,
      correctionReason: correction?.reason ?? null,
      replacesReceiptId: receipt?.replacesId ?? null,
      replacedByReceiptId: receiptId
        ? (replacedByReceiptId.get(receiptId) ?? null)
        : null,
      searchTokens: buildSearchTokens([
        row.id,
        payoutReference,
        receiptReference,
        transactionReference,
        ...bookingReferences.flatMap((b) => [b.bookingId, b.reference]),
      ]),
      projectedAt: nowIso,
      projectionVersion: PROJECTION_VERSION,
    };
  });

  const currentActivityIds = new Set(activityDocs.map((a) => a.docId));
  const writes: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];
  for (const a of activityDocs) {
    writes.push((batch) =>
      batch.set(
        db.collection(ownerFinanceCollections.activity).doc(a.docId),
        a,
      ),
    );
  }
  for (const existing of existingActivitySnap.docs) {
    if (!currentActivityIds.has(existing.id)) {
      writes.push((batch) => batch.delete(existing.ref));
    }
  }
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const apply of writes.slice(i, i + 400)) apply(batch);
    await batch.commit();
  }
  await db.runTransaction(async (tx) => {
    const current = await tx.get(overviewRef);
    if ((current.updateTime && overviewBefore.updateTime && current.updateTime.isEqual(overviewBefore.updateTime)) || (!current.exists && !overviewBefore.exists)) {
      tx.set(overviewRef, { activityDirty: false }, { merge: true });
    }
  });
}

/** Ensures dirty booking projections, expired waiting periods, and overview/activity stay current. */
export async function ensureFreshOwnerProjections(
  db: Firestore,
  propertyId: string,
  now = new Date(),
): Promise<OwnerFinanceOverviewDoc> {
  const nowIso = now.toISOString();
  const [overviewSnap, dirtyBookingsSnap, expiredWaitingSnap] =
    await Promise.all([
      db.collection(ownerFinanceCollections.overview).doc(propertyId).get(),
      db
        .collection(ownerFinanceCollections.bookings)
        .where("propertyId", "==", propertyId)
        .where("dirty", "==", true)
        .limit(50)
        .get(),
      db
        .collection(ownerFinanceCollections.bookings)
        .where("propertyId", "==", propertyId)
        .where("waitingPeriodPending", "==", true)
        .where("eligibleAt", "<=", nowIso)
        .limit(50)
        .get(),
    ]);

  const overviewData = overviewSnap.data() as
    | (OwnerFinanceOverviewDoc & { activityDirty?: boolean })
    | undefined;

  if (
    !overviewSnap.exists ||
    (overviewData?.projectionVersion ?? 0) < PROJECTION_VERSION
  ) {
    return rebuildOwnerFinanceProjections(db, propertyId, now);
  }

  const refreshIds = [
    ...new Set([
      ...dirtyBookingsSnap.docs.map((d) => d.id),
      ...expiredWaitingSnap.docs.map((d) => d.id),
    ]),
  ];

  if (overviewData?.activityDirty) {
    await syncOwnerActivityForProperty(db, propertyId, now);
  }

  if (refreshIds.length > 0) {
    await refreshBoundedOwnerBookings(db, propertyId, refreshIds, now);
    const updated = await db
      .collection(ownerFinanceCollections.overview)
      .doc(propertyId)
      .get();
    return updated.data() as OwnerFinanceOverviewDoc;
  }

  if (overviewData?.dirty) {
    // No dirty booking docs left, but overview itself was marked dirty (e.g. payout prepared/cancelled or dirty cleared).
    await refreshBoundedOwnerBookings(db, propertyId, [], now);
    const updated = await db
      .collection(ownerFinanceCollections.overview)
      .doc(propertyId)
      .get();
    return updated.data() as OwnerFinanceOverviewDoc;
  }

  return overviewData as OwnerFinanceOverviewDoc;
}

/** Ensures eligible bookings enrolled in accounting remain cleanly verifiable. */
export function isBookingStateDirty(state: RecordData): boolean {
  return !!state.dirty || !state.processedAt;
}

export function projectionIncludesBooking(
  b: RecordData,
  state: RecordData,
): boolean {
  return eligible(b, state);
}

export function verifyJournalSummaryMatches(
  journal: Journal[],
  state: RecordData,
): boolean {
  try {
    const actual = summary(journal);
    return !state.summary || hash(actual) === hash(state.summary);
  } catch {
    return false;
  }
}
