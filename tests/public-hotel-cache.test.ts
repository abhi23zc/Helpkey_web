import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ values: new Map<string, string>(), load: vi.fn() }));
vi.mock("@/lib/customer/catalog", () => ({ catalogPropertyBySlug: fixture.load }));
vi.mock("@/lib/redis", () => {
  const redis = {
    mget: async (...keys: string[]) => keys.map(key => fixture.values.get(key) ?? null),
    get: async (key: string) => fixture.values.get(key) ?? null,
    set: async (key: string, value: string) => { fixture.values.set(key, value); return "OK"; },
    eval: async (_script: string, _count: number, key: string, token: string) => { if (fixture.values.get(key) === token) fixture.values.delete(key); return 1; },
    multi: (commands: string[][]) => ({ exec: async () => { for (const [, key] of commands) fixture.values.set(key, String(Number(fixture.values.get(key) ?? 0) + 1)); return []; } }),
  };
  return { cacheKey: (...parts: unknown[]) => parts.join(":"), withRedis: async (operation: (value: typeof redis) => unknown) => operation(redis) };
});
import { loadPublicHotel } from "@/lib/services/public-hotel";
import { invalidatePublic } from "@/lib/api/cache";

beforeEach(() => { fixture.values.clear(); fixture.load.mockReset(); });
describe("shared property loader", () => {
  it("reuses a warm property and observes property publication invalidation", async () => {
    fixture.load.mockResolvedValueOnce({ name: "Garden" }).mockResolvedValueOnce({ name: "Updated Garden" });
    expect(await loadPublicHotel("garden")).toEqual({ name: "Garden" });
    expect(await loadPublicHotel("garden")).toEqual({ name: "Garden" });
    expect(fixture.load).toHaveBeenCalledTimes(1);
    await invalidatePublic("property:garden");
    expect(await loadPublicHotel("garden")).toEqual({ name: "Updated Garden" });
    expect(fixture.load).toHaveBeenCalledTimes(2);
  });
  it("does not cache failed reads as missing properties", async () => {
    fixture.load.mockRejectedValueOnce(new Error("DATABASE_UNAVAILABLE")).mockResolvedValueOnce(null);
    await expect(loadPublicHotel("garden")).rejects.toThrow("DATABASE_UNAVAILABLE");
    expect(await loadPublicHotel("garden")).toBeNull();
    expect(fixture.load).toHaveBeenCalledTimes(2);
  });
});
