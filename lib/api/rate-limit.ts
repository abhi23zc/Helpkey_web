import "server-only";

import { ApiException } from "@/lib/api/errors";
import { cacheKey, withRedis } from "@/lib/redis";

export async function enforceRateLimit(input: {
  bucket: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
  failClosed?: boolean;
  /**
   * Number of units this call consumes from the window. Defaults to 1.
   * Batch operations (e.g. signing N preview URLs) pass the batch size so the
   * whole request costs a single Redis round-trip instead of N.
   */
  cost?: number;
}) {
  const cost = Math.max(1, Math.trunc(input.cost ?? 1));
  const key = cacheKey("rate", input.bucket, input.identifier);
  const result = await withRedis(async (redis) => {
    const count = cost === 1 ? await redis.incr(key) : await redis.incrby(key, cost);
    // Set the window only on the first increment of a fresh key.
    if (count === cost) await redis.expire(key, input.windowSeconds);
    return count;
  });
  if (result === null && input.failClosed) throw new ApiException("RATE_LIMIT_UNAVAILABLE", 503, "Safety controls are temporarily unavailable.");
  if (result !== null && result > input.limit) throw new ApiException("RATE_LIMITED", 429, "Too many requests. Please try again later.");
}
