import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { expirePendingBookings } from "@/lib/bookings";
import { processBookingNotifications } from "./notifications";
import { processRefund, reconcilePaymentBatch } from "./processing";
import { bookingCollection, bookingTaskId, taskFromRecord, type BookingTask } from "@/lib/background/booking-jobs";
import { retryDelay } from "@/lib/background/config";

export async function executeBookingTask(task: BookingTask) {
  const ref = adminDb.collection(bookingCollection(task.kind)).doc(task.recordId);
  const before = taskFromRecord(task.kind, task.recordId, (await ref.get()).data() ?? {});
  if (!before || bookingTaskId(before) !== bookingTaskId(task)) return { outcome: "stale", next: before };
  if (before.dueAt > Date.now()) return { outcome: "rescheduled", next: before };
  let failure: unknown;
  try {
    if (task.kind === "expiry") {
      const result = await expirePendingBookings("system:booking-expiry", task.recordId);
      if (result.failures.length) throw new Error("BOOKING_EXPIRY_FAILED");
    } else if (task.kind === "payments") {
      const result = await reconcilePaymentBatch(task.recordId);
      if (result.failures.length) throw new Error("PAYMENT_RECONCILIATION_FAILED");
    } else if (task.kind === "refunds") await processRefund(task.recordId);
    else {
      const result = await processBookingNotifications(task.recordId);
      if (result.failures.length) throw new Error("BOOKING_NOTIFICATION_FAILED");
    }
  } catch (error) { failure = error; }
  // Business retry timestamps are persisted by the financial/notification handlers.
  // Expiry needs its own durable budget. Validation failures before a refund claim
  // also need a visible terminal state instead of an endless rediscovery loop.
  if (failure && (task.kind === "expiry" || task.kind === "refunds" || task.kind === "payments")) {
    await adminDb.runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if (!current || !taskFromRecord(task.kind, task.recordId, current)) return;
      const failures = task.kind === "payments" ? Number(current.reconcileFailures ?? 1) : Number(current.backgroundFailures?.[task.kind] ?? 0) + 1;
      const permanent = failure instanceof Error && /INVALID_REFUND|MISMATCH|EXCEEDS_CAPTURED|REQUEST_CHANGED/.test(failure.message);
      tx.update(ref, { [`backgroundFailures.${task.kind}`]: failures,
        ...(failures >= 6 || permanent ? { [`backgroundAttention.${task.kind}`]: true } : {}),
        ...(task.kind === "expiry" ? { expiryRetryAt: Timestamp.fromMillis(Date.now() + retryDelay(failures)) } : {}),
        lastBackgroundError: failure instanceof Error ? failure.message : "UNKNOWN", updatedAt: FieldValue.serverTimestamp() });
    });
  }
  const data = (await ref.get()).data() ?? {};
  const next = taskFromRecord(task.kind, task.recordId, data);
  if (task.kind === "expiry" && next && data.expiryRetryAt?.toMillis() > Date.now()) next.dueAt = Math.max(next.dueAt, data.expiryRetryAt.toMillis());
  return { outcome: next ? "rescheduled" : failure ? "attention" : "completed", next };
}
