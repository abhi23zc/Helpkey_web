import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp, type Firestore, type Transaction } from "firebase-admin/firestore";
import { safeJobId, type PublicationJob } from "./jobs";
export type PublicationInput = Omit<PublicationJob, "requestId" | "jobId">;
export function writePublication(db: Firestore, tx: Transaction, input: PublicationInput) {
  const requestId = randomUUID(), id = safeJobId("publication", input.operation, input.assetId, input.sourceChecksum, requestId), now = FieldValue.serverTimestamp();
  const data = { ...input, requestId, jobId: id };
  tx.set(db.collection("mediaPublicationJobs").doc(id), { ...data, status: "queued", attempts: 0, createdAt: now, updatedAt: now });
  tx.set(db.collection("mediaPublicationOutbox").doc(id), { ...data, bullJobId: safeJobId("media", id), status: "pending", attempts: 0, dispatchAttempts: 0, recoverable: true, nextRecoveryAt: Timestamp.now(), createdAt: now, updatedAt: now });
  // Retain the previous variants until the worker has safely replaced/removed them.
  tx.set(db.collection(input.sourceCollection).doc(input.assetId), { publication: { requestId, status: input.operation === "publish" ? "queued" : "unpublishing", sourceChecksum: input.sourceChecksum, attempts: 0, lastErrorCode: null, queuedAt: now, updatedAt: now } }, { merge: true });
  return id;
}
