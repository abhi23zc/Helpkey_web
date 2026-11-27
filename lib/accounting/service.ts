import { paymentHistory } from "./payments";
import "server-only";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../firebase/admin";
import { authorizeFinanceAdmin } from "../finance-settings/service";
import { propertyAccess } from "../partner/pms/access";
import { ApiException } from "../api/errors";
import { unassessedItems } from "../booking-finance/domain";
import { assess, hash, iso } from "./domain";
import {
  cutover,
  eligible,
  journalCollection,
  readEvidence,
  stateCollection,
  summary,
  type Journal,
} from "./posting";
import { enqueueAccounting } from "./enqueue";
import { markOwnerFinanceDirty } from "../finances/projections";

const id = z
  .string()
  .min(1)
  .max(200)
  .refine((v) => !v.includes("/"));
async function authorize(
  uid: string,
  propertyId: string,
  owner: boolean,
  tx: FirebaseFirestore.Transaction,
) {
  id.parse(propertyId);
  if (owner) {
    const access = await propertyAccess(uid, propertyId, "property.manage", tx);
    if (access.role !== "owner")
      throw new ApiException(
        "FORBIDDEN",
        403,
        "Only the hotel owner can view accounting.",
      );
  } else await authorizeFinanceAdmin(uid, tx);
}
export async function accountingHotels(uid: string, after?: string | null) {
  return adminDb.runTransaction(async (tx) => {
    await authorizeFinanceAdmin(uid, tx);
    let query = adminDb.collection("properties").orderBy("__name__").limit(100);
    if (after) query = query.startAfter(id.parse(after));
    const hotels = await tx.get(query);
    return {
      hotels: hotels.docs.map((d) => ({
        id: d.id,
        name: d.get("name") || d.id,
      })),
      nextCursor: hotels.size === 100 ? hotels.docs.at(-1)!.id : null,
    };
  });
}
export async function readAccount(
  uid: string,
  propertyId: string,
  owner = false,
  after?: string | null,
  paymentsAfter?: string | null,
) {
  return adminDb.runTransaction(async (tx) => {
    await authorize(uid, propertyId, owner, tx);
    const [hotel, bookings, events, refunds] = await Promise.all([
      tx.get(adminDb.collection("properties").doc(propertyId)),
      tx.get(
        adminDb.collection("bookings").where("propertyId", "==", propertyId),
      ),
      tx.get(
        adminDb
          .collection(journalCollection)
          .where("propertyId", "==", propertyId),
      ),
      tx.get(
        adminDb.collection("refunds").where("propertyId", "==", propertyId),
      ),
    ]);
    if (!hotel.exists) throw new ApiException("NOT_FOUND", 404);
    const journal = events.docs.map((d) => ({
      ...d.data(),
      id: d.id,
    })) as Journal[];
    const states: FirebaseFirestore.DocumentSnapshot[] = [];
    for (let offset = 0; offset < bookings.size; offset += 100)
      states.push(
        ...(await tx.getAll(
          ...bookings.docs
            .slice(offset, offset + 100)
            .map((d) => adminDb.collection(stateCollection).doc(d.id)),
        )),
      );
    const stateById = new Map(states.map((d) => [d.id, d.data() ?? {}]));
    const historicalIds = bookings.docs
      .filter((d) => !eligible(d.data(), stateById.get(d.id) ?? {}))
      .map((d) => d.id);
    const historicalAgreements = new Set<string>();
    for (let offset = 0; offset < historicalIds.length; offset += 100) {
      const records = await tx.getAll(
        ...historicalIds
          .slice(offset, offset + 100)
          .map((id) =>
            adminDb.collection("bookingFinanceAgreementsV1").doc(id),
          ),
      );
      for (const record of records)
        if (
          record.exists &&
          record.get("bookingId") === record.id &&
          record.get("propertyId") === propertyId
        )
          historicalAgreements.add(record.id);
    }
    const outboxes = new Map<string, FirebaseFirestore.DocumentData>();
    const requestedIds = [
      ...new Set(
        states
          .filter((d) => d.get("dirty") && d.get("requestedId"))
          .map((d) => String(d.get("requestedId"))),
      ),
    ];
    for (let offset = 0; offset < requestedIds.length; offset += 100) {
      const records = await tx.getAll(
        ...requestedIds
          .slice(offset, offset + 100)
          .map((id) => adminDb.collection("projectionOutbox").doc(id)),
      );
      for (const record of records)
        if (record.exists) outboxes.set(record.id, record.data()!);
    }
    const current = summary([]),
      findings: { bookingId: string; message: string }[] = [];
    const positions = bookings.docs.map((d) => {
      const b = d.data(),
        state = stateById.get(d.id) ?? {},
        included = eligible(b, state);
      const rows = journal.filter((e) => e.bookingId === d.id);
      let actual = summary([]),
        invalid = false;
      try {
        actual = summary(rows);
      } catch {
        invalid = true;
        findings.push({
          bookingId: d.id,
          message: "Unbalanced or invalid journal entry.",
        });
      }
      if (rows.some((e) => e.currency !== b.currency)) {
        invalid = true;
        findings.push({
          bookingId: d.id,
          message: "Journal currency differs from booking.",
        });
      }
      const stale =
        included && state.summary && hash(actual) !== hash(state.summary);
      if (stale)
        findings.push({
          bookingId: d.id,
          message: "Cached summary differs from journal.",
        });
      const pending = included && (state.dirty || !state.processedAt);
      const work = outboxes.get(state.requestedId);
      const processingError =
        state.lastError ||
        work?.lastErrorCode ||
        work?.lastErrorMessage ||
        (work && ["dead", "quarantined"].includes(work.status)
          ? "Accounting processing needs retry."
          : null);
      const usable = included && !pending && !invalid && !stale;
      if (usable)
        for (const key of Object.keys(current) as (keyof typeof current)[])
          current[key] += actual[key];
      return {
        bookingId: d.id,
        reference: b.confirmationCode ?? b.bookingReference ?? d.id,
        status: !included
          ? "historical"
          : pending
            ? "processing"
            : invalid || stale
              ? "review"
              : (state.status ?? "pending"),
        summary: usable ? actual : null,
        lastRecordedSummary: actual,
        reasons: !included
          ? [
              historicalAgreements.has(d.id)
                ? "Original agreement available; explicit reconciliation required."
                : "Historical agreement unavailable; excluded from balances.",
            ]
          : (state.reasons ?? []),
        lastError: processingError,
        hasServices: (b.customizations ?? []).some(
          (r: { settlement?: string; quote?: { status?: string } }) =>
            r.settlement !== "included" && r.quote?.status === "accepted",
        ),
        serviceIssues: state.serviceIssues ?? [],
        historicalAgreementAvailable: !included
          ? historicalAgreements.has(d.id)
          : null,
        calculatedCommissionPaise: state.calculatedCommissionPaise ?? null,
        guestOutstandingPaise: state.guestOutstandingPaise ?? null,
        guestTaxPaise: state.guestTaxPaise ?? null,
      };
    });
    for (const event of journal)
      if (!bookings.docs.some((b) => b.id === event.bookingId))
        findings.push({
          bookingId: event.bookingId,
          message: "Journal booking is missing or belongs to another hotel.",
        });
    const transactions = journal.sort(
      (a, b) =>
        (iso(b.recordedAt) ?? "").localeCompare(iso(a.recordedAt) ?? "") ||
        b.id.localeCompare(a.id),
    );
    const offset = after
      ? transactions.findIndex((e) => e.id === after) + 1
      : 0;
    if (after && offset === 0) throw new ApiException("INVALID_CURSOR", 422);
    const payments = paymentHistory(
      journal,
      bookings.docs.map((d) => ({ ...d.data(), id: d.id })),
      refunds.docs.map((d) => ({ ...d.data(), id: d.id })),
    );
    const paymentOffset = paymentsAfter
      ? payments.findIndex((p) => p.id === paymentsAfter) + 1
      : 0;
    if (paymentsAfter && paymentOffset === 0)
      throw new ApiException("INVALID_CURSOR", 422);
    return {
      hotel: { id: propertyId, name: hotel.get("name") || propertyId },
      cutover: cutover(),
      enabled: !!cutover(),
      summary: current,
      positions,
      findings,
      unassessedItems,
      payments: payments.slice(paymentOffset, paymentOffset + 50),
      nextPaymentsCursor:
        payments.length > paymentOffset + 50
          ? payments[paymentOffset + 49].id
          : null,
      transactions: transactions
        .slice(offset, offset + 50)
        .map((e) => ({ ...e, recordedAt: iso(e.recordedAt) })),
      nextCursor:
        transactions.length > offset + 50 ? transactions[offset + 49].id : null,
    };
  });
}
export async function reconcileAccount(uid: string, propertyId: string) {
  id.parse(propertyId);
  const bookingIds = await adminDb.runTransaction(async (tx) => {
    await authorize(uid, propertyId, false, tx);
    return (
      await tx.get(
        adminDb.collection("bookings").where("propertyId", "==", propertyId),
      )
    ).docs.map((d) => d.id);
  });
  const findings: { bookingId: string; message: string }[] = [];
  for (const bookingId of bookingIds)
    await adminDb.runTransaction(async (tx) => {
      await authorize(uid, propertyId, false, tx);
      const {
        booking: b,
        agreement,
        proof,
        sources,
        journal,
        state,
      } = await readEvidence(adminDb, tx, bookingId);
      if (!b || b.propertyId !== propertyId) {
        findings.push({
          bookingId,
          message: "Booking ownership changed during reconciliation.",
        });
        return;
      }
      if (!eligible(b, state)) {
        findings.push({
          bookingId,
          message: agreement
            ? "Historical booking requires explicit reconciliation."
            : "Historical agreement unavailable; excluded.",
        });
        return;
      }
      const expected = assess(bookingId, b, agreement, proof, sources);
      const add = (message: string) => findings.push({ bookingId, message });
      for (const reason of expected.reasons) add(reason);
      for (const effect of expected.effects) {
        const actual = await tx.get(
          adminDb.collection(journalCollection).doc(effect.key),
        );
        if (!actual.exists) add(`Missing entry: ${effect.sourcePath}.`);
        else if (
          actual.get("sourceFingerprint") !== effect.sourceFingerprint ||
          actual.get("bookingId") !== bookingId ||
          actual.get("propertyId") !== propertyId ||
          hash(actual.get("lines")) !== hash(effect.lines)
        )
          add(`Source or ownership mismatch: ${effect.sourcePath}.`);
      }
      for (const event of journal.filter((e) => e.type === "payout")) {
        const payoutId = event.sourcePath.startsWith("hotelPayoutsV1/")
          ? event.sourcePath.slice("hotelPayoutsV1/".length)
          : "";
        if (!payoutId || payoutId.includes("/")) {
          add("Invalid payout source reference.");
          continue;
        }
        const payout = (
          await tx.get(adminDb.collection("hotelPayoutsV1").doc(payoutId))
        ).data();
        const saved = payout?.bookings?.find(
          (b: { bookingId: string }) => b.bookingId === bookingId,
        );
        const { payoutLines } = await import("../payouts/domain");
        const reservation = (
          await tx.get(
            adminDb.collection("hotelPayoutReservationsV1").doc(bookingId),
          )
        ).data();
        if (
          reservation?.status !== "consumed" ||
          reservation.payoutId !== payoutId ||
          reservation.propertyId !== propertyId ||
          reservation.finalPaise !== saved?.finalPaise
        )
          add("Paid booking reservation differs from recorded payment.");
        if (
          !payout ||
          payout.status !== "Paid" ||
          payout.propertyId !== propertyId ||
          !saved ||
          event.id !== hash(["payout", payoutId, bookingId]) ||
          event.sourceFingerprint !== hash([payoutId, saved, payout.payment]) ||
          hash(event.lines) !==
            hash(payoutLines(saved.grossPaise, saved.assessment.items))
        )
          add("Payout journal differs from immutable recorded payment.");
      }
      const { journalFindings, duesCollections } = await import(
        "../dues/journal"
      );
      const [duesReceipts, duesCorrections] = await Promise.all([
        tx.get(
          adminDb
            .collection(duesCollections.receipts)
            .where("propertyId", "==", propertyId),
        ),
        tx.get(
          adminDb
            .collection(duesCollections.corrections)
            .where("propertyId", "==", propertyId),
        ),
      ]);
      for (const reason of journalFindings(
        bookingId,
        propertyId,
        journal,
        duesReceipts.docs.map(
          (d) => d.data() as import("../dues/domain").Receipt,
        ),
        duesCorrections.docs.map(
          (d) => d.data() as import("../dues/domain").Correction,
        ),
      ))
        add(reason);
      const keys = journal
        .filter(
          (e) =>
            ![
              "recognition",
              "recognition_reversal",
              "assessment",
              "review_evidence",
              "payout",
              "dues_payment",
              "dues_correction",
            ].includes(e.type),
        )
        .map((e) => e.key);
      if (new Set(keys).size !== keys.length)
        add("Duplicate source references.");
      const expectedKeys = new Set(expected.effects.map((e) => e.key));
      for (const key of keys)
        if (!expectedKeys.has(key))
          add(`Posted source is no longer supported: ${key}.`);
      if (
        journal.some(
          (e) =>
            e.bookingId !== bookingId ||
            e.propertyId !== propertyId ||
            e.currency !== b.currency,
        )
      )
        add("Incorrect journal ownership or currency.");
      try {
        const actual = summary(journal);
        if (hash(actual) !== hash(state.summary ?? null))
          add("Cached summary differs from journal.");
        const expectedCommission = expected.reasons.length
          ? 0
          : (expected.commissionPaise ?? 0);
        if (actual.earnedCommissionPaise !== expectedCommission)
          add(
            "Recognized commission differs from agreement and checkout evidence.",
          );
        const recognition = journal.find((e) => e.id === state.recognitionId);
        if (
          expected.recognition.length &&
          (!recognition ||
            hash(recognition.lines) !== hash(expected.recognition))
        )
          add("Recognition differs from current source evidence.");
      } catch {
        add("Unbalanced or invalid journal entry.");
      }
      if (state.dirty) add("Accounting processing is pending.");
    });
  const view = await readAccount(uid, propertyId);
  return {
    checkedBookings: bookingIds.length,
    findings: [...findings, ...view.findings],
    checkedAt: new Date().toISOString(),
  };
}
const command = z
  .object({
    action: z.enum(["retry", "reconcile_booking", "rebuild_summary"]),
    bookingId: id,
    requestId: z.string().uuid(),
  })
  .strict();
