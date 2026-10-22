import { Timestamp, type Firestore, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { deliverSnapshots, type DeliveryQueues } from "./delivery";

export function recoveryProgress(value: string | null): Record<string, string> {
  try {
    const data = JSON.parse(value ?? "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) if (["projectionOutbox", "mediaPublicationOutbox", "expiry", "payments", "refunds", "bookingNotificationOutbox"].includes(key) && typeof value === "string") result[key] = value;
    return result;
  } catch { return {}; }
}

export function recoveryQueries(db: Firestore, rebuild = false): { collection: string; kind?: string; query: Query }[] {
  const now = Timestamp.now();
  const due = (query: Query, field: string) => rebuild ? query.orderBy("__name__") : query.where(field, "<=", now).orderBy(field);
  return [
    ...["projectionOutbox", "mediaPublicationOutbox"].map(collection => ({ collection, query: due(db.collection(collection).where("recoverable", "==", true), "nextRecoveryAt") })),
    { collection: "bookings", kind: "expiry", query: due(db.collection("bookings").where("bookingStatus", "==", "pending_payment"), "expiresAt") },
    { collection: "bookings", kind: "payments", query: due(db.collection("bookings").where("paymentReconciliationPending", "==", true), "nextReconcileAt") },
    { collection: "refunds", query: due(db.collection("refunds").where("status", "in", ["pending", "retry", "processing"]), "nextAttemptAt") },
    { collection: "bookingNotificationOutbox", query: due(db.collection("bookingNotificationOutbox").where("status", "in", ["pending", "retry"]), "nextAttemptAt") },
  ];
}

/** A complete sweep uses six empty queries. Returned work adds reads and bounded pages. */
export async function recoverBackground(db: Firestore, queues: DeliveryQueues, options: { rebuild?: boolean; signal?: AbortSignal; assertLeader?: () => Promise<void>; checkpoint?: (category: string, lastId: string | null) => Promise<void>; cursors?: Record<string, string> } = {}) {
  let examined = 0, queryCalls = 0;
  const failures: string[] = [];
  for (const { collection, kind, query } of recoveryQueries(db, options.rebuild)) {
    const category = kind ?? collection;
    let cursor: QueryDocumentSnapshot | undefined;
    const savedId = options.cursors?.[category];
    if (savedId === "__complete__") continue;
    if (savedId) {
      const saved = await db.collection(collection).doc(savedId).get();
      if (saved.exists) cursor = saved as QueryDocumentSnapshot;
    }
    while (!options.signal?.aborted) {
      await options.assertLeader?.();
      const page = await (cursor ? query.startAfter(cursor) : query).limit(100).get();
      queryCalls++; examined += page.size;
      // Per-record isolation prevents invalid payloads or failed queue jobs from starving the page.
      // Property-search events are still grouped by entity inside each bounded page.
      if (["projectionOutbox", "mediaPublicationOutbox"].includes(collection)) {
        try { await deliverSnapshots(db, queues, collection, page.docs); }
        catch (error) { failures.push(category); console.error(JSON.stringify({ event: "recovery.delivery_failed", category, error: error instanceof Error ? error.message : "UNKNOWN" })); }
      } else for (const doc of page.docs) {
        await options.assertLeader?.();
        try { await deliverSnapshots(db, queues, collection, [doc], kind); }
        catch (error) { failures.push(doc.id); console.error(JSON.stringify({ event: "recovery.record_failed", category, id: doc.id, error: error instanceof Error ? error.message : "UNKNOWN" })); }
      }
      cursor = page.docs.at(-1);
      if (!failures.length) await options.checkpoint?.(category, cursor?.id ?? null);
      console.info(JSON.stringify({ event: "background.recovery_page", category, rebuild: !!options.rebuild, queryCalls: 1, documentsFetched: page.size }));
      if (page.size < 100) { if (!failures.length) await options.checkpoint?.(category, null); break; }
    }
    if (options.signal?.aborted) throw new Error("RECOVERY_ABORTED");
  }
  return { examined, queryCalls, failures };
}
