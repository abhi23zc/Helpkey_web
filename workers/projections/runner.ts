import { Worker } from "bullmq";
import { projectionConcurrency, projectionQueueName, projectionQueuePrefix } from "./config";
import { projectionConnection } from "./queue";
import { closeProjectionProcessor, processProjection } from "./processor";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../media/firebase";

const redis = projectionConnection();
const worker = new Worker(projectionQueueName, processProjection, { connection: redis, prefix: projectionQueuePrefix, concurrency: projectionConcurrency });
worker.on("completed", (job) => console.info(JSON.stringify({ event: "projection.completed", jobId: job.id, kind: job.data.kind })));
worker.on("failed", (job, error) => {
  console.error(JSON.stringify({ event: "projection.failed", jobId: job?.id, kind: job?.data.kind, errorCode: error.name }));
  if (job?.id) void db.collection("projectionJobs").doc(String(job.id)).set({ ...job.data, status: job.attemptsMade >= (job.opts.attempts ?? 1) ? "dead" : "retryable", attempts: job.attemptsMade, lastErrorCode: error.name, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
});
async function close() { await worker.close(); await closeProjectionProcessor(); await redis.quit(); }
process.once("SIGTERM", () => void close()); process.once("SIGINT", () => void close());
