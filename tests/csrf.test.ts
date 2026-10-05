import { describe, expect, it } from "vitest";
import { validateOrigin } from "@/lib/api/csrf";

const req = (headers: Record<string, string>, method = "POST") => new Request("https://api.helpkey.in/api/bookings/quote", { method, headers });
const prod = { production: true };
const rejects = (fn: () => void) => { try { fn(); } catch (error) { return (error as { code?: string }).code === "CSRF_REJECTED"; } return false; };

describe("validateOrigin", () => {
  it("never checks safe methods", () => {
    expect(() => validateOrigin(req({ "sec-fetch-site": "cross-site" }, "GET"), prod)).not.toThrow();
  });
  it("accepts same-origin browser requests", () => {
    expect(() => validateOrigin(req({ origin: "https://api.helpkey.in", host: "api.helpkey.in", "sec-fetch-site": "same-origin" }), prod)).not.toThrow();
  });
  it("rejects a different origin", () => {
    expect(rejects(() => validateOrigin(req({ origin: "https://evil.example", host: "api.helpkey.in" }), prod))).toBe(true);
  });
  it("rejects a cross-site browser request", () => {
    expect(rejects(() => validateOrigin(req({ "sec-fetch-site": "cross-site" }), prod))).toBe(true);
  });
  it("rejects an originless, non-browser request in production (the old behaviour)", () => {
    expect(rejects(() => validateOrigin(req({}), prod))).toBe(true);
  });
  it("allows originless requests outside production", () => {
    expect(() => validateOrigin(req({}), { production: false })).not.toThrow();
  });
  it("lets the mobile app through in production via its client header", () => {
    expect(() => validateOrigin(req({ "x-helpkey-client": "mobile" }), prod)).not.toThrow();
  });
  it("ignores unknown client header values", () => {
    expect(rejects(() => validateOrigin(req({ "x-helpkey-client": "anything-else" }), prod))).toBe(true);
  });
  it("does NOT let a cross-site browser request bypass the guard by sending the header", () => {
    expect(rejects(() => validateOrigin(req({ "x-helpkey-client": "mobile", "sec-fetch-site": "cross-site" }), prod))).toBe(true);
  });
});
