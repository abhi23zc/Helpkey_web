import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  values: new Map<string, string>(),
  attempts: 1,
  offline: false,
}));
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: (name: string) => ({ doc: (id: string) => ({ name, id }) }),
    runTransaction: async (run: (tx: object) => Promise<unknown>) => {
      let result: unknown;
      for (let i = 0; i < state.attempts; i++) result = await run({ set: () => {} });
      return result;
    },
  },
}));
vi.mock("@/lib/redis", () => {
  const redis = {
    mget: async (...keys: string[]) =>
      keys.map((k) => state.values.get(k) ?? null),
    get: async (key: string) => state.values.get(key) ?? null,
    set: async (
      key: string,
      value: string,
      _unit: string,
      _ttl: number,
      nx?: string,
    ) => {
      if (nx && state.values.has(key)) return null;
      state.values.set(key, value);
      return "OK";
    },
    eval: async (
      _script: string,
      _count: number,
      key: string,
      token: string,
    ) => {
      if (state.values.get(key) === token) state.values.delete(key);
      return 1;
    },
    multi: (commands: string[][]) => ({
      exec: async () =>
        commands.map(([, key]) => {
          state.values.set(key, String(Number(state.values.get(key) || 0) + 1));
          return [null, 1];
        }),
    }),
  };
  return {
    cacheKey: (...parts: unknown[]) => parts.join(":"),
    withRedis: async (run: (client: typeof redis) => unknown) =>
      state.offline ? null : run(redis),
  };
});
import { cachedPublic } from "@/lib/api/cache";
import { todayTransaction } from "@/lib/partner/today/cache";
import { generationKeys } from "@/lib/background/cache";
beforeEach(() => {
  state.values.clear();
  state.attempts = 1;
  state.offline = false;
  vi.stubEnv("PUBLIC_RESPONSE_CACHE_DISABLED", "0");
});
afterEach(() => vi.unstubAllEnvs());
describe("committed hotel cache invalidation", () => {
  it("refreshes every date for the changed hotel while retaining another hotel's cache", async () => {
    let reads = 0;
    const load = (hotel: string, day: string) =>
      cachedPublic(["partner-today", hotel, day], async () => ++reads, {
        freshSeconds: 10,
        staleSeconds: 0,
      });
    expect(await load("a", "day1")).toBe(1);
    expect(await load("a", "day2")).toBe(2);
    expect(await load("b", "day1")).toBe(3);
    await expect(
      todayTransaction(async (_tx, changed) => {
        changed("a");
        changed("a");
        return "saved";
      }),
    ).resolves.toBe("saved");
    expect(await load("a", "day1")).toBe(4);
    expect(await load("a", "day2")).toBe(5);
    expect(await load("b", "day1")).toBe(3);
    expect(state.values.get(generationKeys(["partner-today", "a"])[2])).toBe(
      "1",
    );
  });
  it("does not publish invalidations for a rejected mutation", async () => {
    await expect(
      todayTransaction(async (_tx, changed) => {
        changed("a");
        throw new Error("REVISION_CONFLICT");
      }),
    ).rejects.toThrow("REVISION_CONFLICT");
    expect(state.values.size).toBe(0);
  });
  it("publishes only scopes from the final successful transaction attempt", async () => {
    state.attempts = 2;
    let attempt = 0;
    await todayTransaction(async (_tx, changed) => {
      changed(++attempt === 1 ? "discarded" : "committed");
    });
    expect(
      state.values.has(generationKeys(["partner-today", "discarded"])[2]),
    ).toBe(false);
    expect(
      state.values.get(generationKeys(["partner-today", "committed"])[2]),
    ).toBe("1");
  });
  it("preserves committed results during Redis unavailability and evaluates fresh directly", async () => {
    state.offline = true;
    await expect(
      todayTransaction(async (_tx, changed) => {
        changed("a");
        return { ok: true };
      }),
    ).resolves.toEqual({ ok: true });
    const loader = vi.fn(async () => "fresh");
    await cachedPublic(["partner-today", "a"], loader, {
      freshSeconds: 10,
      staleSeconds: 0,
    });
    await cachedPublic(["partner-today", "a"], loader, {
      freshSeconds: 10,
      staleSeconds: 0,
    });
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
