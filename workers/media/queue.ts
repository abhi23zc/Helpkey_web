import { Queue } from "bullmq";
import IORedis from "ioredis";
import { maxAttempts, queueName, queuePrefix, redisUrl, retryDelays } from "./config";

export type PublicationJob = { operation: "publish" | "unpublish"; assetType: "property_image" | "review_photo"; assetId: string; sourceCollection: "mediaAssets" | "reviewPhotos"; sourceObjectKey: string; sourceChecksum: string };
export function connection() { return new IORedis(redisUrl(), { maxRetriesPerRequest: null }); }
export function mediaQueue(redis = connection()) { return new Queue<PublicationJob>(queueName, { connection: redis, prefix: queuePrefix, defaultJobOptions: { attempts: maxAttempts, backoff: { type: "media-publication" }, removeOnComplete: { age: 7 * 24 * 3600, count: 10_000 }, removeOnFail: false } }); }
export function backoff(attemptsMade: number) { return retryDelays[Math.min(attemptsMade, retryDelays.length - 1)]; }
