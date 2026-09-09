import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "./firebase";

const valid = (data: FirebaseFirestore.DocumentData) => ["publish", "unpublish"].includes(data.operation) && ["property_image", "review_photo"].includes(data.assetType) && ["mediaAssets", "reviewPhotos"].includes(data.sourceCollection) && typeof data.assetId === "string" && typeof data.sourceObjectKey === "string" && typeof data.sourceChecksum === "string";
async function migrate() {
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined, migrated = 0;
  do {
    let query = db.collection("mediaPublicationJobs").orderBy(FieldPath.documentId()).limit(200); if (cursor) query = query.startAfter(cursor);
    const page = await query.get(); cursor = page.docs.at(-1);
    for (const job of page.docs) { const data = job.data(); const expiredProcessing = data.status === "processing" && data.leaseExpiresAt?.toMillis?.() <= Date.now(); if (!valid(data) || !(["queued", "retryable"].includes(data.status) || expiredProcessing)) continue; await db.runTransaction(async (tx) => { tx.set(db.collection("mediaPublicationOutbox").doc(job.id), { operation: data.operation, assetType: data.assetType, assetId: data.assetId, sourceCollection: data.sourceCollection, sourceObjectKey: data.sourceObjectKey, sourceChecksum: data.sourceChecksum, jobId: job.id, bullJobId: `${data.operation}:${data.assetId}:${data.sourceChecksum}`, status: "pending", dispatchedAt: null, dispatchAttempts: 0, lastDispatchError: null, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), migratedFromFirestoreJob: true }, { merge: true }); tx.update(job.ref, { status: "queued", attempts: 0, notBefore: Timestamp.now(), leaseOwner: null, leaseExpiresAt: null, lastErrorCode: null, updatedAt: FieldValue.serverTimestamp() }); }); migrated++; }
  } while (cursor);
  console.log(JSON.stringify({ migrated }));
}
void migrate().catch((error) => { console.error(error); process.exitCode = 1; });
