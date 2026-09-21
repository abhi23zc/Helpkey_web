import "server-only";

import { apiContext } from "@/lib/api/context";
import { cacheKey, withRedis } from "@/lib/redis";

export class ProviderError extends Error {
  constructor(public readonly provider: string, public readonly code: string, public readonly retrySafe: boolean, public readonly status = 503) { super(code); }
}

export async function providerFetch(provider: string, url: string | URL, init: RequestInit & { timeoutMs?: number; idempotent?: boolean } = {}) {
  const circuitKey = cacheKey("circuit", provider);
  const circuit = await withRedis((redis) => redis.get(circuitKey));
  if (circuit === "open") throw new ProviderError(provider, "PROVIDER_UNAVAILABLE", true);
  const attempts = init.idempotent ? 2 : 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 8_000);
    try {
      const { timeoutMs: _timeout, idempotent: _idempotent, ...requestInit } = init;
      void _timeout; void _idempotent;
      const response = await fetch(url, { ...requestInit, signal: controller.signal, cache: "no-store" });
      console.info(JSON.stringify({ level: "info", event: "provider.request", provider, requestId: apiContext.current()?.requestId, durationMs: Math.round(performance.now() - started), outcome: response.ok ? "ok" : `http_${response.status}` }));
      if (response.status >= 500) throw new ProviderError(provider, "PROVIDER_UPSTREAM_ERROR", true);
      await withRedis((redis) => redis.del(`${circuitKey}:failures`, circuitKey));
      return response;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) continue;
      const failures = await withRedis((redis) => redis.incr(`${circuitKey}:failures`));
      if (failures === 1) await withRedis((redis) => redis.expire(`${circuitKey}:failures`, 60));
      if (failures !== null && failures >= 5) await withRedis((redis) => redis.set(circuitKey, "open", "EX", 30));
      console.warn(JSON.stringify({ level: "warn", event: "provider.failure", provider, requestId: apiContext.current()?.requestId, durationMs: Math.round(performance.now() - started), errorCode: error instanceof Error ? error.name : "UNKNOWN" }));
    } finally { clearTimeout(timeout); }
  }
  if (lastError instanceof ProviderError) throw lastError;
  throw new ProviderError(provider, lastError instanceof Error && lastError.name === "AbortError" ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE", true);
}
