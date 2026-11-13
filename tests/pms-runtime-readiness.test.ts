import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  property: {} as Record<string, unknown>,
  collections: [] as string[],
}));
vi.mock("@/lib/partner/pms/access", () => ({
  propertyAccess: async () => ({
    property: fixture.property,
    role: "owner",
    permissions: [],
    revision: 0,
    block: null,
  }),
}));
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection(name: string) {
      fixture.collections.push(name);
      const rows: Record<string, Record<string, unknown>[]> = {
        roomTypes: [{ id: "room", status: "active", totalInventory: 1 }],
        ratePlans: [
          {
            id: "rate",
            roomTypeId: "room",
            status: "active",
            basePricePaise: 10000,
            cancellationPolicyId: "policy",
          },
        ],
        physicalUnits: [
          { id: "unit", roomTypeId: "room", status: "active", label: "101" },
        ],
        cancellationPolicies: [{ id: "policy", status: "active" }],
      };
      if (!rows[name]) throw new Error(`Runtime must not scan ${name}`);
      const query = {
        where: () => query,
        limit: () => query,
        get: async () => ({
          size: rows[name].length,
          docs: rows[name].map((r) => ({ id: r.id, data: () => r })),
        }),
      };
      return query;
    },
  },
}));
const { setupStatus } = await import("@/lib/partner/pms/setup");
beforeEach(() => {
  fixture.collections = [];
  fixture.property = {
    name: "Hotel",
    address: { line1: "Road", city: "Test" },
    publicPhone: "123",
    timezone: "Asia/Kolkata",
    checkInTime: "14:00",
    checkOutTime: "11:00",
    inventoryEngine: "interval_v1",
    pms: {
      activatedAt: "saved",
      openingData: "none",
      teamReviewed: true,
      inventoryVerification: { passed: true },
    },
  };
});
describe("lightweight PMS readiness", () => {
  it("checks live configuration without reading reservations, holds, blocks or historical calendars", async () => {
    expect((await setupStatus("owner", "hotel")).state).toBe("ready");
    expect(fixture.collections).toEqual([
      "roomTypes",
      "ratePlans",
      "physicalUnits",
      "cancellationPolicies",
    ]);
  });
  it("reuses configuration inside one transaction but not another request", async () => {
    const tx = {
      get: (q: { get: () => Promise<unknown> }) => q.get(),
    } as unknown as FirebaseFirestore.Transaction;
    await setupStatus("owner", "hotel", tx);
    await setupStatus("owner", "hotel", tx);
    expect(fixture.collections).toHaveLength(4);
    await setupStatus("owner", "hotel");
    expect(fixture.collections).toHaveLength(8);
  });
  it("fails closed for unverified or failed inventory, and still detects changed setup", async () => {
    fixture.property.pms = {
      activatedAt: "saved",
      openingData: "none",
      teamReviewed: true,
    };
    expect((await setupStatus("owner", "hotel")).state).toBe("setup");
    fixture.property.pms = {
      activatedAt: "saved",
      openingData: "external",
      teamReviewed: true,
      inventoryVerification: { passed: true },
    };
    expect((await setupStatus("owner", "hotel")).state).toBe("setup");
  });
});
