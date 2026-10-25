import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { cacheKey, withRedis } from "@/lib/redis";
import { generationKeys, ownedRelease, ownedRenew } from "@/lib/background/cache";
import { ApiException } from "@/lib/api/errors";

export type SearchSnapshot<T> = { items: T[]; fingerprint: string; evaluatedAt: number; expiresAt: number; amenities: string[] };
export const searchDigest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const pending = new Map<string, Promise<SearchSnapshot<unknown>>>();

/** Hard-expiring search snapshots. No stale-on-error path is permitted for prices or inventory. */
export async function cachedSearch<T>(queryHash: string, loader: () => Promise<SearchSnapshot<T>>): Promise<SearchSnapshot<T>> {
  const startedAt = Date.now();
  const generations = await withRedis(redis => redis.mget(...generationKeys(["search"])));
  const key = cacheKey("search-offers-v1", queryHash, ...(generations ?? ["direct"]).map(value => value ?? "0"));
  const read = async () => {
    const raw = await withRedis(redis => redis.get(key));
    if (!raw) return null;
    try {
      const result = JSON.parse(raw) as SearchSnapshot<T>;
      return result.expiresAt > Date.now() && Array.isArray(result.items) ? result : null;
    } catch { return null; }
  };
  const existing = pending.get(key);
  if (existing) {
    const result = await existing as SearchSnapshot<T>;
    console.info(JSON.stringify({ event: "search.snapshot", cache: "deduplicated", durationMs: Date.now() - startedAt, queryHash, results: result.items.length }));
    return result;
  }
  const work = (async () => {
    const hit = await read();
    if (hit) {
      console.info(JSON.stringify({ event: "search.snapshot", cache: "hit", durationMs: Date.now() - startedAt, queryHash, results: hit.items.length }));
      return hit;
    }
    const lockKey = `${key}:lock`, token = randomUUID();
    let acquired = generations ? await withRedis(redis => redis.set(lockKey, token, "PX", 15_000, "NX")) : null;
    if (generations && !acquired) {
      // A concurrent process may be evaluating this same search. Wait briefly,
      // then compute directly rather than holding an HTTP request indefinitely.
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const value = await read();
        if (value) return value;
      }
      acquired = await withRedis(redis => redis.set(lockKey, token, "PX", 15_000, "NX"));
    }
    const timer = acquired ? setInterval(() => { void withRedis(redis => redis.eval(ownedRenew, 1, lockKey, token, "15000")); }, 5_000) : null;
    try {
      const value = await loader();
      const current = await withRedis(redis => redis.mget(...generationKeys(["search"])));
      if (generations && current && JSON.stringify(current) !== JSON.stringify(generations)) {
        throw new ApiException("SEARCH_CHANGED", 409, "Hotel availability changed. Refresh your search.");
      }
      const remaining = value.expiresAt - Date.now();
      if (remaining <= 0) throw new ApiException("SEARCH_CHANGED", 409, "Availability changed while searching. Please try again.");
      if (acquired && generations && current) await withRedis(async redis => {
        if (await redis.get(lockKey) === token) await redis.set(key, JSON.stringify(value), "PX", remaining);
      });
      console.info(JSON.stringify({ event: "search.snapshot", cache: "miss", durationMs: Date.now() - startedAt, queryHash, results: value.items.length, responseBytes: Buffer.byteLength(JSON.stringify(value)), evaluationMs: Date.now() - value.evaluatedAt }));
      return value;
    } finally {
      if (timer) clearInterval(timer);
      if (acquired) await withRedis(redis => redis.eval(ownedRelease, 1, lockKey, token));
    }
  })();
  pending.set(key, work as Promise<SearchSnapshot<unknown>>);
  try { return await work; } finally { if (pending.get(key) === work) pending.delete(key); }
}
