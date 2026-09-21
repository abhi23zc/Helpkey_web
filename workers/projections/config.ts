export const projectionQueueName = process.env.PROJECTION_QUEUE || "helpkey-projections";
export const projectionQueuePrefix = process.env.BULLMQ_PREFIX || "helpkey";
export const projectionConcurrency = Number(process.env.PROJECTION_WORKER_CONCURRENCY || "4");
export const projectionMaxAttempts = 6;
export function projectionRedisUrl() { if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required for projection workers"); return process.env.REDIS_URL; }
