import {
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";

/** No reads. Source writes, invalidation and outbox are one atomic commit. */
export function enqueueAccounting(
  db: Firestore,
  writer: {
    set(
      ref: FirebaseFirestore.DocumentReference,
      data: FirebaseFirestore.DocumentData,
      options?: FirebaseFirestore.SetOptions,
    ): unknown;
  },
  bookingId: string,
) {
  const outbox = db.collection("projectionOutbox").doc();
  writer.set(outbox, {
    kind: "booking_accounting",
    entityId: bookingId,
    version: 1,
    eventId: outbox.id,
    status: "pending",
    dispatchAttempts: 0,
    recoverable: true,
    nextRecoveryAt: Timestamp.now(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  writer.set(
    db.collection("hotelAccountingStateV1").doc(bookingId),
    {
      dirty: true,
      requestedId: outbox.id,
      requestedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  writer.set(
    db.collection("hotelOwnerFinanceBookingsV1").doc(bookingId),
    {
      bookingId,
      dirty: true,
      isProcessing: true,
      requestedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return outbox.id;
}
