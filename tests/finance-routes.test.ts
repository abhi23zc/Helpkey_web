import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiException } from "@/lib/api/errors";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  access: vi.fn(),
  read: vi.fn(),
  mutate: vi.fn(),
  history: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getAuthenticatedUser: mocks.auth }));
vi.mock("@/lib/partner/pms/route-access", () => ({
  authorizePartnerRequest: mocks.access,
}));
vi.mock("@/lib/finance/service", () => ({
  readFinance: mocks.read,
  mutateFinance: mocks.mutate,
  financeHistory: mocks.history,
}));
import {
  GET as adminGET,
  POST as adminPOST,
} from "@/app/api/admin/finance/route";
import {
  GET as ownerGET,
  POST as ownerPOST,
} from "@/app/api/partner/properties/[propertyId]/finance/route";
const context = { params: Promise.resolve({ propertyId: "hotel" }) };
const request = (path: string, body?: unknown) =>
  new Request(
    `http://localhost${path}`,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: {
            origin: "http://localhost",
            host: "localhost",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
  );
describe("finance HTTP boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ uid: "owner" });
    mocks.access.mockResolvedValue(undefined);
    mocks.read.mockResolvedValue({ revision: 1 });
    mocks.mutate.mockResolvedValue({ revision: 2 });
    mocks.history.mockResolvedValue({ events: [], nextCursor: null });
  });
  it("requires authentication and strict session validation", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await ownerGET(
      request("/api/partner/properties/hotel/finance"),
      context,
    );
    expect(response.status).toBe(401);
    expect(mocks.auth).toHaveBeenCalledWith("strict");
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("runs partner middleware before finance reads and writes", async () => {
    mocks.access.mockRejectedValue(new ApiException("FORBIDDEN", 403));
    expect(
      (
        await ownerGET(
          request("/api/partner/properties/hotel/finance"),
          context,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await ownerPOST(
          request("/api/partner/properties/hotel/finance", {
            action: "profile",
          }),
          context,
        )
      ).status,
    ).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("checks CSRF before mutation", async () => {
    const r = new Request("http://localhost/api/admin/finance", {
      method: "POST",
      headers: { origin: "https://foreign.example", host: "localhost" },
      body: "{}",
    });
    expect((await adminPOST(r, context)).status).toBe(403);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("returns private responses with request identity and expected conflict status", async () => {
    const response = await ownerGET(
      request("/api/partner/properties/hotel/finance"),
      context,
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(await response.json()).toMatchObject({
      data: { revision: 1 },
      requestId: expect.any(String),
    });
    expect(mocks.read).toHaveBeenCalledWith("owner", "hotel", false);
    mocks.mutate.mockRejectedValue(
      new ApiException("FINANCE_CONFLICT", 409, "Retain the draft"),
    );
    const conflict = await ownerPOST(
      request("/api/partner/properties/hotel/finance", { expectedRevision: 0 }),
      context,
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({
      error: { code: "FINANCE_CONFLICT" },
    });
  });
  it("routes Admin global, hotel and paginated history requests with Admin authorization", async () => {
    await adminGET(request("/api/admin/finance?propertyId=hotel"), context);
    expect(mocks.read).toHaveBeenCalledWith("owner", "hotel", true);
    await adminGET(
      request("/api/admin/finance?history=1&cursor=page"),
      context,
    );
    expect(mocks.history).toHaveBeenCalledWith("owner", "page");
    await adminPOST(
      request("/api/admin/finance", { action: "global" }),
      context,
    );
    expect(mocks.mutate).toHaveBeenCalledWith(
      "owner",
      { action: "global" },
      undefined,
      true,
    );
  });
});
