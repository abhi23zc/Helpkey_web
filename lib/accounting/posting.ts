import {
  FieldValue,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import {
  assess,
  assertBalanced,
  hash,
  iso,
  line,
  totals,
  type Effect,
  type Line,
} from "./domain";
import { markOwnerFinanceDirty } from "../finances/projections";
import {
  unassessedItems,
  type Agreement,
  type CheckoutProof,
  type Sources,
} from "../booking-finance/domain";
import type { RecordData } from "../partner/dashboard/domain";

export const journalCollection = "hotelAccountingJournalV1";
export const stateCollection = "hotelAccountingStateV1";
export function cutover() {
  const value = process.env.HOTEL_ACCOUNTING_START_AT;
  if (!value) return null;
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw Error("INVALID_ACCOUNTING_START_DATE");
  const normalized = new Date(value).toISOString();
  if (
    normalized !== (value.length === 20 ? value.replace("Z", ".000Z") : value)
  )
    throw Error("INVALID_ACCOUNTING_START_DATE");
  return normalized;
}
export async function readEvidence(
  db: Firestore,
  tx: Transaction,
  bookingId: string,
) {
  const ref = db.collection("bookings").doc(bookingId),
    agreementRef = db.collection("bookingFinanceAgreementsV1").doc(bookingId);
  const [
    booking,
    agreement,
    proof,
    entries,
    property,
    online,
    refunds,
    events,
    changes,
    journal,
    state,
    services,
  ] = await Promise.all([
    tx.get(ref),
    tx.get(agreementRef),
    tx.get(agreementRef.collection("proofs").doc("checkout")),
    tx.get(ref.collection("billingEntries")),
    tx.get(
      db.collection("propertyPayments").where("bookingId", "==", bookingId),
    ),
    tx.get(
      db.collection("paymentAttempts").where("bookingId", "==", bookingId),
    ),
    tx.get(db.collection("refunds").where("bookingId", "==", bookingId)),
    tx.get(ref.collection("events")),
    tx.get(ref.collection("stayChangeRequests")),
    tx.get(
      db.collection(journalCollection).where("bookingId", "==", bookingId),
    ),
    tx.get(db.collection(stateCollection).doc(bookingId)),
    tx.get(agreementRef.collection("services")),
  ]);
  const rows = (snap: FirebaseFirestore.QuerySnapshot): RecordData[] =>
    snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  return {
    booking: booking.data(),
    agreement: agreement.exists ? (agreement.data() as Agreement) : null,
    proof: proof.exists ? (proof.data() as CheckoutProof) : null,
    sources: {
      entries: rows(entries),
      property: rows(property),
      online: rows(online),
      refunds: rows(refunds),
      events: rows(events),
      changes: rows(changes),
      serviceAgreements: rows(services),
    } as Sources,
    journal: rows(journal) as Journal[],
    state: state.data() ?? {},
  };
}
export type Journal = Effect & {
  id: string;
  bookingId: string;
  propertyId: string;
  currency: string;
  recordedAt: unknown;
  agreementVersion: number | null;
  calculationVersion: number | null;
  globalRevision: number | null;
  hotelRevision: number | null;
};
export function eligible(b: RecordData, state: RecordData) {
  const start = cutover(),
    created = iso(b.createdAt);
  return !!state.enrolledAt || !!(start && created && created >= start);
}
export function summary(events: { lines: Line[] }[]) {
  const a = totals(events);
  return {
    payablePaise: 0 - a.hotel_payable,
    duesPaise: a.hotel_dues,
    pendingOnlinePaise: 0 - a.pending_online,
    pendingHotelPaise: 0 - a.pending_hotel,
    reviewOnlinePaise: 0 - a.review_online,
    reviewHotelPaise: 0 - a.review_hotel,
    earnedCommissionPaise: 0 - a.commission_income,
    unallocatedCommissionPaise: a.commission_unallocated,
  };
}

/** All financial effects and the projection commit together. No provider operations. */
export async function processAccounting(
  db: Firestore,
  bookingId: string,
  beforeWrite?: () => void,
) {
  return db.runTransaction(async (tx) => {
    const evidence = await readEvidence(db, tx, bookingId),
      { booking: b, agreement, proof, sources, state } = evidence;
    const stateRef = db.collection(stateCollection).doc(bookingId);
    if (!b) throw Error("ACCOUNTING_BOOKING_NOT_FOUND");
    if (!eligible(b, state)) {
      tx.set(
        stateRef,
        {
          propertyId: b.propertyId,
          status: "historical",
          dirty: false,
          reasons: [
            agreement
              ? "Original agreement available; explicit reconciliation required."
              : "Historical booking agreement unavailable; excluded from balances.",
          ],
          processedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      markOwnerFinanceDirty(db, tx, b.propertyId, [bookingId], {
        processing: false,
      });
      return;
    }
    const result = assess(bookingId, b, agreement, proof, sources);
    if (result.effects.length > 150)
      throw Error("ACCOUNTING_SOURCE_LIMIT_REQUIRES_REVIEW");
    const existing = result.effects.length
      ? await tx.getAll(
          ...result.effects.map((e) =>
            db.collection(journalCollection).doc(e.key),
          ),
        )
      : [];
    const journal = evidence.journal;
    const additions: Journal[] = [];
    const extraReasons: string[] = [];
    for (let i = 0; i < result.effects.length; i++) {
      const effect = result.effects[i],
        original = existing[i];
      if (original.exists) {
        if (
          original.get("bookingId") !== bookingId ||
          original.get("propertyId") !== b.propertyId ||
          original.get("sourceFingerprint") !== effect.sourceFingerprint ||
          hash(original.get("lines")) !== hash(effect.lines)
        )
          extraReasons.push(
            `Source changed or already belongs to another booking: ${effect.sourcePath}.`,
          );
        continue;
      }
      additions.push({
        ...effect,
        id: effect.key,
        bookingId,
        propertyId: b.propertyId,
        currency: b.currency,
        recordedAt: FieldValue.serverTimestamp(),
        agreementVersion: agreement?.agreementVersion ?? null,
        calculationVersion: agreement?.calculationVersion ?? null,
        globalRevision: agreement?.globalRevision ?? null,
        hotelRevision: agreement?.hotelRevision ?? null,
      });
    }
    const expected = new Set(result.effects.map((e) => e.key));
    if (
      journal.some(
        (e) =>
          ![
            "recognition",
            "recognition_reversal",
            "assessment",
            "review_evidence",
            "payout",
            "dues_payment",
            "dues_correction",
          ].includes(e.type) && !expected.has(e.id),
      )
    )
      extraReasons.push(
        "Previously posted source is missing or no longer supported.",
      );
    if (
      journal.some(
        (e) => e.propertyId !== b.propertyId || e.currency !== b.currency,
      )
    )
      throw Error("ACCOUNTING_JOURNAL_OWNERSHIP_CONFLICT");
    const previous = state.recognitionId
      ? journal.find((e) => e.id === state.recognitionId)
      : null;
    if (state.recognitionId && !previous)
      throw Error("ACCOUNTING_RECOGNITION_ENTRY_MISSING");
    const baseEvents = [
      ...journal,
      ...additions,
      ...(previous
        ? [
            {
              lines: previous.lines.map((l) => ({
                ...l,
                debitPaise: l.creditPaise,
                creditPaise: l.debitPaise,
              })),
            },
          ]
        : []),
    ];
    const base = totals(baseEvents);
    let recognition = result.recognition;
    const reasons = [...new Set([...result.reasons, ...extraReasons])];
    if (extraReasons.length) {
      recognition = [];
      if (base.pending_online < 0)
        recognition.push(
          line("pending_online", -base.pending_online),
          line("review_online", 0, -base.pending_online),
        );
      if (base.pending_hotel < 0)
        recognition.push(
          line("pending_hotel", -base.pending_hotel),
          line("review_hotel", 0, -base.pending_hotel),
        );
    }
    if (
      journal.some((e) => e.type === "payout") &&
      totals([
        ...baseEvents,
        ...(recognition.length ? [{ lines: recognition }] : []),
      ]).hotel_payable > 0
    )
      reasons.push(
        "Debit hotel payable after external payment requires review; no automatic dues or offsets.",
      );
    if (
      journal.some((e) => e.type === "dues_payment") &&
      totals([
        ...baseEvents,
        ...(recognition.length ? [{ lines: recognition }] : []),
      ]).hotel_dues < 0
    )
      reasons.push(
        "Recorded hotel payments exceed current recognized dues; review the booking without allocating money elsewhere.",
      );
    const fingerprint = hash({
      effects: result.effects.map((e) => [e.key, e.sourceFingerprint]),
      recognition,
      reasons,
      status: b.bookingStatus,
      agreement: agreement ? hash(agreement) : null,
      proof: proof ? hash(proof) : null,
      services: sources.serviceAgreements ?? [],
    });
    if (state.fingerprint !== fingerprint || additions.length) {
      const revision = (state.revision ?? 0) + 1;
      const metadata = {
        bookingId,
        propertyId: b.propertyId,
        currency: b.currency,
        recordedAt: FieldValue.serverTimestamp(),
        agreementVersion: agreement?.agreementVersion ?? null,
        calculationVersion: agreement?.calculationVersion ?? null,
        globalRevision: agreement?.globalRevision ?? null,
        hotelRevision: agreement?.hotelRevision ?? null,
      };
      const targetLines = recognition.length
        ? recognition
        : [line("commission_unallocated"), line("commission_income")];
      const monetaryChanged =
        !previous || hash(previous.lines) !== hash(targetLines);
      if (
        previous &&
        monetaryChanged &&
        previous.lines.some((l) => l.debitPaise || l.creditPaise)
      ) {
        const key = hash([bookingId, revision, "recognition_reversal"]);
        additions.push({
          ...metadata,
          id: key,
          key,
          type: "recognition_reversal",
          sourcePath: `${journalCollection}/${previous.id}`,
          sourceFingerprint: hash(previous.lines),
          occurredAt: result.occurredAt,
          amountPaise: previous.amountPaise,
          status: "reversed",
          reverses: previous.id,
          lines: previous.lines.map((l) => ({
            ...l,
            debitPaise: l.creditPaise,
            creditPaise: l.debitPaise,
          })),
        });
      }
      const key = hash([bookingId, revision, "recognition"]);
      // A zero-value assessment records lifecycle evidence without inventing money.
      const sourceReferences = [
        ...new Set([
          `bookings/${bookingId}`,
          ...(agreement ? [`bookingFinanceAgreementsV1/${bookingId}`] : []),
          ...(proof
            ? [`bookingFinanceAgreementsV1/${bookingId}/proofs/checkout`]
            : []),
          ...result.effects.map((e) => e.sourcePath),
          ...(sources.serviceAgreements ?? []).map(
            (s) => `bookingFinanceAgreementsV1/${bookingId}/services/${s.id}`,
          ),
        ]),
      ];
      additions.push({
        ...metadata,
        id: key,
        key,
        type:
          monetaryChanged && recognition.length ? "recognition" : "assessment",
        sourcePath: proof
          ? `bookingFinanceAgreementsV1/${bookingId}/proofs/checkout`
          : agreement
            ? `bookingFinanceAgreementsV1/${bookingId}`
            : `bookings/${bookingId}`,
        sourceFingerprint: fingerprint,
        sourceReferences,
        reviewReasons: reasons,
        unassessedItems,
        guestTaxPassThroughPaise: result.guestTaxPaise,
        occurredAt: result.occurredAt,
        amountPaise: null,
        status: reasons.length
          ? "review"
          : result.status === "recognized"
            ? "recognized"
            : "pending",
        lines: monetaryChanged
          ? targetLines
          : [line("commission_unallocated"), line("commission_income")],
      });
      for (const event of additions) {
        assertBalanced(event.lines);
        tx.create(db.collection(journalCollection).doc(event.id), event);
      }
      tx.set(
        stateRef,
        {
          ...metadata,
          fingerprint,
          revision,
          recognitionId: monetaryChanged ? key : previous!.id,
          summary: summary([...journal, ...additions]),
          status: reasons.length ? "review" : result.status,
          reasons,
          serviceIssues: result.reviewIssues,
          calculatedCommissionPaise: result.calculatedCommissionPaise,
          guestOutstandingPaise: result.guestOutstandingPaise,
          guestTaxPaise: result.guestTaxPaise,
          dirty: false,
          lastError: null,
          processedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } else
      tx.set(
        stateRef,
        {
          dirty: false,
          lastError: null,
          processedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    markOwnerFinanceDirty(db, tx, b.propertyId, [bookingId], {
      processing: false,
      activityDirty: additions.length > 0,
    });
    beforeWrite?.();
  });
}
