import type Redis from "ioredis";
import { invalidationKeys } from "../../lib/background/cache";
export async function invalidate(redis: Redis, propertyId: string, slug?: string) {
  const keys = invalidationKeys(["home", "search:*", "suggestions:*", `reviews:${propertyId}`, ...(slug ? [`property:${slug}`] : ["property:*"])]);
  const results = await redis.multi(keys.map(key => ["incr", key])).exec();
  if (!results || results.some(([error]) => error)) throw new Error("CACHE_INVALIDATION_FAILED");
}
