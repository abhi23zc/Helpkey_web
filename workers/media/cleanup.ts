import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "./firebase";
import { deletePrivateObject } from "./r2";

async function cleanup() {
  const expired = await db.collection("pendingUploads").where("expiresAt", "<=", Date.now()).limit(100).get();
  let objectsDeleted = 0, failures = 0;
  for (const upload of expired.docs) try { const key = upload.data().objectKey; if (typeof key === "string") { await deletePrivateObject(key); objectsDeleted++; } await upload.ref.delete(); } catch { failures++; }
  // Only legacy Firestore leases have leaseExpiresAt. BullMQ owns live job recovery.
  let recoveredLeases = 0;
  try {
    const leases = await db.collection("mediaPublicationJobs").where("status", "==", "processing").where("leaseExpiresAt", "<=", Timestamp.now()).limit(100).get();
    for (const lease of leases.docs) await db.runTransaction(async (tx) => { const current = await tx.get(lease.ref), data = current.data(); if (!data) return; tx.update(lease.ref, { status: "queued", leaseOwner: null, leaseExpiresAt: null, lastErrorCode: null, updatedAt: FieldValue.serverTimestamp() }); tx.set(db.collection("mediaPublicationOutbox").doc(lease.id), { operation: data.operation, assetType: data.assetType, assetId: data.assetId, sourceCollection: data.sourceCollection, sourceObjectKey: data.sourceObjectKey, sourceChecksum: data.sourceChecksum, jobId: lease.id, bullJobId: `${data.operation}:${data.assetId}:${data.sourceChecksum}`, status: "pending", dispatchedAt: null, dispatchAttempts: 0, lastDispatchError: null, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); });
    recoveredLeases = leases.size;
  } catch (error) {
    // This is legacy recovery only; a missing index must not restart the entire
    // cleanup container or prevent expired private-upload cleanup.
    console.error("legacy media lease recovery skipped", error);
  }
  console.log(JSON.stringify({ pendingUploadsDeleted: expired.size - failures, objectsDeleted, cleanupFailures: failures, expiredLegacyLeasesRecovered: recoveredLeases }));
}
void cleanup().catch((error) => { console.error(error); process.exitCode = 1; });
