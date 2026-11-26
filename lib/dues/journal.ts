import { hash } from "../accounting/domain";
import type { Journal } from "../accounting/posting";
import {
  correctionEventId,
  correctionLines,
  receiptEventId,
  receiptLines,
  type Receipt,
  type Correction,
} from "./domain";
export const duesCollections = {
  receipts: "hotelDuesPaymentsV1",
  corrections: "hotelDuesCorrectionsV1",
  references: "hotelDuesReferencesV1",
  confirmations: "hotelDuesConfirmationsV1",
  requests: "hotelDuesRequestsV1",
};
export function receiptJournal(receipt: Receipt, bookingId: string) {
  const allocation = receipt.allocations.find((a) => a.bookingId === bookingId);
  if (!allocation) throw Error("Receipt allocation missing.");
  const key = receiptEventId(receipt.id, bookingId);
  return {
    id: key,
    key,
    bookingId,
    propertyId: receipt.propertyId,
    currency: "INR",
    type: "dues_payment",
    sourcePath: `${duesCollections.receipts}/${receipt.id}`,
    sourceFingerprint: hash([receipt, allocation]),
    recordedAt: receipt.recordedAt,
    occurredAt: `${receipt.paymentDate}T00:00:00Z`,
    amountPaise: allocation.amountPaise,
    status: "recognized" as const,
    lines: receiptLines(allocation.amountPaise),
    agreementVersion: null,
    calculationVersion: null,
    globalRevision: null,
    hotelRevision: null,
  };
}
export function correctionJournal(
  receipt: Receipt,
  correction: Correction,
  bookingId: string,
) {
  const original = receiptJournal(receipt, bookingId),
    key = correctionEventId(receipt.id, bookingId);
  return {
    ...original,
    id: key,
    key,
    type: "dues_correction",
    sourcePath: `${duesCollections.corrections}/${correction.id}`,
    sourceFingerprint: hash([receipt, correction, bookingId]),
    recordedAt: correction.recordedAt,
    occurredAt: correction.recordedAt,
    reverses: original.id,
    status: "reversed" as const,
    lines: correctionLines(original.amountPaise),
  };
}
export function journalFindings(
  bookingId: string,
  propertyId: string,
  journal: Journal[],
  receipts: Receipt[],
  corrections: Correction[],
) {
  const reasons: string[] = [],
    expected = new Map<string, Journal>();
  for (const receipt of receipts.filter((r) =>
    r.allocations.some((a) => a.bookingId === bookingId),
  )) {
    try {
      if (
        receipt.propertyId !== propertyId ||
        receipt.allocations.reduce((n, a) => n + a.amountPaise, 0) !==
          receipt.amountPaise ||
        receipt.allocations.some(
          (a) => !Number.isSafeInteger(a.amountPaise) || a.amountPaise <= 0,
        ) ||
        new Set(receipt.allocations.map((a) => a.bookingId)).size !==
          receipt.allocations.length
      )
        throw Error("Invalid receipt.");
      const event = receiptJournal(receipt, bookingId);
      expected.set(event.id, event);
      const correction = corrections.find((c) => c.paymentId === receipt.id);
      if (correction) {
        if (
          correction.id !== receipt.id ||
          correction.propertyId !== propertyId ||
          correction.receiptFingerprint !== hash(receipt)
        )
          throw Error("Invalid correction.");
        const reversal = correctionJournal(receipt, correction, bookingId);
        expected.set(reversal.id, reversal);
      }
    } catch {
      reasons.push(
        "A recorded hotel payment or correction needs reconciliation.",
      );
    }
  }
  for (const [id, event] of expected) {
    const posted = journal.find((j) => j.id === id);
    if (
      !posted ||
      posted.sourcePath !== event.sourcePath ||
      posted.sourceFingerprint !== event.sourceFingerprint ||
      posted.propertyId !== propertyId ||
      posted.currency !== "INR" ||
      posted.bookingId !== bookingId ||
      posted.type !== event.type ||
      posted.key !== id ||
      hash(posted.lines) !== hash(event.lines) ||
      (posted.reverses ?? null) !==
        ("reverses" in event ? event.reverses : null)
    )
      reasons.push(
        "The journal differs from a recorded hotel payment or correction.",
      );
  }
  if (
    journal.some(
      (j) =>
        ["dues_payment", "dues_correction"].includes(j.type) &&
        !expected.has(j.id),
    )
  )
    reasons.push(
      "A hotel payment journal entry has no matching permanent record.",
    );
  return [...new Set(reasons)];
}
