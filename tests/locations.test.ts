import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ limit: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({ enforceRateLimit: mocks.limit }));
vi.mock("@/lib/auth/session", () => ({ getAuthenticatedUser: vi.fn() }));
import { GET as autocomplete } from "@/app/api/locations/autocomplete/route";
import { GET as place } from "@/app/api/locations/place/route";
import { ApiException } from "@/lib/api/errors";

const token = "12345678-1234-4234-8234-123456789012";
const request = (path: string, params: Record<string, string>) => new Request(`https://helpkey.test/api/locations/${path}?${new URLSearchParams({ sessionToken: token, ...params })}`);
const details = () => ({ id: "delhi-id", displayName: { text: "Hauz Khas" }, formattedAddress: "Hauz Khas, Delhi, India",
  location: { latitude: 28.55, longitude: 77.2 }, addressComponents: [
    { longText: "India", shortText: "IN", types: ["country"] },
    { longText: "District", types: ["administrative_area_level_2"] },
    { longText: "New Delhi", types: ["locality"] },
  ] });
beforeEach(() => {
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "server-secret"); vi.stubGlobal("fetch", mocks.fetch);
  mocks.limit.mockResolvedValue(undefined); vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("guest Places endpoints", () => {
  it("returns Delhi predictions without touching the Helpkey catalog, with no durable caching", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ suggestions: [{ placePrediction: { placeId: "delhi-id", text: { text: "Delhi, India" }, structuredFormat: { mainText: { text: "Delhi" }, secondaryText: { text: "India" } } } }] }));
    const response = await autocomplete(request("autocomplete", { q: "Delhi" }), undefined);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).data).toEqual({ suggestions: [{ placeId: "delhi-id", label: "Delhi", secondary: "India" }] });
    const [url, options] = mocks.fetch.mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:autocomplete"); expect(options.cache).toBe("no-store");
    expect(options.headers["X-Goog-Api-Key"]).toBe("server-secret");
    expect(JSON.parse(options.body)).toMatchObject({ sessionToken: token, includedRegionCodes: ["in"], includedPrimaryTypes: ["locality", "sublocality", "administrative_area_level_2", "lodging"] });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it("uses locality before district, retains the token, and returns validated coordinates", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json(details()));
    const response = await place(request("place", { placeId: "delhi-id" }), undefined);
    expect(response.status).toBe(200);
    expect((await response.json()).data.place).toMatchObject({ name: "Hauz Khas", city: "New Delhi", latitude: 28.55, longitude: 77.2 });
    expect(new URL(mocks.fetch.mock.calls[0][0]).searchParams.get("sessionToken")).toBe(token);
  });
  it("falls back to district, then supports coordinate-only selections without fabricating a city", async () => {
    const p = details(); p.addressComponents = p.addressComponents.filter(c => !c.types.includes("locality"));
    mocks.fetch.mockResolvedValueOnce(Response.json(p));
    expect((await (await place(request("place", { placeId: "delhi-id" }), undefined)).json()).data.place.city).toBe("District");
    p.addressComponents = p.addressComponents.filter(c => c.types.includes("country"));
    mocks.fetch.mockResolvedValueOnce(Response.json(p));
    expect((await (await place(request("place", { placeId: "delhi-id" }), undefined)).json()).data.place.city).toBe("");
  });
  it.each([{ latitude: 91, longitude: 77 }, { latitude: 28, longitude: 181 }, null])("rejects invalid coordinates %j", async location => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ ...details(), location }));
    const response = await place(request("place", { placeId: "delhi-id" }), undefined);
    expect(response.status).toBe(503); expect((await response.json()).error.code).toBe("LOCATION_UNAVAILABLE");
  });
  it("rejects non-India results and mismatched place IDs", async () => {
    for (const p of [{ ...details(), id: "other-id" }, { ...details(), addressComponents: [{ longText: "USA", shortText: "US", types: ["country"] }] }]) {
      mocks.fetch.mockResolvedValueOnce(Response.json(p));
      expect((await place(request("place", { placeId: "delhi-id" }), undefined)).status).toBe(422);
    }
  });
  it.each([{ q: "a" }, { q: "a".repeat(121) }, { q: "Delhi", sessionToken: "bad-token" }])("bounds inputs before paid requests %j", async params => {
    const response = await autocomplete(request("autocomplete", { q: params.q, ...(params.sessionToken ? { sessionToken: params.sessionToken } : {}) }), undefined);
    expect(response.status).toBe(422); expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.limit).not.toHaveBeenCalled();
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });
  it("rejects arbitrary path input before calling Google", async () => {
    expect((await place(request("place", { placeId: "../private?key=x" }), undefined)).status).toBe(422);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("fails closed in production when rate protection is unavailable and preserves 429 errors", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const [code, status] of [["RATE_LIMIT_UNAVAILABLE", 503], ["RATE_LIMITED", 429]] as const) {
      mocks.limit.mockRejectedValueOnce(new ApiException(code, status));
      const response = await autocomplete(request("autocomplete", { q: "Delhi" }), undefined);
      expect(response.status).toBe(status); expect((await response.json()).error.code).toBe(code);
      expect(mocks.limit).toHaveBeenLastCalledWith(expect.objectContaining({ failClosed: true }));
    }
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("uses dedicated and shared budgets for both operations", async () => {
    vi.stubEnv("NODE_ENV", "production"); mocks.fetch.mockResolvedValueOnce(Response.json({ suggestions: [] }));
    await autocomplete(request("autocomplete", { q: "Delhi" }), undefined);
    expect(mocks.limit).toHaveBeenCalledWith(expect.objectContaining({ bucket: "places-autocomplete-ip", limit: 40, failClosed: true }));
    expect(mocks.limit).toHaveBeenCalledWith(expect.objectContaining({ bucket: "places-global", limit: 1000, failClosed: true }));
    mocks.fetch.mockResolvedValueOnce(Response.json(details())); await place(request("place", { placeId: "delhi-id" }), undefined);
    expect(mocks.limit).toHaveBeenCalledWith(expect.objectContaining({ bucket: "places-place-ip", limit: 15, failClosed: true }));
  });
  it("missing configuration makes no upstream call", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    expect((await autocomplete(request("autocomplete", { q: "Delhi" }), undefined)).status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("does not retry, log or return upstream failures or credentials", async () => {
    for (const result of [Response.json({ error: { message: "private-google-content server-secret" } }, { status: 403 }), Response.json({ suggestions: "private-google-content" })]) {
      mocks.fetch.mockResolvedValueOnce(result);
      const response = await autocomplete(request("autocomplete", { q: "Delhi" }), undefined);
      expect(response.status).toBe(503); expect(await response.text()).not.toContain("private-google-content");
    }
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toMatch(/server-secret|private-google-content|Delhi/);
  });
  it("upstream timeouts fail with the shared structured error", async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementationOnce((_url: string, options: RequestInit) => new Promise((_resolve, reject) => options.signal!.addEventListener("abort", () => reject(new Error("timeout")))));
    vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => {
      const abort = new AbortController(); setTimeout(() => abort.abort(), ms); return abort.signal;
    });
    const pending = autocomplete(request("autocomplete", { q: "Delhi" }), undefined);
    await vi.advanceTimersByTimeAsync(5000);
    const response = await pending; expect(response.status).toBe(503); expect((await response.json()).error.code).toBe("LOCATION_UNAVAILABLE");
    vi.useRealTimers();
  });
});
