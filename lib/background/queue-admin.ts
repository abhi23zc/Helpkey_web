import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { backgroundKey, backgroundMode, queueRedisUrl } from "./config";
import { createDeliveryQueues } from "./delivery";
export async function withQueueRedis<T>(body: (redis: Redis) => Promise<T>): Promise<T | null> {
  let redis: Redis | undefined;
  try {
    redis = new Redis(queueRedisUrl(), { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1, connectTimeout: 1000, commandTimeout: 1000, retryStrategy: () => null });
    redis.on("error", () => {});
    await redis.connect(); return await body(redis);
  } catch { return null; }
  finally { redis?.disconnect(); }
}
export async function queueDiagnostics() {
  return withQueueRedis(async redis => {
    const queues = createDeliveryQueues(redis);
    try {
      const status = await redis.get(backgroundKey("recovery-status"));
      const progress = await redis.get(backgroundKey("rebuild-progress"));
      const counts = await Promise.all(Object.entries(queues).map(async ([name, queue]) => {
        const [counts, oldest, failed] = await Promise.all([queue.getJobCounts("waiting", "prioritized", "active", "delayed", "failed", "completed"), queue.getJobs(["waiting", "prioritized"], 0, 0, true), queue.getJobs(["failed"], 0, 24)]);
        return { name, ...counts, oldestWaitingMs: oldest[0] ? Math.max(0, Date.now() - oldest[0].timestamp) : null,
          failures: failed.map(job => ({ id: job.id, recordId: job.data.recordId ?? job.data.outboxId, attempts: job.attemptsMade, error: job.failedReason })) };
      }));
      const recovery = status ? JSON.parse(status) : null;
      return { counts, recovery, rebuilding: progress ? JSON.parse(progress) : null, recoveryHealthy: backgroundMode() === "legacy" ? null : !!recovery && Date.now() - recovery.at < 420000 && !recovery.failures?.length };
    } finally { await Promise.all(Object.values(queues).map(queue => queue.close())); }
  });
}
export async function requestRebuild() {
  return withQueueRedis(async redis => {
    const id = randomUUID(); await redis.set(backgroundKey("rebuild-requested"), id); return { id };
  });
}
