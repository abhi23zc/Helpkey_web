import { LeaseBusy } from "../shared/outbox";
import { workerHeartbeat } from "../shared/heartbeat";
import { closeDelivery } from "../../lib/background/delivery";
import { db } from "./firebase";
import { DelayedError, Worker } from "bullmq";
import { backoff, connection } from "./queue";
import { queueName, queuePrefix, workerConcurrency } from "./config";
import { processPublication } from "./processor";

const redis = connection();
const worker = new Worker(queueName, async (job, token) => {
  try { await processPublication(job); }
  catch (error) { if (error instanceof LeaseBusy) { await job.moveToDelayed(Date.now() + 1_000, token); throw new DelayedError(); } throw error; }
}, { connection: redis, prefix: queuePrefix, concurrency: workerConcurrency, settings: { backoffStrategy: (_attemptsMade, type) => type === "media-publication" ? backoff(_attemptsMade) : 0 } });
console.info(`media worker started (queue=${queuePrefix}:${queueName}, concurrency=${workerConcurrency})`);
worker.on("active", (job) => console.info(`media job active: ${job.id} (${job.data.operation} ${job.data.assetId})`));
worker.on("completed", (job) => console.info(`media job completed: ${job.id} (${job.data.assetId})`));
worker.on("failed", (job, error) => console.error(`media job failed: ${job?.id ?? "unknown"}`, error.message));
worker.on("error", (error) => console.error("media worker error", error));
const stopHeartbeat = workerHeartbeat(redis, "media-worker");
let closing = false;
async function close() {
  if (closing) return; closing = true;
  stopHeartbeat();
  try { await worker.close(); }
  finally { await Promise.allSettled([closeDelivery(), db.terminate()]); redis.disconnect(); }
}
process.once("SIGTERM", () => void close()); process.once("SIGINT", () => void close());
