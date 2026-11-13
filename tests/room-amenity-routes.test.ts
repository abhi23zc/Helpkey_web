import { beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ records: new Map<string, Record<string, unknown>>(), writes: vi.fn(), owner: vi.fn(), signedIn: true }));
vi.mock("@/lib/api/handler", () => ({ withApiHandler: (fn: unknown) => fn }));
vi.mock("@/lib/auth/session", () => ({ getAuthenticatedUser: async () => fixture.signedIn ? { uid: "owner" } : null }));
vi.mock("@/lib/api/cache", () => ({ invalidatePublic: vi.fn() }));
vi.mock("@/lib/projections", () => ({ enqueueProjection: vi.fn() }));
vi.mock("@/lib/partner/service", async importOriginal => ({ ...await importOriginal<object>(), propertyOwner: fixture.owner }));
vi.mock("@/lib/firebase/admin", () => {
  const snapshot = (path: string) => ({ exists: fixture.records.has(path), data: () => fixture.records.get(path) });
  return { adminDb: {
    collection: (name: string) => ({
      doc: (id = "new-room") => ({ id, path: `${name}/${id}`, get: async () => snapshot(`${name}/${id}`) }),
      limit: () => ({ get: async () => ({ docs: [{ id: "catalog-wifi", data: () => ({ code: "wifi", name: "Wi-Fi" }) }] }) }),
    }),
    batch: () => ({ set: fixture.writes, commit: async () => {} }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
      get: async (ref: { path: string }) => snapshot(ref.path),
      update: (ref: { path: string }, data: Record<string, unknown>) => { fixture.writes(ref, data); fixture.records.set(ref.path, { ...fixture.records.get(ref.path), ...data }); },
    }),
  }, adminAuth: {} };
});

import { PATCH } from "@/app/api/partner/properties/[propertyId]/room-types/[roomTypeId]/route";
import { POST } from "@/app/api/partner/properties/[propertyId]/room-types/route";
import { invalidatePublic } from "@/lib/api/cache";
import { enqueueProjection } from "@/lib/projections";
const request = (body: unknown) => new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) });
const context = (roomTypeId = "normal") => ({ params: Promise.resolve({ propertyId: "hotel", roomTypeId }) });

beforeEach(() => {
  vi.clearAllMocks(); fixture.records.clear(); fixture.signedIn = true;
  fixture.records.set("properties/hotel", {});
  fixture.records.set("roomTypes/normal", { propertyId: "hotel", name: "Normal", amenityIds: ["Wi-Fi", "Legacy lamp"] });
  fixture.records.set("roomTypes/deluxe", { propertyId: "hotel", name: "Deluxe", amenityIds: ["bathtub"] });
});

it("updates only the chosen room and refreshes guest projections/caches", async () => {
  const response = await PATCH(request({ amenityIds: ["wifi", "Wi-Fi", "Legacy lamp", "tv"] }), context());
  expect(response.status).toBe(200);
  expect((await response.json()).roomType.amenityIds).toEqual(["catalog-wifi", "Legacy lamp", "tv"]);
  expect(fixture.records.get("roomTypes/deluxe")?.amenityIds).toEqual(["bathtub"]);
  expect(enqueueProjection).toHaveBeenCalledWith(expect.anything(), "property_search", "hotel", 1, { components: ["pricing", "amenities"] });
  expect(invalidatePublic).toHaveBeenCalledWith("home", "search:*", "property:*", "bookable:*");
});
it("clears amenities without changing room details", async () => {
  const response = await PATCH(request({ amenityIds: [] }), context());
  expect(response.status).toBe(200);
  expect(fixture.records.get("roomTypes/normal")).toMatchObject({ name: "Normal", amenityIds: [] });
});
it("rejects unknown new amenities without writing", async () => {
  expect((await PATCH(request({ amenityIds: ["Invented facility"] }), context())).status).toBe(422);
  expect(fixture.writes).not.toHaveBeenCalled();
});
it("preserves existing amenities during a details-only update", async () => {
  expect((await PATCH(request({ name: "New Normal" }), context())).status).toBe(200);
  expect(fixture.records.get("roomTypes/normal")?.amenityIds).toEqual(["Wi-Fi", "Legacy lamp"]);
});
it("rejects unsigned, unauthorized and foreign-room updates", async () => {
  fixture.signedIn = false;
  expect((await PATCH(request({ amenityIds: [] }), context())).status).toBe(401);
  fixture.signedIn = true;
  fixture.owner.mockRejectedValueOnce(new Error("FORBIDDEN"));
  expect((await PATCH(request({ amenityIds: [] }), context())).status).toBe(422);
  expect((await PATCH(request({ amenityIds: [] }), context("missing"))).status).toBe(422);
  fixture.records.set("roomTypes/foreign", { propertyId: "another-hotel" });
  expect((await PATCH(request({ amenityIds: [] }), context("foreign"))).status).toBe(422);
  expect(fixture.writes).not.toHaveBeenCalled();
});
it("validates and normalizes amenities when creating a room", async () => {
  const room = { name: "Standard", description: "A comfortable standard room", totalInventory: 2, maxAdults: 2, maxChildren: 0, maxInfants: 0, bedConfigurations: [{ bedType: "double", count: 1 }] };
  const response = await POST(request({ ...room, amenityIds: ["Wi-Fi", "AC"] }), context());
  expect(response.status).toBe(201);
  expect((await response.json()).roomType.amenityIds).toEqual(["catalog-wifi", "air_conditioning"]);
  fixture.writes.mockClear();
  expect((await POST(request({ ...room, amenityIds: ["invented"] }), context())).status).toBe(422);
  expect(fixture.writes).not.toHaveBeenCalled();
});
