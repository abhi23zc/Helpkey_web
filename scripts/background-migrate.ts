import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../workers/media/firebase";
import { safeJobId, projectionSchema, publicationSchema } from "../lib/background/jobs";
import { writePublication } from "../lib/background/publication";
const args = new Set(process.argv.slice(2)), apply = args.has("--apply");
const project = process.argv.find(value => value.startsWith("--project="))?.slice(10);
const configured = process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
if (!project || project !== configured) throw new Error("Pass --project=<configured project> explicitly");
if (apply === args.has("--dry-run")) throw new Error("Choose exactly one of --dry-run or --apply");
async function main() {
  const counts: Record<string, number> = {};
  for (const collection of ["projectionOutbox", "mediaPublicationOutbox", "refunds", "bookingNotificationOutbox", "bookings"]) {
    const checkpoint = db.collection("backfillCheckpoints").doc(`background_v3_${collection}`);
    if (apply && args.has("--restart")) await checkpoint.delete();
    let cursor = apply ? String((await checkpoint.get()).get("lastId") ?? "") : "";
    counts[collection] = 0;
    while (true) {
      let query = db.collection(collection).orderBy("__name__").limit(100); if (cursor) query = query.startAfter(cursor);
      const page = await query.get(); if (page.empty) break;
      for (const document of page.docs) {
        const raw = document.data();
        if (["completed", "succeeded", "dead", "failed", "attention", "quarantined", "retried"].includes(raw.status)) continue;
        if (collection === "bookings") {
          if (!raw.paymentReconciliationPending || raw.nextReconcileAt) continue;
          counts[collection]++;
          if (apply) await db.runTransaction(async tx => {
            const current = (await tx.get(document.ref)).data();
            if (current?.paymentReconciliationPending && !current.nextReconcileAt) tx.update(document.ref, { nextReconcileAt: current.leaseExpiresAt ?? Timestamp.now() });
          });
        } else if (collection === "refunds" || collection === "bookingNotificationOutbox") {
          if (raw.nextAttemptAt) continue;
          counts[collection]++;
          if (apply) await db.runTransaction(async tx => {
            const current = (await tx.get(document.ref)).data();
            if (current && !current.nextAttemptAt && !["completed", "processed", "failed", "dead", "attention"].includes(current.status)) tx.update(document.ref, { nextAttemptAt: current.leaseExpiresAt ?? Timestamp.now() });
          });
        } else {
          if (raw.recoverable !== undefined) continue;
          counts[collection]++;
          if (!apply) continue;
          await db.runTransaction(async tx => {
            const data = (await tx.get(document.ref)).data(); if (!data || data.recoverable !== undefined) return;
            const mirrorCollection = collection === "mediaPublicationOutbox" ? "mediaPublicationJobs" : "projectionJobs";
            const mirrorIds = [...new Set([data.jobId, data.bullJobId, document.id].filter((id): id is string => typeof id === "string" && !!id && !id.includes("/")))];
            const mirrors = await tx.getAll(...mirrorIds.map(id => db.collection(mirrorCollection).doc(id)));
            if (mirrors.some(mirror => ["dead", "failed", "quarantined"].includes(mirror.get("status"))) || Number(data.attempts ?? 0) >= 6) {
              tx.set(document.ref, { status: "dead", recoverable: false, migratedAt: FieldValue.serverTimestamp() }, { merge: true }); return;
            }
            if (collection === "mediaPublicationOutbox") {
              const value = publicationSchema.parse(data);
              const asset = (await tx.get(db.collection(value.sourceCollection).doc(value.assetId))).data();
              if (!asset) { tx.set(document.ref, { status: "completed", recoverable: false }, { merge: true }); return; }
              if (!value.requestId) {
                if (asset.publication?.requestId) { tx.set(document.ref, { status: "completed", recoverable: false }, { merge: true }); return; }
                const correctState = value.operation === "publish" ? asset.publication?.status === "published" : asset.publication?.status === "private";
                if (!correctState && Number(data.attempts ?? 0) < 6) writePublication(db, tx, { operation: (asset.moderationStatus ?? asset.status) === "approved" ? "publish" : "unpublish", assetType: value.assetType, assetId: value.assetId, sourceCollection: value.sourceCollection, sourceObjectKey: asset.r2ObjectKey, sourceChecksum: asset.checksum });
                tx.set(document.ref, { status: "completed", recoverable: false, migratedAt: FieldValue.serverTimestamp() }, { merge: true }); return;
              }
            } else projectionSchema.parse({ ...data, eventId: document.id });
            tx.set(document.ref, { recoverable: true, nextRecoveryAt: Timestamp.now(), ...(collection === "mediaPublicationOutbox" ? { bullJobId: safeJobId("media", document.id) } : {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          });
        }
      }
      cursor = page.docs.at(-1)!.id;
      if (apply) await checkpoint.set({ lastId: cursor, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
  console.info(JSON.stringify({ mode: apply ? "apply" : "dry-run", counts }));
}
void main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
