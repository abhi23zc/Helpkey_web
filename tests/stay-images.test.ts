import { beforeEach, describe, it, expect, vi } from "vitest";
import sharp from "sharp";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  owner: vi.fn(),
  put: vi.fn(),
  set: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getAuthenticatedUser: mocks.user }));
vi.mock("@/lib/partner/service", () => ({ propertyOwner: mocks.owner }));
vi.mock("@/lib/r2", () => ({ putPrivateObject: mocks.put }));
vi.mock("@/lib/api/handler", () => ({
  withApiHandler: (handler: unknown) => handler,
}));
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({ collection: () => ({ doc: () => ({ set: mocks.set }) }) }),
    }),
  },
}));
import { POST } from "@/app/api/partner/properties/[propertyId]/stay-image/route";
const context = { params: Promise.resolve({ propertyId: "hotel" }) };
async function upload(bytes: Uint8Array, type = "image/png") {
  const form = new FormData();
  form.append("image", new File([Buffer.from(bytes)], "image.png", { type }));
  return POST(
    new Request("http://localhost/image", { method: "POST", body: form }),
    context,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ uid: "owner" });
  mocks.owner.mockResolvedValue({});
  mocks.put.mockResolvedValue(undefined);
});
describe("offering image upload", () => {
  it("requires an authenticated authorized hotel owner", async () => {
    mocks.user.mockResolvedValueOnce(null);
    expect((await upload(new Uint8Array())).status).toBe(401);
    mocks.owner.mockRejectedValueOnce(new Error("FORBIDDEN"));
    expect((await upload(new Uint8Array())).status).toBe(403);
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("rejects fake image content and unsupported files before storing an asset", async () => {
    expect((await upload(Buffer.from("not an image"))).status).toBe(422);
    expect((await upload(Buffer.from("data"), "text/plain")).status).toBe(422);
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("strips metadata and saves a resized WebP using the existing private storage", async () => {
    const input = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const response = await upload(input);
    expect(response.status).toBe(200);
    expect((await response.json()).imageId).toMatch(/^[a-f0-9-]{36}$/);
    const [key, body, type] = mocks.put.mock.calls[0];
    expect(key).toMatch(/^stay-offerings\/hotel\//);
    expect(type).toBe("image/webp");
    expect((await sharp(body).metadata()).width).toBe(960);
  });
  it("returns a clear failure without claiming an upload succeeded", async () => {
    const input = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    mocks.put.mockRejectedValueOnce(
      new Error("Image storage unavailable. Try again."),
    );
    const response = await upload(input);
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("storage unavailable");
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
