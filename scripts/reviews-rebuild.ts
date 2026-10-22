import { db } from "../workers/media/firebase";
import { withFencedLease } from "../workers/shared/lease";
import { rebuildReviews } from "../workers/projections/reviews";
import { contribution, applyContribution, emptyTotals, summary, type Totals } from "../lib/background/review-model";
import { reviewRoot } from "../lib/background/review-store";
const args = new Set(process.argv.slice(2)), apply = args.has("--apply"), verify = args.has("--verify");
const value = (name: string) => process.argv.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const project = value("--project"), propertyId = value("--property");
if (!project || project !== (process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)) throw new Error("Pass --project=<configured project> explicitly");
if ([apply, verify, args.has("--dry-run")].filter(Boolean).length !== 1) throw new Error("Choose --apply, --verify or --dry-run");
async function main() {
  const checkpoint = db.collection("backfillCheckpoints").doc("reviews_v2");
  let cursor = apply && !propertyId ? String((await checkpoint.get()).get("lastId") ?? "") : "";
  while (true) {
    let query = db.collection("properties").orderBy("__name__").limit(100); if (cursor) query = query.startAfter(cursor);
    const properties = propertyId ? [await db.collection("properties").doc(propertyId).get()] : (await query.get()).docs;
    if (!properties.length) break;
    for (const property of properties) {
      if (!property.exists) throw new Error("PROPERTY_NOT_FOUND");
      if (apply) await withFencedLease(db, `projection:${property.id}:reviews`, assert => rebuildReviews(property.id, assert));
      else if (verify) {
        const generation = (await db.collection("propertyReviewState").doc(property.id).get()).get("activeGeneration");
        if (!generation) throw new Error(`NOT_REBUILT:${property.id}`);
        let expected = emptyTotals();
        const reviews = await db.collection("propertyReviews").where("propertyId", "==", property.id).get();
        for (const review of reviews.docs) expected = applyContribution(expected, undefined, contribution(review.data()));
        const actual = (await reviewRoot(db, property.id, generation).get()).data() as Totals;
        if (JSON.stringify(summary(expected)) !== JSON.stringify(summary(actual))) throw new Error(`AGGREGATE_MISMATCH:${property.id}`);
      }
      console.info(JSON.stringify({ propertyId: property.id, mode: apply ? "apply" : verify ? "verify" : "dry-run" }));
      if (apply && !propertyId) await checkpoint.set({ lastId: property.id });
    }
    if (propertyId) break;
    cursor = properties.at(-1)!.id;
  }
}
void main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
