import { FieldValue } from "firebase-admin/firestore";
import { db } from "../media/firebase";
import { projectionConnection, projectionJobId, projectionQueue, type ProjectionJob } from "./queue";

const redis = projectionConnection(); const queue = projectionQueue(redis); let stopping = false;
async function dispatch() {
  const pending = await db.collection("projectionOutbox").where("status", "==", "pending").limit(50).get();
  for (const document of pending.docs) {
    const data = { ...document.data(), eventId: document.id } as ProjectionJob;
    const jobId = projectionJobId(data);
    try { await queue.add(data.kind, data, { jobId }); await document.ref.set({ status: "dispatched", bullJobId: jobId, dispatchedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); }
    catch (error) {
      await document.ref.set({
        dispatchAttempts: FieldValue.increment(1),
        lastErrorCode: error instanceof Error ? error.name : "DISPATCH_FAILED",
        lastErrorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown dispatch failure",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }
}
async function loop() { while (!stopping) { await dispatch().catch((error) => console.error(JSON.stringify({ event: "projection.dispatch_failed", errorCode: error instanceof Error ? error.name : "UNKNOWN" }))); await new Promise((resolve) => setTimeout(resolve, 2_000)); } await queue.close(); await redis.quit(); }
process.once("SIGTERM", () => { stopping = true; }); process.once("SIGINT", () => { stopping = true; }); void loop();
