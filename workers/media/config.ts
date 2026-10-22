import { positiveInteger, queueRedisUrl, queuePrefix as configuredPrefix } from "../../lib/background/config";
export const queueName = process.env.MEDIA_PUBLICATION_QUEUE || "helpkey-media-publication";
export const queuePrefix = configuredPrefix();
export const workerConcurrency = positiveInteger("MEDIA_WORKER_CONCURRENCY", 1, 16);
export const maxAttempts = 6;
export const retryDelays = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 360 * 60_000];

export function redisUrl() { return queueRedisUrl(); }
