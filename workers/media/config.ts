export const queueName = process.env.MEDIA_PUBLICATION_QUEUE || "helpkey-media-publication";
export const queuePrefix = process.env.BULLMQ_PREFIX || "helpkey";
export const workerConcurrency = Number(process.env.MEDIA_WORKER_CONCURRENCY || "1");
export const maxAttempts = 6;
export const retryDelays = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 360 * 60_000];

export function redisUrl() {
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required for media workers");
  return process.env.REDIS_URL;
}
