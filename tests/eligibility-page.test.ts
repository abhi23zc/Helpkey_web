import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  queries: [] as string[],
  batches: [] as string[][],
  limits: new Map<string, number>(),
  blocks: 0,
}));
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: (name: string) => {
      const q = {
        where: () => q,
        select: () => q,
        limit: (n: number) => {
          state.limits.set(name, n);
          return q;
        },
        get: async () => {
          state.queries.push(name);
          const rows =
            name === "bookings"
              ? Array.from({ length: 100 }, (_, i) => ({
                  id: `occupant-${i}`,
                  physicalUnitId: `occupied-${i}`,
                }))
              : Array.from({ length: state.blocks }, (_, i) => ({
                  id: `block-${i}`,
                  unitId: "other",
                  startAt: "2026-11-14T00:00:00Z",
                  endAt: "2026-11-14T01:00:00Z",
                }));
          return { docs: rows.map((row) => ({ id: row.id, data: () => row })) };
        },
        doc: (id: string) => ({ id, path: `${name}/${id}` }),
      };
      return q;
    },
    getAll: async (...refs: { id: string; path: string }[]) => {
      state.batches.push(refs.map((r) => r.path));
      return refs.map((r) => ({
        id: r.id,
        exists: r.path.startsWith("physicalUnits/"),
        data: () => ({
          propertyId: "hotel",
          roomTypeId: "type",
          status: "active",
          housekeepingStatus: "clean",
        }),
      }));
    },
  },
}));
import { loadPageEligibilityFacts } from "@/lib/partner/reservations/eligibility-server";
const b = {
  propertyId: "hotel",
  bookingStatus: "confirmed",
  roomType: { id: "type" },
  physicalUnitId: "room",
  startAt: "2026-11-14T00:00:00Z",
  endAt: "2026-11-14T01:00:00Z",
  timezone: "Asia/Kolkata",
};
const property = { pms: { operationalPolicies: { requireCleanRoom: true } } };
const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `booking-${i}`, data: b }));
beforeEach(() => {
  state.queries = [];
  state.batches = [];
  state.limits.clear();
  state.blocks = 0;
});
describe("bounded shared page eligibility", () => {
  it("reads occupancy and maintenance once for 50 rows and deduplicates room/calendar reads", async () => {
    const facts = await loadPageEligibilityFacts("hotel", rows(50), property);
    expect(state.queries.sort()).toEqual(["bookings", "inventoryBlocks"]);
    expect(state.batches).toHaveLength(2);
    expect(state.batches.flat()).toEqual([
      "physicalUnits/room",
      "physicalUnitCalendars/room_2026-11-14",
    ]);
    expect(state.limits.get("bookings")).toBe(10001);
    expect(state.limits.get("inventoryBlocks")).toBe(1001);
    expect(facts.size).toBe(50);
    expect(facts.get("booking-0")?.room).toEqual({
      valid: true,
      clean: true,
      occupied: false,
      maintenance: false,
    });
  });
  it("skips all room reads for policies off and already checked-in stays", async () => {
    await loadPageEligibilityFacts("hotel", rows(5), {});
    await loadPageEligibilityFacts(
      "hotel",
      [{ id: "in-house", data: { ...b, bookingStatus: "checked_in" } }],
      property,
    );
    expect(state.queries).toEqual([]);
    expect(state.batches).toEqual([]);
  });
  it("fails explicitly on bounds instead of returning partial policy facts", async () => {
    state.blocks = 1001;
    await expect(
      loadPageEligibilityFacts("hotel", rows(1), property),
    ).rejects.toMatchObject({ code: "ELIGIBILITY_LIMIT_EXCEEDED" });
    await expect(
      loadPageEligibilityFacts("hotel", rows(51), property),
    ).rejects.toMatchObject({ code: "ELIGIBILITY_LIMIT_EXCEEDED" });
  });
  it("rejects mixed hotel rows before any reads", async () => {
    await expect(
      loadPageEligibilityFacts("other-hotel", rows(1), property),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.queries).toEqual([]);
    expect(state.batches).toEqual([]);
  });
});
