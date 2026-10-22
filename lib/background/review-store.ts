import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { contribution, applyContribution, emptyTotals, summary, utcDay, type Contribution, type Totals, period } from "./review-model";
export const reviewRoot = (db: Firestore, propertyId: string, generation: string) => db.collection("propertyReviewAggregates").doc(propertyId).collection("generations").doc(generation);
export async function syncContribution(db: Firestore, propertyId: string, reviewId: string, generation: string, assert: (tx: Transaction) => Promise<void>, publish: boolean) {
  const root = reviewRoot(db, propertyId, generation), reviewRef = db.collection("propertyReviews").doc(reviewId), applied = root.collection("contributions").doc(reviewId);
  await db.runTransaction(async tx => {
    await assert(tx);
    const [review, previous, aggregate, state] = await Promise.all([tx.get(reviewRef), tx.get(applied), tx.get(root), tx.get(db.collection("propertyReviewState").doc(propertyId))]);
    if (!(await tx.get(db.collection("properties").doc(propertyId))).exists) return;
    const raw = review.data();
    if (raw && raw.propertyId !== propertyId) throw new Error("REVIEW_PROPERTY_MISMATCH");
    const next = contribution(raw), old = previous.data() as Contribution | undefined;
    if (old && old.active === next.active && old.rating === next.rating && old.time === next.time && old.awaiting === next.awaiting && old.withPhotos === next.withPhotos && JSON.stringify(old.topics) === JSON.stringify(next.topics)) return;
    const days = [...new Set([...(old?.active ? [utcDay(old.time)] : []), ...(next.active ? [utcDay(next.time)] : [])])];
    const dayDocs = await Promise.all(days.map(day => tx.get(root.collection("days").doc(day))));
    const totals = applyContribution(aggregate.data() as Partial<Totals> | undefined, old, next);
    const now = FieldValue.serverTimestamp();
    if (raw) {
      const derived = { replyState: typeof raw.partnerReply?.text === "string" && raw.partnerReply.text.trim() ? "replied" : "awaiting", sentiment: Number(raw.rating) >= 4 ? "positive" : Number(raw.rating) <= 2 ? "critical" : "neutral", hasPhotos: Array.isArray(raw.photoIds) && raw.photoIds.length > 0 };
      if (raw.replyState !== derived.replyState || raw.sentiment !== derived.sentiment || raw.hasPhotos !== derived.hasPhotos) tx.update(reviewRef, derived);
    }
    tx.set(root, { ...totals, updatedAt: now }, { merge: true }); tx.set(applied, next);
    for (const [index, day] of days.entries()) {
      const before = old?.active && utcDay(old.time) === day ? old : undefined;
      const after = next.active && utcDay(next.time) === day ? next : contribution();
      tx.set(dayDocs[index].ref, { ...applyContribution(dayDocs[index].data() as Partial<Totals> | undefined, before, after), day });
    }
    if (publish && state.data()?.activeGeneration === generation) publishTotals(db, tx, propertyId, generation, totals);
  });
}
export function publishTotals(db: Firestore, tx: Transaction, propertyId: string, generation: string, totals: Totals) {
  const value = summary(totals), now = FieldValue.serverTimestamp();
  tx.set(db.collection("properties").doc(propertyId), { reviewSummary: value, ratingCount: value.count, ratingAverage: value.average, reviewProjectionUpdatedAt: now }, { merge: true });
  tx.set(db.collection("propertyReviewMetrics").doc(propertyId), { ...totals, ...value, propertyId, generation, topics: Object.entries(totals.topicCounts).filter(([, count]) => count > 0).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count), updatedAt: now }, { merge: true });
}
/** Exact rolling windows: complete UTC days plus only partial boundary days. */
export async function rollingPeriods(db: Firestore, propertyId: string, generation: string, now = Date.now(), ranges: number[] = [7, 30, 90]) {
  const root = reviewRoot(db, propertyId, generation), start = now - Math.max(...ranges) * 2 * 86_400_000;
  const daily = await root.collection("days").where("day", ">=", utcDay(start)).where("day", "<=", utcDay(now)).get();
  const boundaries = [...new Set([now, ...ranges.flatMap(days => [days, days * 2]).map(days => now - days * 86_400_000)].map(utcDay))];
  const partial = new Map<string, Contribution[]>();
  for (const day of boundaries) {
    const from = Date.parse(`${day}T00:00:00Z`);
    const docs = await root.collection("contributions").where("time", ">=", from).where("time", "<", from + 86_400_000).get();
    partial.set(day, docs.docs.map(doc => doc.data() as Contribution));
  }
  const summarize = (from: number, to: number) => {
    let total = emptyTotals();
    for (const doc of daily.docs) {
      const day = doc.id, midnight = Date.parse(`${day}T00:00:00Z`);
      if (midnight >= from && midnight + 86_400_000 <= to) {
        const data = doc.data() as Totals;
        total.count += data.count; total.ratingSum += data.ratingSum; total.awaiting += data.awaiting; total.withPhotos += data.withPhotos;
      } else if (midnight < to && midnight + 86_400_000 > from) {
        for (const value of partial.get(day) ?? []) if (value.active && value.time >= from && value.time < to) total = applyContribution(total, undefined, value);
      }
    }
    return period(total);
  };
  return Object.fromEntries(ranges.map(days => [String(days), { current: summarize(now - days * 86_400_000, now + 1), previous: summarize(now - days * 2 * 86_400_000, now - days * 86_400_000) }]));
}
