import { FieldValue } from "firebase-admin/firestore";
import { db } from "./firebase";
import { connection, mediaQueue, type PublicationJob } from "./queue";

const redis = connection(), queue = mediaQueue(redis);
async function dispatchOnce() {
  const pending = await db.collection("mediaPublicationOutbox").where("status", "==", "pending").limit(50).get();
  for (const item of pending.docs) {
    const data = item.data() as PublicationJob & { jobId?: string; bullJobId?: string };
    if (!data.jobId || !data.bullJobId || !data.operation || !data.assetId || !data.sourceChecksum) continue;
    try {
      const existing = await queue.getJob(data.bullJobId);
      if (existing && await existing.isFailed()) await existing.remove();
      await queue.add(data.operation, { operation: data.operation, assetType: data.assetType, assetId: data.assetId, sourceCollection: data.sourceCollection, sourceObjectKey: data.sourceObjectKey, sourceChecksum: data.sourceChecksum }, { jobId: data.bullJobId, priority: data.operation === "unpublish" ? 1 : 10 });
      await item.ref.set({ status: "dispatched", dispatchedAt: FieldValue.serverTimestamp(), dispatchAttempts: FieldValue.increment(1), lastDispatchError: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      console.info(`media outbox dispatched: ${data.bullJobId}`);
    } catch (error) {
      await item.ref.set({ dispatchAttempts: FieldValue.increment(1), lastDispatchError: error instanceof Error ? error.message : "REDIS_DISPATCH_FAILED", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
}
let stopping = false;
async function loop() { while (!stopping) { await dispatchOnce().catch((error) => console.error("media dispatcher error", error)); await new Promise((resolve) => setTimeout(resolve, 2_000)); } await queue.close(); await redis.quit(); }
console.info("media dispatcher started");
process.once("SIGTERM", () => { stopping = true; }); process.once("SIGINT", () => { stopping = true; });
void loop();
