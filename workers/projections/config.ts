import { positiveInteger, queueRedisUrl, queuePrefix as configuredPrefix } from "../../lib/background/config";
export const projectionQueueName = process.env.PROJECTION_QUEUE || "helpkey-projections";
export const projectionQueuePrefix = configuredPrefix();
export const projectionConcurrency = positiveInteger("PROJECTION_WORKER_CONCURRENCY", 4, 64);
export const projectionMaxAttempts = 6;
export function projectionRedisUrl() { return queueRedisUrl(); }
