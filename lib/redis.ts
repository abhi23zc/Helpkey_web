import "server-only";

import Redis from "ioredis";
import { apiContext } from "@/lib/api/context";

declare global {
  // eslint-disable-next-line no-var
  var __helpkeyRedis: Redis | null | undefined;
}

export function getRedis(): Redis | null {
  if (globalThis.__helpkeyRedis !== undefined) return globalThis.__helpkeyRedis;
  const url = process.env.REDIS_URL?.trim();
  if (!url || process.env.REDIS_DISABLED === "1") {
    globalThis.__helpkeyRedis = null;
    return null;
  }

  const redis = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 1_500,
    commandTimeout: 1_500,
    retryStrategy: () => null,
  });
  redis.on("error", (error) => {
    console.warn(JSON.stringify({ level: "warn", event: "redis.error", code: error.name }));
  });
  globalThis.__helpkeyRedis = redis;
  return redis;
}

export async function withRedis<T>(operation: (redis: Redis) => Promise<T>): Promise<T | null> {
  const redis = getRedis();
  if (!redis) { apiContext.countRedis(0, "miss"); return null; }
  const started = performance.now();
  try {
    if (redis.status === "wait") await redis.connect();
    const result = await operation(redis);
    apiContext.countRedis(performance.now() - started, result === null ? "miss" : "hit");
    return result;
  } catch (error) {
    apiContext.countRedis(performance.now() - started, "error");
    console.warn(JSON.stringify({ level: "warn", event: "redis.operation_failed", code: error instanceof Error ? error.name : "UNKNOWN" }));
    return null;
  }
}

export function cacheKey(entity: string, ...parts: Array<string | number>) {
  const environment = process.env.HELPKEY_ENV ?? process.env.NODE_ENV ?? "development";
  return ["helpkey", environment, "v1", entity, ...parts].map(String).join(":");
}
