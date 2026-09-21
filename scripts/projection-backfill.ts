import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../lib/firebase/admin";

type ProjectionKind = "property_search" | "review_summary" | "daily_metrics" | "dashboard_summary" | "cache_invalidation";
function enqueueProjection(tx: FirebaseFirestore.Transaction, jobKind: ProjectionKind, entityId: string) {
  const version = 1; const ref = adminDb.collection("projectionOutbox").doc();
  tx.create(ref, { kind: jobKind, entityId, version, eventId: ref.id, status: "pending", dispatchAttempts: 0, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run"); const verify = args.has("--verify");
const restart = args.has("--restart");
const kind = (process.argv.find((arg) => arg.startsWith("--kind="))?.split("=")[1] ?? "property_search") as ProjectionKind;
const checkpointRef = adminDb.collection("backfillCheckpoints").doc(`projection_${kind}`);

async function main() {
  if (restart && !dryRun && !verify) await checkpointRef.delete();
  const checkpoint = await checkpointRef.get(); let cursor = String(checkpoint.data()?.lastId ?? ""); let processed = 0; let missing = 0;
  while (true) {
    let query: FirebaseFirestore.Query = adminDb.collection("properties").orderBy("__name__").limit(100);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get(); if (page.empty) break;
    for (const property of page.docs) {
      if (verify) {
        const data = property.data();
        const present = kind === "property_search" ? Boolean(data.searchProjectionVersion) : kind === "review_summary" ? Boolean(data.reviewProjectionUpdatedAt) : kind === "daily_metrics" || kind === "dashboard_summary" ? !(await adminDb.collection("propertyDailyMetrics").where("propertyId", "==", property.id).limit(1).get()).empty : true;
        if (!present) missing += 1;
      }
      else if (!dryRun) await adminDb.runTransaction(async (tx) => enqueueProjection(tx, kind, property.id));
      processed += 1; cursor = property.id;
    }
    if (!dryRun && !verify) await checkpointRef.set({ kind, lastId: cursor, processed: FieldValue.increment(page.size), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    console.info(JSON.stringify({ kind, processed, cursor, dryRun, verify, missing }));
  }
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
