import { beforeEach, describe, expect, it, vi } from "vitest";

// ── module mocks: only the edges, so the real credential-selection + verification logic runs ──
const state = { authorization: null as string | null, cookie: undefined as string | undefined };
const verifyIdToken = vi.fn();
const verifySessionCookie = vi.fn();
const getUserByUid = vi.fn();

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => (name === "authorization" ? state.authorization : null) }),
  cookies: async () => ({ get: (name: string) => (name === "helpkey_session" && state.cookie ? { value: state.cookie } : undefined), set: vi.fn(), delete: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/firebase/admin", () => ({ adminAuth: { verifyIdToken: (...a: unknown[]) => verifyIdToken(...a), verifySessionCookie: (...a: unknown[]) => verifySessionCookie(...a) }, adminDb: {} }));
vi.mock("@/lib/auth/users", () => ({ getUserByUid: (...a: unknown[]) => getUserByUid(...a) }));
vi.mock("@/lib/redis", () => ({ withRedis: async () => null, cacheKey: (...p: string[]) => p.join(":") }));

const { getAuthenticatedUser } = await import("@/lib/auth/session");

const JWT = "eyJhbGciOiJSUzI1NiJ9.eyJ1aWQiOiJ1MSJ9.c2lnbmF0dXJl";
const user = (over: Record<string, unknown> = {}) => ({ uid: "u1", fullName: "Asha", isActive: true, accountStatus: "active", roles: ["customer"], ...over });

beforeEach(() => {
  state.authorization = null;
  state.cookie = undefined;
  verifyIdToken.mockReset().mockResolvedValue({ uid: "u1" });
  verifySessionCookie.mockReset().mockResolvedValue({ uid: "u1" });
  getUserByUid.mockReset().mockResolvedValue(user());
});

describe("getAuthenticatedUser", () => {
  it("authenticates a bearer ID token with verifyIdToken", async () => {
    state.authorization = `Bearer ${JWT}`;
    await expect(getAuthenticatedUser("read")).resolves.toMatchObject({ uid: "u1" });
    expect(verifyIdToken).toHaveBeenCalledWith(JWT, false);
    expect(verifySessionCookie).not.toHaveBeenCalled();
  });

  it("still authenticates the browser cookie with verifySessionCookie (web is unchanged)", async () => {
    state.cookie = "session-cookie-value-123456";
    await expect(getAuthenticatedUser("read")).resolves.toMatchObject({ uid: "u1" });
    expect(verifySessionCookie).toHaveBeenCalledWith("session-cookie-value-123456", false);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("strict mode checks revocation for both credential types", async () => {
    state.authorization = `Bearer ${JWT}`;
    await getAuthenticatedUser("strict");
    expect(verifyIdToken).toHaveBeenCalledWith(JWT, true);
    state.authorization = null;
    state.cookie = "session-cookie-value-123456";
    await getAuthenticatedUser("strict");
    expect(verifySessionCookie).toHaveBeenCalledWith("session-cookie-value-123456", true);
  });

  it("the bearer token wins when both are sent", async () => {
    state.authorization = `Bearer ${JWT}`;
    state.cookie = "session-cookie-value-123456";
    await getAuthenticatedUser("read");
    expect(verifyIdToken).toHaveBeenCalledOnce();
    expect(verifySessionCookie).not.toHaveBeenCalled();
  });

  it("a malformed Authorization header is rejected, not downgraded to the cookie", async () => {
    state.authorization = "Bearer x";
    state.cookie = "session-cookie-value-123456";
    await expect(getAuthenticatedUser("read")).resolves.toBeNull();
    expect(verifySessionCookie).not.toHaveBeenCalled();
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("no credentials -> null", async () => {
    await expect(getAuthenticatedUser("read")).resolves.toBeNull();
  });

  it("an invalid or expired token -> null, never a throw", async () => {
    state.authorization = `Bearer ${JWT}`;
    verifyIdToken.mockRejectedValue(new Error("auth/id-token-expired"));
    await expect(getAuthenticatedUser("read")).resolves.toBeNull();
  });

  it("a valid token for a suspended or unknown account -> null", async () => {
    state.authorization = `Bearer ${JWT}`;
    getUserByUid.mockResolvedValue(user({ isActive: false }));
    await expect(getAuthenticatedUser("read")).resolves.toBeNull();
    getUserByUid.mockResolvedValue(null);
    await expect(getAuthenticatedUser("read")).resolves.toBeNull();
  });
});
