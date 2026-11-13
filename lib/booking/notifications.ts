import { customerOwnsBooking } from "@/lib/booking/customer-access";
import { can } from "@/lib/partner/pms/domain";
import { propertyAccess } from "@/lib/partner/pms/access";
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
        const booking = (await tx.get(adminDb.collection("bookings").doc(event.bookingId))).data();
        const permitted = await Promise.all(members.docs.filter(doc => can(doc.get("role"), "reservation.read")).map(async doc => {
          try { const access = await propertyAccess(doc.get("userId"), event.propertyId, "reservation.read", tx); return access.block ? null : doc.get("userId") as string; }
          catch (error) { if (error && typeof error === "object" && "status" in error && error.status === 403) return null; throw error; }
        }));
        const guest = customerOwnsBooking(booking, booking?.guestId) ? booking?.guestId : null;
        const recipients = [...new Set<string>([guest, ...permitted].filter((uid): uid is string => !!uid))];
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
