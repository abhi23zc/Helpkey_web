import { beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ records: new Map<string, Record<string, unknown>>(), writes: vi.fn(), owner: vi.fn() }));
vi.mock("@/lib/api/handler", () => ({ withApiHandler: (fn: unknown) => fn }));
vi.mock("@/lib/auth/session", () => ({ getAuthenticatedUser: async () => ({ uid: "owner" }) }));
vi.mock("@/lib/api/cache", () => ({ invalidatePublic: vi.fn() }));
vi.mock("@/lib/projections", () => ({ enqueueProjection: vi.fn() }));
vi.mock("@/lib/partner/service", async importOriginal => ({ ...await importOriginal<object>(), propertyOwner: fixture.owner }));
vi.mock("@/lib/firebase/admin", () => ({ adminDb: {
  collection: (name: string) => ({ doc: (id = "newDoc123") => ({ id, path: `${name}/${id}`, get: async () => ({ exists: fixture.records.has(`${name}/${id}`), data: () => fixture.records.get(`${name}/${id}`) }) }) }),
  batch: () => ({ set: fixture.writes, update: fixture.writes, commit: async () => {} }),
}, adminAuth: {} }));
import { POST } from "@/app/api/partner/properties/[propertyId]/rate-plans/route";
import { PATCH } from "@/app/api/partner/properties/[propertyId]/rate-plans/[ratePlanId]/route";
const base = { name: "Standard", roomTypeId: "room", cancellationPolicyId: "policy", basePricePaise: 70050, taxBasisPoints: 1234, customerFeePaise: 1051, depositBasisPoints: 2555 };
const context = { params: Promise.resolve({ propertyId: "hotel", ratePlanId: "saved" }) };
const request = (input: unknown) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(input) });
beforeEach(() => {
  vi.clearAllMocks(); fixture.records.clear();
  fixture.records.set("roomTypes/room", { propertyId: "hotel" });
  fixture.records.set("cancellationPolicies/policy", { propertyId: "hotel", status: "active" });
  fixture.records.set("ratePlans/saved", { ...base, code: "LEGACY", propertyId: "hotel", status: "active", stayRules: { minimumNights: 2 }, bookingMode: "overnight", pricingModel: "nightly" });
});
for (const bookingMode of ["overnight", "hourly"]) it(`creates ${bookingMode} with an automatic code`, async () => {
  const response = await POST(request({ ...base, bookingMode, pricingModel: bookingMode === "hourly" ? "duration" : "nightly", ...(bookingMode === "hourly" ? { durationPrices: [{ hours: 3, pricePaise: 70050 }] } : {}) }), context);
  expect(response.status).toBe(201);
  expect((await response.json()).ratePlan).toMatchObject({ code: "RATE_NEWDOC123", basePricePaise: 70050, taxBasisPoints: 1234, customerFeePaise: 1051, depositBasisPoints: 2555 });
});
it("accepts a legacy creation code and preserves a saved code on edits", async () => {
  expect((await (await POST(request({ ...base, code: "OLD" }), context)).json()).ratePlan.code).toBe("OLD");
  const response = await PATCH(request({ code: "CHANGE", basePricePaise: 70050, paymentMode: "pay_at_property" }), context);
  expect(response.status).toBe(200);
  expect((await response.json()).ratePlan).toMatchObject({ code: "LEGACY", basePricePaise: 70050, depositBasisPoints: 2555, minimumNights: 2 });
  expect(fixture.writes.mock.calls.at(-1)?.[1]).not.toHaveProperty("code");
});
it("rejects changing a saved stay type without writing", async () => {
  const response = await PATCH(request({ bookingMode: "hourly", pricingModel: "duration", durationPrices: [{ hours: 3, pricePaise: 70050 }] }), context);
  expect(response.status).toBe(422); expect((await response.json()).error).toContain("Create another price option"); expect(fixture.writes).not.toHaveBeenCalled();
});
it("returns understandable API failures and checks ownership", async () => {
  fixture.owner.mockRejectedValueOnce(new Error("FORBIDDEN"));
  const response = await POST(request(base), context);
  expect((await response.json()).error).toContain("permission"); expect(fixture.writes).not.toHaveBeenCalled();
});
