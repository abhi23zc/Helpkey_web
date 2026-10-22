import Redis from "ioredis";
import { poll } from "../shared/poll";
import { positiveInteger, queueRedisUrl } from "../../lib/background/config";
if (!process.env.CRON_SECRET) throw new Error("CRON_SECRET is required for the booking worker");
const redis = (process.env.QUEUE_REDIS_URL || process.env.REDIS_URL) ? new Redis(queueRedisUrl(), { maxRetriesPerRequest: 1, commandTimeout: 5_000 }) : undefined;
if (!redis) console.warn(JSON.stringify({ event: "booking.single_instance_mode", message: "REDIS_URL is unset; run only one booking runner" }));
redis?.on("error", error => console.error(JSON.stringify({ event: "booking.redis_error", error: error.name })));
const tasks = { expiry: ["BOOKING_EXPIRY_INTERVAL_MS", 15_000], payments: ["BOOKING_PAYMENT_INTERVAL_MS", 60_000], refunds: ["BOOKING_REFUND_INTERVAL_MS", 60_000], notifications: ["BOOKING_NOTIFICATION_INTERVAL_MS", 30_000] } as const;
void Promise.all(Object.entries(tasks).map(([task, [setting, fallback]]) => {
  const maximum = positiveInteger(setting, fallback);
  return poll({ name: `bookings-${task}`, redis, minimum: task === "notifications" ? Math.min(2_000, maximum) : maximum, maximum, task: async signal => {
    const base = (process.env.BOOKING_WORKER_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
    const response = await fetch(`${base}/api/internal/bookings/expire?task=${task}`, { method: "POST", headers: { "x-cron-secret": process.env.CRON_SECRET! }, signal: AbortSignal.any([signal, AbortSignal.timeout(240_000)]) });
    if (!response.ok) throw new Error(`Maintenance returned HTTP ${response.status}`);
    const result = await response.json();
    return { ...result, examined: result.examined ?? result.expired ?? 0 };
  } });
})).finally(async () => { await redis?.quit(); });
