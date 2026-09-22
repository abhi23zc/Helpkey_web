import { Queue } from "bullmq";
import IORedis from "ioredis";
import { projectionMaxAttempts, projectionQueueName, projectionQueuePrefix, projectionRedisUrl } from "./config";

export type ProjectionKind = "property_search" | "review_summary" | "daily_metrics" | "dashboard_summary" | "cache_invalidation";
export type ProjectionJob = { kind: ProjectionKind; entityId: string; version: number; eventId: string };
export function projectionConnection() { return new IORedis(projectionRedisUrl(), { maxRetriesPerRequest: null }); }
export function projectionQueue(redis = projectionConnection()) { return new Queue<ProjectionJob>(projectionQueueName, { connection: redis, prefix: projectionQueuePrefix, defaultJobOptions: { attempts: projectionMaxAttempts, backoff: { type: "exponential", delay: 5_000 }, removeOnComplete: { age: 7 * 86_400, count: 20_000 }, removeOnFail: false } }); }
// BullMQ reserves `:` as an internal key separator, so custom job IDs must
// not contain it. Keeping the ID deterministic still gives us idempotency
// when the dispatcher retries an outbox record.
export const projectionJobId = (job: ProjectionJob) => `${job.kind}-${job.entityId}-${job.eventId}-v${job.version}`.replace(/[^a-zA-Z0-9_-]/g, "_");
