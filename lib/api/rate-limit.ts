import "server-only";

import { ApiException } from "@/lib/api/errors";
import { cacheKey, withRedis } from "@/lib/redis";

export async function enforceRateLimit(input: {
  bucket: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
  failClosed?: boolean;
}) {
  const key = cacheKey("rate", input.bucket, input.identifier);
  const result = await withRedis(async (redis) => {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, input.windowSeconds);
    return count;
  });
  if (result === null && input.failClosed) throw new ApiException("RATE_LIMIT_UNAVAILABLE", 503, "Safety controls are temporarily unavailable.");
  if (result !== null && result > input.limit) throw new ApiException("RATE_LIMITED", 429, "Too many requests. Please try again later.");
}
