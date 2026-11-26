import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { RecordData } from "@/lib/partner/dashboard/domain";
/** Reserve refunds against individual captures; never use one payment ID for aggregate money. */
export async function prepareCancellationReceipts(
  tx: FirebaseFirestore.Transaction,
  id: string,
  b: RecordData,
) {
  if (!b.editPolicy) return null;
  const [captures, refunds] = await Promise.all([
    tx.get(adminDb.collection("paymentAttempts").where("bookingId", "==", id)),
    tx.get(adminDb.collection("refunds").where("bookingId", "==", id)),
  ]);
  return (requested: number, reason: string) => {
    let remaining = requested;
    for (const doc of captures.docs) {
      const receipt = doc.data();
      if (
        receipt.stayQuote ||
        receipt.unusable ||
        !["captured", "refund_pending", "refunded"].includes(receipt.status)
      )
        continue;
      const reserved = refunds.docs
        .filter(
          (r) =>
            r.get("paymentId") === receipt.paymentId &&
            r.get("status") !== "failed",
        )
        .reduce((n, r) => n + r.get("amountPaise"), 0);
      const available = Math.max(0, receipt.amountPaise - reserved);
      const amountPaise = Math.min(remaining, available);
      if (amountPaise > 0)
        tx.create(
          adminDb
            .collection("refunds")
            .doc(`${id}_${receipt.paymentId}_cancellation`),
          {
            bookingId: id,
            propertyId: b.propertyId,
            paymentId: receipt.paymentId,
            amountPaise,
            status: "pending",
            reason,
            nextAttemptAt: Timestamp.now(),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
        );
      remaining -= amountPaise;
      if (!remaining) break;
    }
    if (remaining) throw new Error("REFUND_EVIDENCE_INCOMPLETE");
  };
}
