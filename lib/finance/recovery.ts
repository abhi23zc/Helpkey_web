import type { Firestore } from "firebase-admin/firestore";
/** Durable paged sweep. Source integration uses the same idempotent service as live mutations. */
export async function recoverFinance(db: Firestore, assertLeader: () => Promise<void>) {
  const checkpoint = db.doc("financeConfiguration/recovery");
  const saved = await checkpoint.get(), cursor = saved.get("cursor");
  let query = db.collection("bookings").where("accounting.included", "==", true).orderBy("__name__").limit(20);
  if (cursor) query = query.startAfter(cursor);
  const page = await query.get();
  for (const doc of page.docs) {
    await assertLeader();
    await db.runTransaction(async tx => { const b = await tx.get(doc.ref); if (b.get("accounting.included") === true) tx.update(doc.ref, { financeRecognitionRequestedAt: new Date().toISOString() }); });
    await checkpoint.set({ cursor: doc.id, updatedAt: new Date().toISOString() });
  }
  if (page.size < 20) await checkpoint.set({ cursor: null, updatedAt: new Date().toISOString() });
  return { examined: page.size };
}
