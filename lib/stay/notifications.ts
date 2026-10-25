import "server-only";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
export function enqueueStayNotification(
  tx: FirebaseFirestore.Transaction,
  bookingId: string,
  propertyId: string,
  guestId: string,
  revision: number,
  event: string,
) {
  tx.create(
    adminDb
      .collection("bookingNotificationOutbox")
      .doc(`${bookingId}_stay_${revision}`),
    {
      bookingId,
      propertyId,
      guestId,
      bookingStatus: event,
      status: "pending",
      attempts: 0,
      nextAttemptAt: Timestamp.now(),
      createdAt: FieldValue.serverTimestamp(),
    },
  );
}
