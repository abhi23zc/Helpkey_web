import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type Redis from "ioredis";
import { backgroundKey, IdleSchedule, retryDelay } from "../../lib/background/config";

export const releaseLock = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;
export const renewLock = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end`;
export type PollResult = { examined: number; hasMore?: boolean; failures?: unknown[] };

export async function poll(options: { name: string; redis?: Redis; minimum: number; maximum: number; fixedInterval?: boolean; wakeOnReady?: boolean; task: (signal: AbortSignal, assertLeadership: () => Promise<void>, lease: { key: string; owner: string }) => Promise<PollResult> }) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  const schedule = new IdleSchedule(options.minimum, options.maximum);
  const owner = randomUUID(), key = backgroundKey("leader", options.name);
  let leader = !options.redis, failures = 0, running = false, renewal: Promise<void> | undefined;
  let wakeRequested = false, wakeSleep: (() => void) | undefined;
  const ready = () => { wakeRequested = true; wakeSleep?.(); };
  if (options.wakeOnReady) options.redis?.on("ready", ready);
  const assertLeadership = async () => {
    if (controller.signal.aborted || !leader || options.redis && await options.redis.get(key) !== owner) throw new Error("WORKER_LEADERSHIP_LOST");
  };
  const heartbeat = async () => {
    if (!options.redis) return;
    if (leader) leader = Number(await options.redis.eval(renewLock, 1, key, owner, "90000")) === 1;
    if (leader) await options.redis.set(backgroundKey("heartbeat", options.name), JSON.stringify({ at: Date.now(), pid: process.pid, rssBytes: process.memoryUsage().rss, running }), "EX", 120);
  };
  const timer = setInterval(() => {
    if (!renewal) renewal = heartbeat().catch(() => { leader = false; }).finally(() => { renewal = undefined; });
  }, 20_000);
  try {
    while (!controller.signal.aborted) {
      let wait = options.maximum;
      try {
        if (options.redis && !leader) {
          leader = await options.redis.set(key, owner, "PX", 90_000, "NX") === "OK";
          // Leadership checks touch Redis only. Do not make a standby wait the
          // full Firestore recovery interval after the previous owner's lease ends.
          if (!leader) wait = Math.min(options.maximum, 5_000);
        }
        if (leader) {
          await heartbeat(); running = true;
          wakeRequested = false;
          const result = await options.task(controller.signal, assertLeadership, { key, owner });
          running = false; failures = 0;
          wait = options.fixedInterval ? result.hasMore ? 0 : options.maximum : schedule.next(result.hasMore === true || result.examined > 0 && !result.failures?.length);
          console.info(JSON.stringify({ event: "worker.poll", worker: options.name, ...result, nextPollMs: wait, rssBytes: process.memoryUsage().rss }));
        }
      } catch (error) {
        running = false;
        wait = Math.round(retryDelay(++failures, 2_000, 60_000) * (0.8 + Math.random() * 0.4));
        if (!controller.signal.aborted) console.error(JSON.stringify({ event: "worker.poll_failed", worker: options.name, error: error instanceof Error ? error.message : "UNKNOWN", nextPollMs: wait }));
      }
      if (!controller.signal.aborted) {
        const sleep = new AbortController();
        const wake = () => sleep.abort();
        wakeSleep = wake;
        controller.signal.addEventListener("abort", wake, { once: true });
        if (wakeRequested) { wakeRequested = false; wake(); }
        try { await delay(Math.max(wait, 25), undefined, { signal: sleep.signal }); } catch {}
        finally { wakeSleep = undefined; controller.signal.removeEventListener("abort", wake); }
      }
    }
  } finally {
    clearInterval(timer); await renewal;
    options.redis?.removeListener("ready", ready);
    process.removeListener("SIGTERM", stop); process.removeListener("SIGINT", stop);
    if (options.redis) await options.redis.eval(releaseLock, 1, key, owner).catch(() => {});
  }
}
