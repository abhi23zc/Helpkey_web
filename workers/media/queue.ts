import { Queue } from "bullmq";
import IORedis from "ioredis";
import { maxAttempts, queueName, queuePrefix, redisUrl, retryDelays } from "./config";

export type { PublicationJob } from "../../lib/background/jobs";
import type { PublicationJob } from "../../lib/background/jobs";
export function connection() { return new IORedis(redisUrl(), { maxRetriesPerRequest: null, connectTimeout: 5_000, commandTimeout: 10_000 }); }
export function mediaQueue(redis = connection()) { return new Queue<PublicationJob>(queueName, { connection: redis, prefix: queuePrefix, defaultJobOptions: { attempts: maxAttempts, backoff: { type: "media-publication" }, removeOnComplete: { age: 7 * 24 * 3600, count: 10_000 }, removeOnFail: false } }); }
export function backoff(attemptsMade: number) { return retryDelays[Math.min(Math.max(attemptsMade - 1, 0), retryDelays.length - 1)]; }
