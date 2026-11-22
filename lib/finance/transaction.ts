import type { Firestore, Transaction, DocumentReference } from "firebase-admin/firestore";
export type BufferedWrite = { method: "create" | "set" | "update" | "delete"; ref: DocumentReference; data: FirebaseFirestore.DocumentData; rest: unknown[] };
/** Buffer source and finance writes together: all SDK reads finish before any SDK write. */
export async function financeTransaction<T>(db: Firestore, target: Transaction, callback: (tx: Transaction) => Promise<T>) {
  const writes: BufferedWrite[] = [];
  const tx = new Proxy(target, { get(object, key) {
    if (["create", "set", "update", "delete"].includes(String(key))) return (ref: DocumentReference, data: FirebaseFirestore.DocumentData = {}, ...rest: unknown[]) => {
      // Field-path overloads are forwarded, but accounting source writes require object patches.
      writes.push({ method: key as BufferedWrite["method"], ref, data, rest }); return tx;
    };
    const value = Reflect.get(object, key); return typeof value === "function" ? value.bind(object) : value;
  } });
  const result = await callback(tx);
  const sourceWrites = writes.slice();
  if (sourceWrites.some(w => ["bookings", "paymentAttempts", "propertyPayments", "refunds"].includes(w.ref.path.split("/")[0]))) {
    const { integrateFinanceSources } = await import("./source-integration");
    await integrateFinanceSources(db, tx, sourceWrites);
  }
  for (const w of writes) Reflect.apply(Reflect.get(target, w.method), target, w.method === "delete" ? [w.ref, ...w.rest] : [w.ref, w.data, ...w.rest]);
  return result;
}
