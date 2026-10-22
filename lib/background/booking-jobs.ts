import { z } from "zod";
import { safeJobId } from "./jobs";
export const bookingKinds = ["expiry", "payments", "refunds", "notifications"] as const;
export type BookingKind = typeof bookingKinds[number];
export const bookingTaskSchema = z.object({
  kind: z.enum(bookingKinds), recordId: z.string().min(1).max(300).refine(id => !id.includes("/")),
  revision: z.number().int().nonnegative(), dueAt: z.number().int().nonnegative(),
}).strict();
export type BookingTask = z.infer<typeof bookingTaskSchema>;
export const bookingCollection = (kind: BookingKind) => kind === "refunds" ? "refunds" : kind === "notifications" ? "bookingNotificationOutbox" : "bookings";
export const bookingQueueName = (kind: BookingKind) => `helpkey-booking-${kind}`;
export function timestampMillis(value: unknown): number | undefined {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
}
export function taskFromRecord(kind: BookingKind, recordId: string, data: Record<string, unknown>): BookingTask | undefined {
  if ((data.backgroundAttention as Record<string, unknown> | undefined)?.[kind]) return;
  const eligible = kind === "expiry" ? data.bookingStatus === "pending_payment"
    : kind === "payments" ? data.paymentReconciliationPending === true
    : kind === "refunds" ? ["pending", "retry", "processing"].includes(String(data.status))
    : ["pending", "retry"].includes(String(data.status));
  let dueAt = timestampMillis(data[kind === "expiry" ? "expiresAt" : kind === "payments" ? "nextReconcileAt" : "nextAttemptAt"]);
  if (kind === "expiry" && dueAt !== undefined) dueAt = Math.max(dueAt, timestampMillis(data.expiryRetryAt) ?? 0);
  if (!eligible || dueAt === undefined) return;
  const revision = Number((data.backgroundRevisions as Record<string, unknown> | undefined)?.[kind] ?? 0);
  return bookingTaskSchema.parse({ kind, recordId, revision, dueAt });
}
export const bookingTaskId = (task: BookingTask) => safeJobId(task.kind, task.recordId, String(task.revision), String(task.dueAt));
