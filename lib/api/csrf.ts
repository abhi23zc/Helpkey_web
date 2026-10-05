import { ApiException } from "@/lib/api/errors";

/** Header the Helpkey mobile app sends on every request. */
export const CLIENT_HEADER = "x-helpkey-client";
export const MOBILE_CLIENT = "mobile";

/**
 * CSRF guard for state-changing requests.
 *
 * Browsers always attach `Sec-Fetch-Site`/`Origin`, so the normal path verifies them. Native apps send
 * neither, so they identify themselves with a custom header. That is safe because a web page cannot add a
 * custom header to a cross-site request without a CORS preflight, and this server grants none. Cross-site
 * browser requests are rejected *before* the header is considered, so a page cannot spoof its way in.
 *
 * CSRF only exists to protect ambient (cookie) credentials from a victim's browser; a native client holds
 * no such browser session, so exempting it does not weaken the browser flow.
 */
export function validateOrigin(request: Request, env: { production: boolean } = { production: process.env.NODE_ENV === "production" }) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new ApiException("CSRF_REJECTED", 403, "Cross-site requests are not allowed.");
  if (request.headers.get(CLIENT_HEADER) === MOBILE_CLIENT) return;
  const origin = request.headers.get("origin");
  if (!origin) {
    if (env.production && !["same-origin", "same-site"].includes(request.headers.get("sec-fetch-site") ?? "")) throw new ApiException("CSRF_REJECTED", 403, "A trusted request origin is required.");
    return;
  }
  const expectedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!expectedHost || new URL(origin).host !== expectedHost) throw new ApiException("CSRF_REJECTED", 403, "The request origin is not allowed.");
}
