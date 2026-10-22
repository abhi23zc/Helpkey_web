import { UnrecoverableError } from "bullmq";
import { randomUUID } from "node:crypto";
import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { db } from "../media/firebase";
import { syncContribution, reviewRoot, publishTotals } from "../../lib/background/review-store";
import { emptyTotals, type Totals } from "../../lib/background/review-model";
import { LeaseBusy } from "../shared/outbox";

/** Checkpointed shadow rebuild. Active summaries remain readable until fenced cutover. */
export async function rebuildReviews(propertyId: string, assert: (tx: Transaction) => Promise<void>) {
  if (!(await db.collection("properties").doc(propertyId).get()).exists) throw new UnrecoverableError("PROPERTY_NOT_FOUND");
  const stateRef = db.collection("propertyReviewState").doc(propertyId);
  const initial = (await stateRef.get()).data() ?? {};
  const generation = initial.buildingGeneration ?? randomUUID();
  let cursor = initial.buildCursor ?? "";
  const revision = initial.buildRevision ?? initial.requestedRevision ?? 0;
  await db.runTransaction(async tx => { await assert(tx); tx.set(stateRef, { buildingGeneration: generation, buildCursor: cursor, buildRevision: revision }, { merge: true }); });
  while (true) {
    let query = db.collection("propertyReviews").where("propertyId", "==", propertyId).orderBy("__name__").limit(100);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    for (const review of page.docs) {
      const rating = review.get("rating");
      if (review.get("status") === "approved" && (!Number.isInteger(rating) || rating < 1 || rating > 5)) console.error(JSON.stringify({ event: "review.invalid_rating", propertyId, reviewId: review.id }));
      await syncContribution(db, propertyId, review.id, generation, assert, false);
    }
    if (page.empty) break;
    cursor = page.docs.at(-1)!.id;
    await db.runTransaction(async tx => { await assert(tx); tx.set(stateRef, { buildCursor: cursor }, { merge: true }); });
  }
  await db.runTransaction(async tx => {
    await assert(tx);
    const [state, totals, property] = await Promise.all([tx.get(stateRef), tx.get(reviewRoot(db, propertyId, generation)), tx.get(db.collection("properties").doc(propertyId))]);
    if (!property.exists) throw new UnrecoverableError("PROPERTY_NOT_FOUND");
    if ((state.data()?.requestedRevision ?? 0) !== revision) {
      // Restart a fresh generation; never publish a partially outdated snapshot.
      tx.set(stateRef, { buildingGeneration: FieldValue.delete(), buildCursor: FieldValue.delete(), buildRevision: FieldValue.delete() }, { merge: true });
      return;
    }
    publishTotals(db, tx, propertyId, generation, totals.exists ? totals.data() as Totals : emptyTotals());
    tx.set(stateRef, { activeGeneration: generation, buildingGeneration: FieldValue.delete(), buildCursor: FieldValue.delete(), buildRevision: FieldValue.delete(), rebuiltAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  if ((await stateRef.get()).data()?.activeGeneration !== generation) throw new LeaseBusy();
}
export async function updateReviews(propertyId: string, reviewId: string | undefined, assert: (tx: Transaction) => Promise<void>) {
  const state = (await db.collection("propertyReviewState").doc(propertyId).get()).data();
  if (!reviewId || !state?.activeGeneration) return rebuildReviews(propertyId, assert);
  await syncContribution(db, propertyId, reviewId, state.activeGeneration, assert, true);
}
