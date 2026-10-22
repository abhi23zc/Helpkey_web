import { hostname } from "node:os";
import type Redis from "ioredis";
import { backgroundKey } from "../../lib/background/config";
export function workerHeartbeat(redis: Redis, name: string) {
  const key = backgroundKey("heartbeat", `${name}:${hostname()}:${process.pid}`);
  const report = async () => {
    try {
      await redis.sadd(backgroundKey("worker-heartbeats"), key);
      await redis.set(key, JSON.stringify({ at: Date.now(), pid: process.pid, rssBytes: process.memoryUsage().rss }), "EX", 120);
    } catch (error) { console.error(JSON.stringify({ event: "worker.heartbeat_failed", worker: name, error: error instanceof Error ? error.message : "UNKNOWN" })); }
  };
  void report(); const timer = setInterval(() => void report(), 20_000);
  return () => clearInterval(timer);
}
