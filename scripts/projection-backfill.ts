import { FieldValue } from "firebase-admin/firestore";
// Scripts run outside Next.js, so use the worker Firebase adapter rather than
// the application module that imports Next's `server-only` marker.
import { db as adminDb } from "../workers/media/firebase";

import { writeProjection } from "../lib/background/enqueue";
import type { ProjectionJob } from "../lib/background/jobs";
type ProjectionKind = ProjectionJob["kind"];
function enqueueProjection(tx: FirebaseFirestore.Transaction, kind: ProjectionKind, entityId: string) { writeProjection(adminDb, tx, kind, entityId); }

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
        const present = kind === "property_search" ? Number(data.searchProjectionVersion ?? 0) >= 3 : kind === "review_summary" ? Boolean(data.reviewProjectionUpdatedAt) : kind === "daily_metrics" || kind === "dashboard_summary" ? !(await adminDb.collection("propertyDailyMetrics").where("propertyId", "==", property.id).limit(1).get()).empty : true;
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
