import "server-only";

import { randomUUID } from "node:crypto";
import type { AppUser } from "@/types/auth";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiContext, type ApiAuthMode, type ApiRequestContext } from "@/lib/api/context";
import { ApiException, toApiException } from "@/lib/api/errors";

export type ApiSuccess<T, M = undefined> = { data: T; meta?: M; requestId: string };
export type ApiError = { error: { code: string; message: string; fieldErrors?: Record<string, string[]> }; requestId: string };

type RouteHandler<C = unknown> = (request: Request, context: C) => Response | Promise<Response>;
export type ApiHandlerOptions = {
  route: string;
  auth?: ApiAuthMode;
  requireAuth?: boolean;
  csrf?: boolean;
  cache?: "public" | "private" | "none";
  bodyLimitBytes?: number;
  legacyShape?: boolean;
};

function requestId(request: Request) {
  const supplied = request.headers.get("x-request-id");
  return supplied && /^[a-zA-Z0-9._:-]{8,128}$/.test(supplied) ? supplied : randomUUID();
}

function validateOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new ApiException("CSRF_REJECTED", 403, "Cross-site requests are not allowed.");
  const origin = request.headers.get("origin");
  if (!origin) {
    if (process.env.NODE_ENV === "production" && !["same-origin", "same-site"].includes(request.headers.get("sec-fetch-site") ?? "")) throw new ApiException("CSRF_REJECTED", 403, "A trusted request origin is required.");
    return;
  }
  const expectedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!expectedHost || new URL(origin).host !== expectedHost) throw new ApiException("CSRF_REJECTED", 403, "The request origin is not allowed.");
}

async function validateBodySize(request: Request, maximum: number) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > maximum) throw new ApiException("BODY_TOO_LARGE", 413, "The request body is too large.");
  if (["GET", "HEAD", "OPTIONS"].includes(request.method) || !request.body || length > 0) return;
  const reader = request.clone().body?.getReader();
  if (!reader) return;
  let received = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    received += chunk.value.byteLength;
    if (received > maximum) { await reader.cancel(); throw new ApiException("BODY_TOO_LARGE", 413, "The request body is too large."); }
  }
}

async function decorateResponse(response: Response, context: ApiRequestContext, options: ApiHandlerOptions) {
  const duration = performance.now() - context.startedAt;
  let responseBytes = Number(response.headers.get("content-length") ?? 0) || null;
  const headers = new Headers(response.headers);
  headers.set("x-request-id", context.requestId);
  headers.set("x-response-time", `${Math.round(duration)}ms`);
  headers.set("Server-Timing", `total;dur=${duration.toFixed(1)}, auth;dur=${context.authMs.toFixed(1)}, firestore;dur=${context.firestoreMs.toFixed(1)}, redis;dur=${context.redisMs.toFixed(1)}`);
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", response.ok && options.cache === "public" ? "public, s-maxage=60, stale-while-revalidate=300" : "private, no-store");
  }

  let output = response;
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status !== 204 && contentType.includes("application/json")) {
    const payload = await response.clone().json() as unknown;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const record = payload as Record<string, unknown>;
      if (response.ok) {
        const body = "data" in record && "requestId" in record
          ? record
          : options.legacyShape === false
            ? { data: record, requestId: context.requestId }
            : { ...record, data: record, requestId: context.requestId };
        responseBytes = Buffer.byteLength(JSON.stringify(body));
        output = Response.json(body, { status: response.status, statusText: response.statusText, headers });
      } else if (typeof record.error !== "object") {
        const code = typeof record.error === "string" ? record.error : `HTTP_${response.status}`;
        const standard = { code, message: typeof record.message === "string" ? record.message : code };
        const body = options.legacyShape === false
          ? { error: standard, requestId: context.requestId }
          : { ...record, apiError: standard, requestId: context.requestId };
        responseBytes = Buffer.byteLength(JSON.stringify(body));
        output = Response.json(body, { status: response.status, statusText: response.statusText, headers });
      }
    }
  }
  if (output === response) output = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  console.info(JSON.stringify({ level: "info", event: "api.request", requestId: context.requestId, route: options.route, method: context.route.split(" ")[0], status: response.status, durationMs: Math.round(duration), authMode: context.authMode, authMs: Math.round(context.authMs), firestoreOperations: context.firestoreOperations, firestoreMs: Math.round(context.firestoreMs), redisHits: context.redisHits, redisMisses: context.redisMisses, redisErrors: context.redisErrors, redisMs: Math.round(context.redisMs), responseBytes, projectionFallbacks: context.projectionFallbacks }));
  return output;
}

export function withApiHandler<C = unknown>(handler: RouteHandler<C>, options: ApiHandlerOptions): RouteHandler<C> {
  return async (request, routeContext) => {
    const context: ApiRequestContext = { requestId: requestId(request), route: `${request.method} ${options.route}`, authMode: options.auth ?? "public", actor: null, startedAt: performance.now(), authMs: 0, firestoreOperations: 0, firestoreMs: 0, redisHits: 0, redisMisses: 0, redisErrors: 0, redisMs: 0, projectionFallbacks: 0 };
    return apiContext.run(context, async () => {
      try {
        if (options.csrf !== false) validateOrigin(request);
        await validateBodySize(request, options.bodyLimitBytes ?? 1024 * 1024);
        if (context.authMode !== "public") {
          const started = performance.now();
          context.actor = await getAuthenticatedUser(context.authMode);
          context.authMs = performance.now() - started;
          if (options.requireAuth && !context.actor) throw new ApiException("UNAUTHENTICATED", 401, "Authentication is required.");
        }
        return await decorateResponse(await handler(request, routeContext), context, options);
      } catch (error) {
        const known = toApiException(error);
        const response = Response.json({ error: { code: known.code, message: known.message, ...(known.fieldErrors ? { fieldErrors: known.fieldErrors } : {}) }, requestId: context.requestId }, { status: known.status });
        return decorateResponse(response, context, { ...options, legacyShape: false });
      }
    });
  };
}

export function actorFromRequest(): AppUser {
  const actor = apiContext.actor();
  if (!actor) throw new ApiException("UNAUTHENTICATED", 401, "Authentication is required.");
  return actor;
}
