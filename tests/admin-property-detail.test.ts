import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ records: {} as Record<string, Record<string, unknown>[]>, user: vi.fn() }));
vi.mock("@/lib/firebase/admin", () => ({ adminDb: { collection: (name: string) => {
  const query = { where: () => query, limit: () => query, get: async () => ({ docs: (mocks.records[name] ?? []).map((record, index) => snapshot(String(record.id ?? index), record)) }) };
  return { ...query, doc: (id: string) => ({ get: async () => { const data = mocks.records[name]?.find(record => record.id === id); return snapshot(id, data); } }) };
} } }));
vi.mock("@/lib/partner/service", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/auth/users", () => ({ serializeUser: mocks.user }));
function snapshot(id: string, data?: Record<string, unknown>) { return { id, exists: !!data, data: () => data, get: (key: string) => data?.[key] }; }
import { listingDetail } from "@/lib/admin/data";
beforeEach(() => {
  mocks.user.mockReturnValue({ uid: "owner", fullName: "Owner", email: "owner@example.com" });
  mocks.records = {
    properties: [{ id: "test", ownerId: "owner", status: "pending_review", approvalStatus: "pending", geoPoint: { latitude: 0, longitude: 77 }, coverMediaId: "photo", bookingModes: ["hourly"], cleaningBufferMinutes: 0, petPolicy: { allowed: false } }],
    users: [{ id: "owner" }], partnerProfiles: [{ id: "owner", businessName: "Business" }],
    roomTypes: [{ id: "suite", name: "Suite", mediaIds: ["photo"], maxChildren: 0 }],
    ratePlans: [{ id: "hourly", roomTypeId: "suite", durationMinutes: 180, allowMidnightCrossing: false, cancellationPolicyId: "flex" }],
    cancellationPolicies: [{ id: "flex", freeCancellationHours: 0 }], amenities: [{ id: "wifi", code: "wifi" }],
    mediaAssets: [{ id: "photo", kind: "property_image", category: "room", roomTypeId: "suite", moderationStatus: "approved", r2ObjectKey: "private/photo", checksum: "secret", reviewedBy: "admin", reviewedAt: { toDate: () => new Date("2026-10-20T10:00:00Z") }, publication: { status: "failed", lastErrorCode: "SOURCE_MISSING", attempts: 2 } }],
    verificationDocuments: [{ id: "gst", documentType: "gst", status: "pending", r2ObjectKey: "private/document", reviewedBy: "admin" }],
  };
});
describe("admin detail review DTO", () => {
  it("normalizes zero coordinates and preserves hourly, zero, false, and policy relationships", async () => {
    const data = await listingDetail("test");
    expect(data.property).toMatchObject({ latitude: 0, longitude: 77, cleaningBufferMinutes: 0, petPolicy: { allowed: false } });
    expect(data.ratePlans[0]).toMatchObject({ roomTypeId: "suite", durationMinutes: 180, allowMidnightCrossing: false, cancellationPolicyId: "flex" });
    expect(data.policies[0]).toMatchObject({ freeCancellationHours: 0 });
    expect(data.owner).toMatchObject({ uid: "owner", fullName: "Owner" });
  });
  it("includes asset associations and review/publication metadata without storage keys", async () => {
    const data = await listingDetail("test");
    expect(data.media[0]).toMatchObject({ roomTypeId: "suite", roomGalleryIds: ["suite"], reviewedBy: "admin", reviewedAt: "2026-10-20T10:00:00.000Z", publicationStatus: "failed", publicationErrorCode: "SOURCE_MISSING", publicationAttempts: 2 });
    expect(data.documents[0]).toMatchObject({ documentType: "gst", status: "pending", reviewedBy: "admin" });
    expect(JSON.stringify([...data.media, ...data.documents])).not.toMatch(/r2ObjectKey|checksum|private\//);
    expect(data.approvalReadiness.blockers).toContain("Approved photos: Suite · Bathroom photo");
  });
  it("handles absent owner and business records without an invalid document path", async () => {
    mocks.records.properties[0].ownerId = null;
    const data = await listingDetail("test");
    expect(data.owner).toBeNull(); expect(data.partner).toBeNull();
  });
  it("rejects missing properties", async () => {
    await expect(listingDetail("missing")).rejects.toThrow("PROPERTY_NOT_FOUND");
  });
});
