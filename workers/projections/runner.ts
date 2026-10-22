import { DelayedError, Worker } from "bullmq";
import { projectionConcurrency, projectionQueueName, projectionQueuePrefix } from "./config";
import { projectionConnection } from "./queue";
import { closeProjectionProcessor, processProjection } from "./processor";
import { LeaseBusy } from "../shared/outbox";
import { workerHeartbeat } from "../shared/heartbeat";
import { closeDelivery } from "../../lib/background/delivery";
import { db } from "../media/firebase";
const redis = projectionConnection();
const worker = new Worker(projectionQueueName, async (job, token) => {
  try { await processProjection(job); }
  catch (error) { if (error instanceof LeaseBusy) { await job.moveToDelayed(Date.now() + 1_000, token); throw new DelayedError(); } throw error; }
}, { connection: redis, prefix: projectionQueuePrefix, concurrency: projectionConcurrency });
worker.on("completed", job => console.info(JSON.stringify({ event: "projection.completed", jobId: job.id, kind: job.data.kind })));
worker.on("failed", (job, error) => console.error(JSON.stringify({ event: "projection.failed", jobId: job?.id, error: error.message })));
worker.on("error", error => console.error(JSON.stringify({ event: "projection.error", error: error.message })));
const stopHeartbeat = workerHeartbeat(redis, "projection-worker");
let closing = false;
async function close() {
  if (closing) return; closing = true;
  stopHeartbeat();
  try { await worker.close(); }
  finally { await Promise.allSettled([closeDelivery(), closeProjectionProcessor(), db.terminate()]); redis.disconnect(); }
}
process.once("SIGTERM", () => void close()); process.once("SIGINT", () => void close());
