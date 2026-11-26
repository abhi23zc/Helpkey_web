import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { db } from "../media/firebase";
import { backgroundKey, queueRedisUrl, recoveryInterval } from "../../lib/background/config";
import { createDeliveryQueues } from "../../lib/background/delivery";
import { recoverBackground, recoveryProgress } from "../../lib/background/recovery";
import { poll } from "./poll";
const redis = new Redis(queueRedisUrl(), { maxRetriesPerRequest: 1, commandTimeout: 5000 });
redis.on("error", error => console.error(JSON.stringify({ event: "recovery.redis_error", error: error.name })));
const queues = createDeliveryQueues(redis);
let startup = true;
const marker = backgroundKey("queue-generation");
void poll({ name: "background-recovery", redis, minimum: recoveryInterval(), maximum: recoveryInterval(), fixedInterval: true, wakeOnReady: true, task: async (signal, assertLeader, lease) => {
  await assertLeader();
  const controlWrite = async (key: string, value: string | null) => {
    const result = await redis.eval("if redis.call('get',KEYS[1]) ~= ARGV[1] then return 0 end if ARGV[2] == 'delete' then redis.call('del',KEYS[2]) else redis.call('set',KEYS[2],ARGV[3]) end return 1", 2, lease.key, key, lease.owner, value === null ? "delete" : "set", value ?? "");
    if (Number(result) !== 1) throw new Error("RECOVERY_LEADERSHIP_LOST");
  };
  const generation = await redis.get(marker);
  const requested = await redis.get(backgroundKey("rebuild-requested"));
  const rebuild = startup || !generation || !!requested;
  // A missing marker remains missing until a complete successful reconstruction.
  const progressKey = backgroundKey("rebuild-progress");
  const requestKey = backgroundKey("rebuild-request-generation");
  // An explicit administrative rebuild starts a fresh sweep rather than trusting
  // checkpoints from a possibly damaged/restored queue. Crash retries still resume it.
  if (requested && await redis.get(requestKey) !== requested) {
    await controlWrite(progressKey, null); await controlWrite(requestKey, requested);
  }
  const progress = rebuild ? recoveryProgress(await redis.get(progressKey)) : {};
  const result = await recoverBackground(db, queues, { rebuild, signal, assertLeader, cursors: progress,
    checkpoint: rebuild ? async (category, id) => {
      progress[category] = id ?? "__complete__";
      await controlWrite(progressKey, JSON.stringify(progress));
    } : undefined });
  await assertLeader();
  if (rebuild && !result.failures.length) {
    await controlWrite(marker, generation ?? randomUUID());
    if (requested) await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] and redis.call('get',KEYS[2]) == ARGV[2] then return redis.call('del',KEYS[2]) else return 0 end", 2, lease.key, backgroundKey("rebuild-requested"), lease.owner, requested);
    startup = false;
    await controlWrite(progressKey, null);
    await controlWrite(requestKey, null);
  }
  await controlWrite(backgroundKey("recovery-status"), JSON.stringify({ at: Date.now(), rebuild, generation: await redis.get(marker), ...result }));
  return result;
} }).finally(async () => { await Promise.all(Object.values(queues).map(queue => queue.close())); await redis.quit(); await db.terminate(); });
