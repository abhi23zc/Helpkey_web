import { createHash } from "node:crypto";

/**
 * A request authenticates with exactly one of:
 *  - `Authorization: Bearer <Firebase ID token>`   (native app)
 *  - the `helpkey_session` cookie                  (browser)
 *
 * Kept free of Next/Firebase imports so the selection rules are unit-tested.
 */
export type Credential = { kind: "idToken" | "cookie"; value: string };

// Firebase tokens are JWTs: base64url segments separated by dots.
const BEARER = /^Bearer[ \t]+([A-Za-z0-9._-]{20,4096})$/i;

export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  return BEARER.exec(header.trim())?.[1] ?? null;
}

/**
 * Picks the credential for a request.
 *
 * If an `Authorization` header is present it is authoritative: a malformed one yields no credential
 * instead of silently falling back to a cookie, so a request can never be authenticated as a different
 * principal than the one it claims to be.
 */
export function selectCredential(
  authorization: string | null | undefined,
  cookie: string | null | undefined,
): Credential | null {
  if (authorization !== null && authorization !== undefined && authorization.trim() !== "") {
    const token = parseBearer(authorization);
    return token ? { kind: "idToken", value: token } : null;
  }
  return cookie ? { kind: "cookie", value: cookie } : null;
}

/** Stable cache key for a credential; the kind is part of the digest so a cookie and token can never collide. */
export function credentialDigest(credential: Credential): string {
  return createHash("sha256").update(`${credential.kind}:${credential.value}`).digest("hex");
}
