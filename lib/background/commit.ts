import { FieldValue, type Firestore, type DocumentReference, type Transaction, type WriteBatch } from "firebase-admin/firestore";
import { backgroundMode } from "./config";
export type DeliveryRecord = { collection: string; id: string };
export type Delivery = (db: Firestore, records: DeliveryRecord[]) => Promise<void>;
const adapters = new WeakMap<Firestore, Firestore>();

/** Explicit SDK adapter: only transaction/batch writers are proxied; the SDK itself is never patched. */
export function withBackgroundDelivery(db: Firestore, delivery?: Delivery): Firestore {
  if (!delivery && adapters.has(db)) return adapters.get(db)!;
  async function deliver(records: Map<string, DeliveryRecord>) {
    if (!records.size || backgroundMode() === "legacy") return;
    try {
      const send = delivery ?? (await import("./delivery")).deliverRecords;
      await send(db, [...records.values()]);
    } catch (error) {
      // The Firestore commit already succeeded. Never misreport it as a failed mutation.
      console.error(JSON.stringify({ event: "background.delivery_deferred", count: records.size, error: error instanceof Error ? error.message : "UNKNOWN" }));
    }
  }
  function writer<T extends Transaction | WriteBatch>(target: T, records: Map<string, DeliveryRecord>): T {
    const proxy: T = new Proxy(target, { get(object, key) {
      if (key === "commit" && "commit" in object) return async () => { const result = await object.commit(); await deliver(records); return result; };
      if (["set", "create", "update"].includes(String(key))) return (ref: DocumentReference, value: unknown, ...rest: unknown[]) => {
        let data = value;
        const [collection, id, child] = ref.path.split("/");
        if (!child && value && typeof value === "object" && !Array.isArray(value)) {
          const input = value as Record<string, unknown>;
          const kinds: string[] = [];
          if (collection === "bookings" && !input.leaseOwner) {
            if (input.expiresAt !== undefined || input.expiryRetryAt !== undefined) kinds.push("expiry");
            if (input.nextReconcileAt !== undefined || input.paymentReconciliationPending === true) kinds.push("payments");
          }
          if (collection === "refunds" && !input.leaseOwner && input.nextAttemptAt !== undefined) kinds.push("refunds");
          if (collection === "bookingNotificationOutbox" && input.nextAttemptAt !== undefined) kinds.push("notifications");
          if (kinds.length && backgroundMode() !== "legacy") {
            // All callers use merge-set or update for existing records. Separate task revisions
            // prevent payment rescheduling from invalidating a still-valid expiry timer.
            const revisions = Object.fromEntries(kinds.map(kind => [kind, FieldValue.increment(1)]));
            data = String(key) === "update" ? { ...input, ...Object.fromEntries(kinds.map(kind => [`backgroundRevisions.${kind}`, revisions[kind]])) }
              : { ...input, backgroundRevisions: { ...input.backgroundRevisions as object, ...revisions } };
          }
          if (kinds.length || (["projectionOutbox", "mediaPublicationOutbox"].includes(collection) && input.status === "pending")) records.set(ref.path, { collection, id });
        }
        const result = Reflect.apply(Reflect.get(object, key) as (...args: unknown[]) => unknown, object, [ref, data, ...rest]);
        return result === object ? proxy : result;
      };
      const value = Reflect.get(object, key);
      return typeof value === "function" ? value.bind(object) : value;
    } });
    return proxy;
  }
  const proxy = new Proxy(db, { get(target, key) {
    if (key === "runTransaction") return async <T>(callback: (tx: Transaction) => Promise<T>, options?: FirebaseFirestore.ReadWriteTransactionOptions) => {
      const committed = await target.runTransaction(async tx => {
        // Each SDK retry owns a fresh collection; only the committed callback's records escape.
        const records = new Map<string, DeliveryRecord>();
        const value = await callback(writer(tx, records));
        return { value, records };
      }, options);
      await deliver(committed.records); return committed.value;
    };
    if (key === "batch") return () => {
      const batch = target.batch(), records = new Map<string, DeliveryRecord>();
      return writer(batch, records);
    };
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  if (!delivery) adapters.set(db, proxy);
  return proxy;
}
