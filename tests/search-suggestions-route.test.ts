import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("@/lib/customer/catalog", () => ({ searchSuggestions: state.search }));
vi.mock("@/lib/api/cache", () => ({ cachedPublic: (_key: unknown, loader: () => Promise<unknown>) => loader() }));
vi.mock("@/lib/api/handler", () => ({ withApiHandler: (handler: unknown) => handler }));
vi.mock("@/lib/api/rate-limit", () => ({ enforceRateLimit: async () => {} }));
vi.mock("@/lib/api/request", () => ({ clientIp: () => "test", privateFingerprint: () => "test" }));
import { GET } from "@/app/api/search/suggestions/route";

describe("suggestion failure reporting", () => {
  it("returns real matches and valid empty results", async () => {
    state.search.mockResolvedValueOnce([{ type: "city", label: "Kanpur" }]);
    expect(await (await GET(new Request("http://test/api/search/suggestions?q=kan"), undefined)).json()).toEqual({ suggestions: [{ type: "city", label: "Kanpur" }] });
    state.search.mockResolvedValueOnce([]);
    expect(await (await GET(new Request("http://test/api/search/suggestions?q=unknown"), undefined)).json()).toEqual({ suggestions: [] });
  });
  it("lets the shared API handler report database errors instead of claiming no matches", async () => {
    state.search.mockRejectedValueOnce(new Error("DATABASE_UNAVAILABLE"));
    await expect(GET(new Request("http://test/api/search/suggestions?q=kan"), undefined)).rejects.toThrow("DATABASE_UNAVAILABLE");
  });
});
