import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), limit: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/firebase/admin", () => ({ adminDb: { collection: () => ({ doc: () => ({ id: "request-reference", create: mocks.create }) }) } }));
vi.mock("@/lib/auth/session", () => ({ getAuthenticatedUser: mocks.auth }));
vi.mock("@/lib/api/rate-limit", () => ({ enforceRateLimit: mocks.limit }));

import { POST } from "@/app/api/privacy-requests/route";
import { ApiException } from "@/lib/api/errors";

const valid = { kind: "account-deletion", name: "Guest", contact: "guest@example.com", accountIdentifier: "+919876543210", message: "", confirmed: true, website: "" };
const request = (body: unknown, origin = "https://helpkey.example") => new Request("https://helpkey.example/api/privacy-requests", { method: "POST", headers: { origin, host: "helpkey.example", "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => { vi.clearAllMocks(); mocks.create.mockResolvedValue(undefined); mocks.limit.mockResolvedValue(undefined); });

describe("public privacy requests", () => {
  it("accepts a request without login and confirms only after it is stored", async () => {
    const response = await POST(request(valid), undefined);
    expect(response.status).toBe(201);
    expect((await response.json()).data.reference).toBe("request-reference");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ kind: "account-deletion", accountIdentifier: "+919876543210", status: "pending" }));
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it.each([{ ...valid, confirmed: false }, { ...valid, accountIdentifier: "" }, { ...valid, contact: "not-a-contact" }, { ...valid, website: "spam" }, { ...valid, message: "x".repeat(2001) }])("does not persist an invalid request", async body => {
    expect((await POST(request(body), undefined)).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects cross-origin submissions before writing", async () => {
    expect((await POST(request(valid, "https://another.example"), undefined)).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not claim success when storage fails", async () => {
    mocks.create.mockRejectedValueOnce(new Error("storage unavailable"));
    expect((await POST(request(valid), undefined)).status).toBe(500);
  });
  it("fails closed when abuse protection is unavailable", async () => {
    mocks.limit.mockRejectedValueOnce(new ApiException("RATE_LIMIT_UNAVAILABLE", 503, "Temporarily unavailable."));
    expect((await POST(request(valid), undefined)).status).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("allows privacy questions through the same contact channel", async () => {
    expect((await POST(request({ ...valid, kind: "privacy-question", accountIdentifier: "", message: "How can I correct my profile?" }), undefined)).status).toBe(201);
  });
});
