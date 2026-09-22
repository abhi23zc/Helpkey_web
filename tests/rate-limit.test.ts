import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A minimal in-memory Redis stub exposing only the commands enforceRateLimit uses.
class RedisStub {
  store = new Map<string, number>();
  expires = new Map<string, number>();
  incr = vi.fn(async (key: string) => this.bump(key, 1));
  incrby = vi.fn(async (key: string, amount: number) => this.bump(key, amount));
  expire = vi.fn(async (key: string, seconds: number) => { this.expires.set(key, seconds); return 1; });
  private bump(key: string, amount: number) { const next = (this.store.get(key) ?? 0) + amount; this.store.set(key, next); return next; }
}

let redis: RedisStub;

vi.mock("@/lib/redis", () => ({
  cacheKey: (...parts: Array<string | number>) => parts.map(String).join(":"),
  withRedis: async (operation: (client: RedisStub) => Promise<unknown>) => operation(redis),
}));

import { enforceRateLimit } from "@/lib/api/rate-limit";
import { ApiException } from "@/lib/api/errors";

beforeEach(() => { redis = new RedisStub(); });
afterEach(() => { vi.clearAllMocks(); });

describe("enforceRateLimit", () => {
  it("uses a single INCR and sets the window on the first hit (default cost)", async () => {
    await enforceRateLimit({ bucket: "b", identifier: "u", limit: 5, windowSeconds: 60 });
    expect(redis.incr).toHaveBeenCalledTimes(1);
    expect(redis.incrby).not.toHaveBeenCalled();
    expect(redis.expire).toHaveBeenCalledWith("rate:b:u", 60);
  });

  it("charges a batch with one INCRBY equal to the cost and sets the window once", async () => {
    await enforceRateLimit({ bucket: "b", identifier: "u", limit: 60, windowSeconds: 60, cost: 20 });
    expect(redis.incrby).toHaveBeenCalledTimes(1);
    expect(redis.incrby).toHaveBeenCalledWith("rate:b:u", 20);
    expect(redis.incr).not.toHaveBeenCalled();
    expect(redis.expire).toHaveBeenCalledTimes(1);
  });

  it("does not reset the window when the key already existed", async () => {
    redis.store.set("rate:b:u", 5); // pre-existing counter
    await enforceRateLimit({ bucket: "b", identifier: "u", limit: 60, windowSeconds: 60, cost: 3 });
    expect(redis.expire).not.toHaveBeenCalled();
  });

  it("throws RATE_LIMITED once the batch pushes the counter past the limit", async () => {
    await expect(enforceRateLimit({ bucket: "b", identifier: "u", limit: 10, windowSeconds: 60, cost: 11 }))
      .rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
  });

  it("normalizes fractional or zero cost to a minimum of one unit", async () => {
    await enforceRateLimit({ bucket: "b", identifier: "u", limit: 5, windowSeconds: 60, cost: 0 });
    expect(redis.incr).toHaveBeenCalledTimes(1);
    expect(redis.store.get("rate:b:u")).toBe(1);
  });

  it("fails closed with 503 when Redis is unavailable", async () => {
    const failing = await import("@/lib/redis");
    vi.spyOn(failing, "withRedis").mockResolvedValueOnce(null);
    await expect(enforceRateLimit({ bucket: "b", identifier: "u", limit: 5, windowSeconds: 60, failClosed: true }))
      .rejects.toBeInstanceOf(ApiException);
  });
});
