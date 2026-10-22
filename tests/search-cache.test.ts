import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ records: new Map<string, { value: string; expiry?: number }>(), disabled: false }));
vi.mock("@/lib/redis", () => {
  const get = async (key: string) => { const item = state.records.get(key); return item && (!item.expiry || item.expiry > Date.now()) ? item.value : null; };
  const redis = {
    get, mget: async (...keys: string[]) => Promise.all(keys.map(get)),
    set: async (key: string, value: string, _px: string, duration: number, nx?: string) => {
      if (nx && await get(key)) return null;
      state.records.set(key, { value, expiry: Date.now() + duration }); return "OK";
    },
    eval: async (_script: string, _count: number, key: string, token: string) => { if (await get(key) === token) state.records.delete(key); return 1; },
  };
  return { cacheKey: (...parts: unknown[]) => parts.join(":"), withRedis: async (operation: (value: typeof redis) => Promise<unknown>) => state.disabled ? null : operation(redis) };
});
import { cachedSearch } from "@/lib/customer/search-cache";
import { generationKeys } from "@/lib/background/cache";

const snapshot = (price = 100) => ({ items: [{ price }], fingerprint: String(price), evaluatedAt: Date.now(), expiresAt: Date.now() + 30_000, amenities: [] });
describe("hard-expiring search snapshot cache", () => {
  beforeEach(() => { state.records.clear(); state.disabled = false; vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01")); });
  afterEach(() => vi.useRealTimers());
  it("reuses identical evaluations and never caches past 30 seconds", async () => {
    const load = vi.fn(async () => snapshot());
    await cachedSearch("same", load); await cachedSearch("same", load);
    expect(load).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 30_001);
    await cachedSearch("same", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("respects a cancellation or offer deadline earlier than the normal TTL", async () => {
    const load = vi.fn(async () => ({ ...snapshot(), expiresAt: Date.now() + 1_000 }));
    await cachedSearch("deadline", load);
    vi.setSystemTime(Date.now() + 1_001);
    await cachedSearch("deadline", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("invalidates snapshots through the shared search generation", async () => {
    const load = vi.fn(async () => snapshot());
    await cachedSearch("generation", load);
    state.records.set(generationKeys(["search"])[1], { value: "1" });
    await cachedSearch("generation", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("does not publish a result if inventory changes during evaluation", async () => {
    await expect(cachedSearch("racing", async () => {
      state.records.set(generationKeys(["search"])[1], { value: "1" });
      return snapshot();
    })).rejects.toMatchObject({ code: "SEARCH_CHANGED" });
  });
  it("shares concurrent evaluation within a process", async () => {
    const load = vi.fn(async () => snapshot());
    const result = await Promise.all([cachedSearch("concurrent", load), cachedSearch("concurrent", load)]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(result[0]).toEqual(result[1]);
  });
  it("isolates different search keys and computes directly when Redis is unavailable", async () => {
    const load = vi.fn(async () => snapshot());
    await cachedSearch("a", load); await cachedSearch("b", load);
    expect(load).toHaveBeenCalledTimes(2);
    state.disabled = true;
    await cachedSearch("a", load); await cachedSearch("a", load);
    expect(load).toHaveBeenCalledTimes(4);
  });
  it("never serves expired availability when a fresh evaluation fails", async () => {
    await cachedSearch("failure", async () => snapshot());
    vi.setSystemTime(Date.now() + 30_001);
    await expect(cachedSearch("failure", async () => { throw new Error("DATABASE_UNAVAILABLE"); })).rejects.toThrow("DATABASE_UNAVAILABLE");
  });
});
