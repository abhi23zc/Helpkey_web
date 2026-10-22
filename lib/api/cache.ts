import "server-only";
import { randomUUID } from "node:crypto";
import { cacheKey, withRedis } from "@/lib/redis";
import { generationKeys, invalidationKeys, ownedRelease, ownedRenew } from "@/lib/background/cache";
type CachedEnvelope<T> = { value: T; freshUntil: number; staleUntil: number };

export async function cachedPublic<T>(keyParts: Array<string | number>, loader: () => Promise<T>, options: { freshSeconds?: number; staleSeconds?: number } = {}): Promise<T> {
  if (process.env.PUBLIC_RESPONSE_CACHE_DISABLED === "1") return loader();
  const fresh = options.freshSeconds ?? 60, stale = options.staleSeconds ?? 300;
  const generations = await withRedis(redis => redis.mget(...generationKeys(keyParts)));
  if (!generations) return loader();
  const key = cacheKey("public", ...keyParts, "g", ...generations.map(value => value ?? "0"));
  const raw = await withRedis(redis => redis.get(key));
  let cached: CachedEnvelope<T> | null = null;
  try { cached = raw ? JSON.parse(raw) : null; } catch { /* Corrupt cache is a miss. */ }
  if (cached && cached.freshUntil > Date.now()) return cached.value;
  const lockKey = `${key}:lock`, token = randomUUID();
  const lock = await withRedis(redis => redis.set(lockKey, token, "PX", 15_000, "NX"));
  if (!lock && cached && cached.staleUntil > Date.now()) return cached.value;
  let renewal: Promise<unknown> | undefined;
  const timer = lock ? setInterval(() => {
    if (!renewal) renewal = withRedis(redis => redis.eval(ownedRenew, 1, lockKey, token, "15000")).finally(() => { renewal = undefined; });
  }, 5_000) : undefined;
  // No lock means Redis is unavailable or another loader owns it: serve a fresh direct result without writing.
  try {
    const value = await loader(), now = Date.now();
    if (lock) await withRedis(async redis => {
      if (await redis.get(lockKey) !== token) return;
      await redis.set(key, JSON.stringify({ value, freshUntil: now + fresh * 1_000, staleUntil: now + (fresh + stale) * 1_000 }), "EX", fresh + stale);
    });
    return value;
  } catch (error) {
    const current = await withRedis(redis => redis.mget(...generationKeys(keyParts)));
    if (cached && cached.staleUntil > Date.now() && current && JSON.stringify(current) === JSON.stringify(generations)) return cached.value;
    throw error;
  } finally {
    if (timer) clearInterval(timer); await renewal;
    if (lock) await withRedis(redis => redis.eval(ownedRelease, 1, lockKey, token));
  }
}
export async function invalidatePublic(...patterns: string[]) {
  const keys = invalidationKeys(patterns);
  if (keys.length) await withRedis(async redis => { await redis.multi(keys.map(key => ["incr", key])).exec(); });
}
