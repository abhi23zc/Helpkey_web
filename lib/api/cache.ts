import "server-only";

import { cacheKey, withRedis } from "@/lib/redis";

type CachedEnvelope<T> = { value: T; freshUntil: number; staleUntil: number };

export async function cachedPublic<T>(
  keyParts: Array<string | number>,
  loader: () => Promise<T>,
  options: { freshSeconds?: number; staleSeconds?: number } = {},
): Promise<T> {
  if (process.env.PUBLIC_RESPONSE_CACHE_DISABLED === "1") return loader();
  const freshSeconds = options.freshSeconds ?? 60;
  const staleSeconds = options.staleSeconds ?? 300;
  const key = cacheKey("public", ...keyParts);
  const raw = await withRedis((redis) => redis.get(key));
  const cached = raw ? JSON.parse(raw) as CachedEnvelope<T> : null;
  const now = Date.now();
  if (cached && cached.freshUntil > now) return cached.value;

  const lockKey = `${key}:lock`;
  const lock = await withRedis((redis) => redis.set(lockKey, String(process.pid), "EX", 5, "NX"));
  if (!lock && cached && cached.staleUntil > now) return cached.value;
  try {
    const value = await loader();
    const envelope: CachedEnvelope<T> = {
      value,
      freshUntil: now + freshSeconds * 1_000,
      staleUntil: now + (freshSeconds + staleSeconds) * 1_000,
    };
    await withRedis((redis) => redis.set(key, JSON.stringify(envelope), "EX", freshSeconds + staleSeconds));
    return value;
  } catch (error) {
    if (cached && cached.staleUntil > now) return cached.value;
    throw error;
  } finally {
    if (lock) await withRedis((redis) => redis.del(lockKey));
  }
}

export async function invalidatePublic(...patterns: string[]) {
  await Promise.all(patterns.map(async (pattern) => {
    await withRedis(async (redis) => {
      let cursor = "0";
      do {
        const [next, keys] = await redis.scan(cursor, "MATCH", cacheKey("public", pattern), "COUNT", 100);
        cursor = next;
        if (keys.length) await redis.del(...keys);
      } while (cursor !== "0");
    });
  }));
}
