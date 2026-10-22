import { Queue } from "bullmq";
import IORedis from "ioredis";
import { projectionMaxAttempts, projectionQueueName, projectionQueuePrefix, projectionRedisUrl } from "./config";

export type { ProjectionJob } from "../../lib/background/jobs";
import { type ProjectionJob, safeJobId } from "../../lib/background/jobs";
export function projectionConnection() { return new IORedis(projectionRedisUrl(), { maxRetriesPerRequest: null, connectTimeout: 5_000, commandTimeout: 10_000 }); }
export function projectionQueue(redis = projectionConnection()) { return new Queue<ProjectionJob>(projectionQueueName, { connection: redis, prefix: projectionQueuePrefix, defaultJobOptions: { attempts: projectionMaxAttempts, backoff: { type: "exponential", delay: 5_000 }, removeOnComplete: { age: 7 * 86_400, count: 20_000 }, removeOnFail: false } }); }
// BullMQ reserves `:` as an internal key separator, so custom job IDs must
// not contain it. Keeping the ID deterministic still gives us idempotency
// when the dispatcher retries an outbox record.
export const projectionJobId = (job: ProjectionJob) => safeJobId(job.kind, job.entityId, job.eventId, String(job.version));
