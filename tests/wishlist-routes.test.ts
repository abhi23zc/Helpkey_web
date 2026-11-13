import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ uid: "alice", active: true, saved: new Map<string, Record<string, unknown>>() }));
vi.mock("@/lib/auth/session", () => ({ getAuthenticatedUser: async () => state.uid ? { uid: state.uid } : null }));
vi.mock("@/lib/customer/catalog", () => ({ publicPropertiesByIds: async (ids: string[]) => state.active ? ids.map(id => ({ id, name: "Public hotel" })) : [] }));
vi.mock("@/lib/firebase/admin", () => {
  const reference = (path: string) => ({ path, id: path.split("/").at(-1)!,
    collection: (name: string) => reference(`${path}/${name}`), doc: (id: string) => reference(`${path}/${id}`),
    orderBy: () => {
      let start = "", count = 25;
      const query = { limit: (n: number) => { count = n; return query; }, startAfter: (id: string) => { start = id; return query; }, get: async () => {
        const docs = [...state.saved.keys()].filter(key => key.startsWith(`${path}/`) && key.split("/").at(-1)! > start).sort().slice(0, count).map(key => ({ id: key.split("/").at(-1)! }));
        return { docs, size: docs.length };
      } };
      return query;
    },
    delete: async () => { state.saved.delete(path); },
  });
  const snapshot = (ref: { path: string; id: string }) => {
    const property = ref.path.startsWith("properties/");
    const value = property ? { status: state.active ? "active" : "paused", approvalStatus: "approved", isBookable: true } : state.saved.get(ref.path);
    return { id: ref.id, exists: !!value, get: (key: string) => value?.[key as keyof typeof value] };
  };
  return { adminDb: { collection: reference, getAll: async (...refs: { path: string; id: string }[]) => refs.map(snapshot), runTransaction: async (work: (tx: unknown) => unknown) => work({ get: async (ref: { path: string; id: string }) => snapshot(ref), set: (ref: { path: string }, value: Record<string, unknown>) => state.saved.set(ref.path, value) }) } };
});
import { GET } from "@/app/api/wishlist/route";
import { PUT, DELETE } from "@/app/api/wishlist/[propertyId]/route";
const context = { params: Promise.resolve({ propertyId: "hotel" }) };
const request = (method = "GET", query = "") => new Request(`http://localhost/api/wishlist${query}`, { method });
describe("account-owned saved hotels", () => {
  beforeEach(() => { state.uid = "alice"; state.active = true; state.saved.clear(); });
  it("requires authentication for reads and mutations", async () => {
    state.uid = "";
    expect((await GET(request(), {})).status).toBe(401);
    expect((await PUT(request("PUT"), context)).status).toBe(401);
    expect((await DELETE(request("DELETE"), context)).status).toBe(401);
  });
  it("saves idempotently and keeps accounts isolated", async () => {
    expect((await PUT(request("PUT"), context)).status).toBe(200);
    expect((await PUT(request("PUT"), context)).status).toBe(200);
    expect(state.saved.size).toBe(1);
    expect((await (await GET(request("GET", "?ids=true&propertyId=hotel"), {})).json()).data.propertyIds).toEqual(["hotel"]);
    state.uid = "bob";
    expect((await (await GET(request(), {})).json()).data.items).toEqual([]);
    await DELETE(request("DELETE"), context);
    expect(state.saved.size).toBe(1);
    state.uid = "alice";
    await DELETE(request("DELETE"), context); await DELETE(request("DELETE"), context);
    expect(state.saved.size).toBe(0);
  });
  it("does not expose private or unavailable hotel data", async () => {
    await PUT(request("PUT"), context);
    state.active = false;
    const page = (await (await GET(request(), {})).json()).data;
    expect(page.items).toEqual([{ propertyId: "hotel", property: null }]);
    expect((await PUT(request("PUT"), context)).status).toBe(404);
  });
  it("rejects cross-account cursors", async () => {
    await PUT(request("PUT"), context);
    state.saved.set("users/alice/savedProperties/second", {});
    const page = (await (await GET(request("GET", "?limit=1"), {})).json()).data;
    expect(page.hasMore).toBe(true);
    state.uid = "bob";
    expect((await GET(request("GET", `?cursor=${encodeURIComponent(page.nextCursor)}`), {})).status).toBe(422);
  });
  it("paginates all saved IDs exactly once, including when the cursor entry is removed", async () => {
    for (let i = 0; i < 81; i++) state.saved.set(`users/alice/savedProperties/hotel_${String(i).padStart(3, "0")}`, {});
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const params = new URLSearchParams({ limit: "17" });
      if (cursor) params.set("cursor", cursor);
      const page = (await (await GET(request("GET", `?${params}`), {})).json()).data;
      ids.push(...page.items.map((item: { propertyId: string }) => item.propertyId));
      cursor = page.hasMore ? page.nextCursor : null;
      if (ids.length === 17) state.saved.delete(`users/alice/savedProperties/${ids.at(-1)}`);
    } while (cursor);
    expect(ids).toHaveLength(81);
    expect(new Set(ids).size).toBe(81);
  });
  it("bounds membership lookups at fifty IDs and deduplicates repeated inputs", async () => {
    const params = new URLSearchParams({ ids: "true" });
    for (let i = 0; i < 60; i++) {
      const id = `hotel_${i}`;
      state.saved.set(`users/alice/savedProperties/${id}`, {});
      params.append("propertyId", id);
      params.append("propertyId", id);
    }
    const result = (await (await GET(request("GET", `?${params}`), {})).json()).data;
    expect(result.propertyIds).toHaveLength(50);
    expect(new Set(result.propertyIds).size).toBe(50);
  });
  it("retains unavailable entries across pages and permits their removal", async () => {
    state.active = false;
    for (let i = 0; i < 3; i++) state.saved.set(`users/alice/savedProperties/hotel${i}`, {});
    const page = (await (await GET(request("GET", "?limit=2"), {})).json()).data;
    expect(page.items).toEqual([{ propertyId:"hotel0",property:null },{ propertyId:"hotel1",property:null }]);
    expect(page.hasMore).toBe(true);
    expect((await DELETE(request("DELETE"), { params:Promise.resolve({ propertyId:"hotel0" }) })).status).toBe(200);
    expect(state.saved.has("users/alice/savedProperties/hotel0")).toBe(false);
  });

});
