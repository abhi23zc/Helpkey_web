import Redis from "ioredis";
import { DelayedError, Worker } from "bullmq";
import { bookingKinds, bookingQueueName, bookingTaskId, bookingTaskSchema } from "../../lib/background/booking-jobs";
import { positiveInteger, queuePrefix, queueRedisUrl } from "../../lib/background/config";
import { createDeliveryQueues, ensureBookingTask } from "../../lib/background/delivery";
import { workerHeartbeat } from "../shared/heartbeat";
if (!process.env.CRON_SECRET) throw new Error("CRON_SECRET is required");
const redis = new Redis(queueRedisUrl(), { maxRetriesPerRequest: null, connectTimeout: 5000 });
redis.on("error", error => console.error(JSON.stringify({ event: "booking.redis_error", error: error.name })));
const queues = createDeliveryQueues(redis);
const workers = bookingKinds.map(kind => {
  const worker = new Worker(bookingQueueName(kind), async (job, token) => {
    const task = bookingTaskSchema.parse(job.data);
    const base = (process.env.BOOKING_WORKER_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
    const response = await fetch(`${base}/api/internal/bookings/tasks`, { method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": process.env.CRON_SECRET! }, body: JSON.stringify(task), signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`BOOKING_TASK_HTTP_${response.status}`);
    const result = await response.json();
    if (result.next) {
      const next = bookingTaskSchema.parse(result.next);
      if (bookingTaskId(next) === job.id) {
        await job.moveToDelayed(Math.max(next.dueAt, Date.now() + 1000), token); throw new DelayedError();
      }
      await ensureBookingTask(queues[next.kind], next);
    }
  }, { connection: redis, prefix: queuePrefix(), concurrency: positiveInteger(`BOOKING_${kind.toUpperCase()}_CONCURRENCY`, kind === "notifications" ? 4 : 2, 32) });
  worker.on("error", error => console.error(JSON.stringify({ event: "booking.worker_error", kind, error: error.message })));
  worker.on("failed", (job, error) => console.error(JSON.stringify({ event: "booking.task_failed", kind, id: job?.id, error: error.message })));
  return worker;
});
const stopHeartbeat = workerHeartbeat(redis, "booking-queue-worker");
let closing = false;
async function close() { if (closing) return; closing = true; stopHeartbeat(); await Promise.all(workers.map(worker => worker.close())); await Promise.all(Object.values(queues).map(queue => queue.close())); await redis.quit(); }
process.once("SIGTERM", () => void close()); process.once("SIGINT", () => void close());
