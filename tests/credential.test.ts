import { describe, expect, it } from "vitest";
import { credentialDigest, parseBearer, selectCredential } from "@/lib/auth/credential";

const JWT = "eyJhbGciOiJSUzI1NiJ9.eyJ1aWQiOiJ1MSJ9.c2lnbmF0dXJl";

describe("parseBearer", () => {
  it("extracts a well-formed token", () => {
    expect(parseBearer(`Bearer ${JWT}`)).toBe(JWT);
    expect(parseBearer(`bearer   ${JWT}`)).toBe(JWT);
    expect(parseBearer(`  Bearer ${JWT}  `)).toBe(JWT);
  });
  it("rejects other schemes, blanks and junk", () => {
    for (const bad of [null, undefined, "", "Basic abc", `Token ${JWT}`, "Bearer", "Bearer short", `Bearer ${JWT} extra`, `Bearer ${"a".repeat(5000)}`, "Bearer has spaces inside token value"]) {
      expect(parseBearer(bad as string | null)).toBeNull();
    }
  });
});

describe("selectCredential", () => {
  it("uses the cookie when there is no Authorization header", () => {
    expect(selectCredential(null, "cookie-value")).toEqual({ kind: "cookie", value: "cookie-value" });
    expect(selectCredential("", "cookie-value")).toEqual({ kind: "cookie", value: "cookie-value" });
  });
  it("uses the bearer token when present", () => {
    expect(selectCredential(`Bearer ${JWT}`, null)).toEqual({ kind: "idToken", value: JWT });
  });
  it("the Authorization header wins over a cookie", () => {
    expect(selectCredential(`Bearer ${JWT}`, "cookie-value")?.kind).toBe("idToken");
  });
  it("a malformed Authorization header never falls back to the cookie", () => {
    expect(selectCredential("Bearer nope", "cookie-value")).toBeNull();
    expect(selectCredential("Basic abc", "cookie-value")).toBeNull();
  });
  it("no credentials at all", () => {
    expect(selectCredential(null, null)).toBeNull();
    expect(selectCredential(undefined, undefined)).toBeNull();
  });
});

describe("credentialDigest", () => {
  it("is stable and distinguishes kinds for the same string", () => {
    const token = credentialDigest({ kind: "idToken", value: JWT });
    expect(token).toBe(credentialDigest({ kind: "idToken", value: JWT }));
    expect(token).not.toBe(credentialDigest({ kind: "cookie", value: JWT }));
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });
});