export async function accountingCommand(
  uid: string,
  propertyId: string,
  raw: unknown,
) {
  const input = command.parse(raw);
  return adminDb.runTransaction(async (tx) => {
    await authorize(uid, propertyId, false, tx);
    const receipt = adminDb
      .collection("hotelAccountingRequestsV1")
      .doc(hash([uid, input.requestId]));
    const existing = await tx.get(receipt);
    if (existing.exists) {
      if (existing.get("fingerprint") !== hash([propertyId, input]))
        throw new ApiException("IDEMPOTENCY_CONFLICT", 409);
      return existing.get("result");
    }
    const evidence = await readEvidence(adminDb, tx, input.bookingId),
      b = evidence.booking;
    if (!b || b.propertyId !== propertyId)
      throw new ApiException("NOT_FOUND", 404);
    const ref = adminDb.collection(stateCollection).doc(input.bookingId);
    if (input.action === "rebuild_summary") {
      tx.set(
        ref,
        {
          summary: summary(evidence.journal),
          propertyId,
          rebuiltAt: FieldValue.serverTimestamp(),
          rebuiltBy: uid,
        },
        { merge: true },
      );
    } else {
      if (!eligible(b, evidence.state) && input.action !== "reconcile_booking")
        throw new ApiException(
          "ACCOUNTING_HISTORICAL",
          409,
          "Use explicit reconciliation for this historical booking.",
        );
      if (input.action === "reconcile_booking") {
        const a = evidence.agreement;
        if (
          !a ||
          a.bookingId !== input.bookingId ||
          a.propertyId !== propertyId
        )
          throw new ApiException(
            "AGREEMENT_REQUIRED",
            409,
            "A reliable original saved agreement is required.",
          );
        tx.set(
          ref,
          {
            enrolledAt: FieldValue.serverTimestamp(),
            enrolledBy: uid,
            propertyId,
          },
          { merge: true },
        );
      }
      enqueueAccounting(adminDb, tx, input.bookingId);
    }
    markOwnerFinanceDirty(adminDb, tx, propertyId, [input.bookingId]);
    const result = { accepted: true, action: input.action };
    tx.create(receipt, {
      fingerprint: hash([propertyId, input]),
      result,
      actorId: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  });
}
