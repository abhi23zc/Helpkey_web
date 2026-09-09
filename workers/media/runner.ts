import { Worker } from "bullmq";
import { backoff, connection } from "./queue";
import { queueName, queuePrefix, workerConcurrency } from "./config";
import { processPublication } from "./processor";

const redis = connection();
const worker = new Worker(queueName, processPublication, { connection: redis, prefix: queuePrefix, concurrency: workerConcurrency, settings: { backoffStrategy: (_attemptsMade, type) => type === "media-publication" ? backoff(_attemptsMade) : 0 } });
console.info(`media worker started (queue=${queuePrefix}:${queueName}, concurrency=${workerConcurrency})`);
worker.on("active", (job) => console.info(`media job active: ${job.id} (${job.data.operation} ${job.data.assetId})`));
worker.on("completed", (job) => console.info(`media job completed: ${job.id} (${job.data.assetId})`));
worker.on("failed", (job, error) => console.error(`media job failed: ${job?.id ?? "unknown"}`, error.message));
worker.on("error", (error) => console.error("media worker error", error));
async function close() { await worker.close(); await redis.quit(); }
process.once("SIGTERM", () => void close()); process.once("SIGINT", () => void close());
