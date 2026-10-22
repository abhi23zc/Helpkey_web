import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), detail: vi.fn(), transaction: vi.fn(), update: vi.fn(), invalidate: vi.fn(), event: vi.fn(), projection: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/api/handler", () => ({ withApiHandler: (handler: unknown) => handler }));
vi.mock("@/lib/auth/session", () => ({ getAuthenticatedUser: mocks.auth }));
vi.mock("@/lib/admin/data", () => ({ requireAdmin: mocks.admin, listingDetail: mocks.detail, recordReviewEvent: mocks.event }));
vi.mock("@/lib/firebase/admin", () => ({ adminDb: { collection: (name: string) => ({ name, doc: (id: string) => ({ name, id }), where: () => ({ name }) }), runTransaction: mocks.transaction } }));
vi.mock("@/lib/partner/service", () => ({ propertyPatchSchema: {} }));
vi.mock("@/lib/r2", () => ({ deleteR2Object: vi.fn() }));
vi.mock("@/lib/projections", () => ({ enqueueProjection: mocks.projection }));
vi.mock("@/lib/api/cache", () => ({ invalidatePublic: mocks.invalidate }));
vi.mock("@/lib/notifications/service", () => ({ notifyPropertyDecision: vi.fn() }));
import { GET } from "@/app/api/admin/properties/[propertyId]/route";
import { POST as review } from "@/app/api/admin/properties/[propertyId]/review/route";
import { POST as lifecycle } from "@/app/api/admin/properties/[propertyId]/lifecycle/route";
const context = { params: Promise.resolve({ propertyId: "test" }) };
const request = (body?: unknown) => new Request("http://localhost/api/admin/properties/test", body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const snapshot = (data: Record<string, unknown>) => ({ exists: true, data: () => data, get: (key: string) => data[key], id: String(data.id ?? "test") });
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ uid: "admin" }); mocks.admin.mockResolvedValue({}); mocks.detail.mockResolvedValue({ property: { id: "test" } }); mocks.invalidate.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(async callback => callback({ get: mocks.get, update: mocks.update }));
});
describe("admin property review routes", () => {
  it("requires a session and admin access before loading private detail", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    expect((await GET(request(), context)).status).toBe(401);
    expect(mocks.detail).not.toHaveBeenCalled();
    mocks.admin.mockRejectedValueOnce(new Error("FORBIDDEN"));
    expect((await GET(request(), context)).status).toBe(403);
    expect(mocks.detail).not.toHaveBeenCalled();
  });
  it("returns a recoverable missing property response", async () => {
    mocks.detail.mockRejectedValueOnce(new Error("PROPERTY_NOT_FOUND"));
    expect((await GET(request(), context)).status).toBe(404);
  });
  it.each(["reject", "request_changes"])("rejects blank %s reasons before any write", async decision => {
    const response = await review(request({ decision, reason: "   " }), context);
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe("REASON_REQUIRED");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("blocks approval for missing per-room photo coverage using the shared checklist", async () => {
    mocks.get.mockImplementation(async ref => {
      if (ref.name === "properties") return snapshot({ approvalStatus: "pending", status: "pending_review", coverMediaId: "photo0" });
      if (ref.name === "mediaAssets") return { docs: Array.from({ length: 6 }, (_, index) => snapshot({ id: `photo${index}`, kind: "property_image", category: "exterior", moderationStatus: "approved" })) };
      if (ref.name === "roomTypes") return { docs: [snapshot({ id: "suite", name: "Suite" })] };
      return { docs: ["pan", "government_id_front", "government_id_back"].map(documentType => snapshot({ documentType, status: "approved" })) };
    });
    const response = await review(request({ decision: "approve" }), context);
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("Approved photos: Suite · Bathroom photo");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("keeps decisions pending-only", async () => {
    mocks.get.mockResolvedValue(snapshot({ status: "active", approvalStatus: "approved" }));
    expect((await review(request({ decision: "reject", reason: "A reason" }), context)).status).toBe(422);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("applies a change request and its audit event in one transaction", async () => {
    mocks.get.mockResolvedValue(snapshot({ status: "pending_review", approvalStatus: "pending", submissionCount: 2 }));
    expect((await review(request({ decision: "request_changes", reason: "Replace PAN" }), context)).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "draft", approvalStatus: "changes_requested", isBookable: false, rejectionReason: "Replace PAN" }));
    expect(mocks.event).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "changes_requested", submissionAttempt: 2 }));
  });
  it("rejects resume and archive on pending review", async () => {
    mocks.get.mockResolvedValue(snapshot({ status: "pending_review", approvalStatus: "pending" }));
    for (const action of ["resume", "archive"]) {
      const response = await lifecycle(request({ action }), context);
      expect(response.status).toBe(422);
      expect((await response.json()).error).toBe("INVALID_LIFECYCLE_TRANSITION");
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("restores unapproved archived listings to a nonbookable draft", async () => {
    mocks.get.mockResolvedValue(snapshot({ status: "archived", approvalStatus: "rejected" }));
    expect((await lifecycle(request({ action: "restore" }), context)).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "draft", isBookable: false }));
  });
});
