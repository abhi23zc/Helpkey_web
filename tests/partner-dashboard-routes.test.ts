import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: { uid: "owner" }, owner: vi.fn(), overview: vi.fn(), get: vi.fn(), serialize: vi.fn() }));
vi.mock("@/lib/api/handler", () => ({ actorFromRequest: () => mocks.actor, withApiHandler: (fn: unknown) => fn }));
vi.mock("@/lib/partner/dashboard/service", () => ({ loadOverview: mocks.overview }));
vi.mock("@/lib/partner/service", () => ({ propertyOwner: mocks.owner, requireRole: vi.fn() }));
vi.mock("@/lib/partner/reservations/access", () => ({ authorize: mocks.owner }));
vi.mock("@/lib/firebase/admin", () => ({ adminDb: { collection: () => ({ doc: () => ({ get: mocks.get }) }) } }));
vi.mock("@/lib/bookings", () => ({ serializeBookingWithResolvedMedia: mocks.serialize }));
import { GET as overview } from "@/app/api/partner/dashboard/overview/route";
import { GET as detail } from "@/app/api/partner/bookings/[bookingId]/route";
describe("partner dashboard API boundaries", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.owner.mockResolvedValue({}); mocks.overview.mockResolvedValue({ generatedAt: "now" }); mocks.get.mockResolvedValue({ id: "b", data: () => ({ propertyId: "hotel" }) }); mocks.serialize.mockResolvedValue({ id: "b" }); });
  it("validates actual calendar dates before querying", async () => { await expect(overview(new Request("http://localhost/api?propertyId=hotel&date=2026-02-30"), undefined)).rejects.toThrow(); expect(mocks.overview).not.toHaveBeenCalled(); });
  it("passes the authenticated owner and filters to the service", async () => { const response = await overview(new Request("http://localhost/api?propertyId=hotel&date=2026-10-31&range=weekly"), undefined); expect(response.status).toBe(200); expect(mocks.overview).toHaveBeenCalledWith("owner", { propertyId: "hotel", date: "2026-10-31", range: "weekly" }); });
  it("rejects foreign-property overview access", async () => { mocks.overview.mockRejectedValue(new Error("FORBIDDEN")); await expect(overview(new Request("http://localhost/api?propertyId=hotel&date=2026-10-31"), undefined)).rejects.toMatchObject({ status: 403 }); });
  it("does not serialize reservation details before ownership succeeds", async () => { mocks.owner.mockRejectedValue(new Error("FORBIDDEN")); await expect(detail(new Request("http://localhost/api"), { params: Promise.resolve({ bookingId: "b" }) })).rejects.toMatchObject({ status: 403 }); expect(mocks.serialize).not.toHaveBeenCalled(); });
  it("returns an authorized reservation and handles missing records", async () => { expect((await detail(new Request("http://localhost/api"), { params: Promise.resolve({ bookingId: "b" }) })).status).toBe(200); mocks.get.mockResolvedValue({ data: () => undefined }); await expect(detail(new Request("http://localhost/api"), { params: Promise.resolve({ bookingId: "missing" }) })).rejects.toMatchObject({ status: 404 }); });
});
