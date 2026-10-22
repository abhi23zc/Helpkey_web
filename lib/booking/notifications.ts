import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { retryDelay } from "@/lib/background/config";
export function enqueueBookingNotification(tx: FirebaseFirestore.Transaction, bookingId: string, propertyId: string, guestId: string, bookingStatus: string) {
  tx.create(adminDb.collection("bookingNotificationOutbox").doc(`${bookingId}_${bookingStatus}`), { bookingId, propertyId, guestId: typeof guestId === "string" ? guestId : "", bookingStatus, status: "pending", attempts: 0, nextAttemptAt: Timestamp.now(), createdAt: FieldValue.serverTimestamp() });
}
export async function processBookingNotifications(recordId?: string) {
  const pending = recordId ? { docs: [await adminDb.collection("bookingNotificationOutbox").doc(recordId).get()], size: 1 } : await adminDb.collection("bookingNotificationOutbox").where("status", "in", ["pending", "retry"]).where("nextAttemptAt", "<=", Timestamp.now()).orderBy("nextAttemptAt").limit(25).get();
  const failures: string[] = [];
  const eligible = pending.docs.filter(doc => !doc.get("backgroundAttention.notifications"));
  for (const document of eligible) {
    try {
      await adminDb.runTransaction(async tx => {
        const event = (await tx.get(document.ref)).data();
        if (!event || event.backgroundAttention?.notifications || !["pending", "retry"].includes(event.status) || event.nextAttemptAt?.toMillis() > Date.now()) return;
        const members = await tx.get(adminDb.collection("propertyMemberships").where("propertyId", "==", event.propertyId).where("status", "==", "active").limit(201));
        if (members.size > 200) throw new Error("NOTIFICATION_FANOUT_LIMIT");
        const recipients = [...new Set<string>([event.guestId, ...members.docs.map(doc => doc.data().userId)].filter(Boolean))];
        const refs = recipients.map(uid => adminDb.collection("notifications").doc(`${document.id}_${uid}`));
        const existing = refs.length ? await tx.getAll(...refs) : [];
        for (const [index, uid] of recipients.entries()) if (!existing[index].exists) tx.create(refs[index], { userId: uid, eventType: `booking.${event.bookingStatus}`, title: `Booking ${String(event.bookingStatus).replaceAll("_", " ")}`, body: "Your reservation has been updated. Open the booking to see the details.", data: { bookingId: event.bookingId, propertyId: event.propertyId }, status: "created", readAt: null, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: "system:bookings", updatedBy: "system:bookings", deletedAt: null });
        tx.update(document.ref, { status: "completed", completedAt: FieldValue.serverTimestamp() });
      });
    } catch (error) {
      failures.push(document.id);
      await adminDb.runTransaction(async tx => {
        const current = (await tx.get(document.ref)).data();
        if (!current || current.status === "completed") return;
        const attempts = Number(current.attempts ?? 0) + 1;
        tx.set(document.ref, { attempts, status: attempts >= 10 ? "dead" : "retry", nextAttemptAt: Timestamp.fromMillis(Date.now() + retryDelay(attempts)), lastError: error instanceof Error ? error.message : "UNKNOWN" }, { merge: true });
      });
    }
  }
  return { examined: eligible.length, failures, hasMore: !recordId && eligible.length === 25 && failures.length === 0 };
}
