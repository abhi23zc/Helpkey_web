import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import type { AppUser } from "@/types/auth";

export type ApiAuthMode = "public" | "read" | "strict";
export type ApiRequestContext = {
  requestId: string;
  route: string;
  authMode: ApiAuthMode;
  actor: AppUser | null;
  startedAt: number;
  authMs: number;
  firestoreOperations: number;
  firestoreMs: number;
  redisHits: number;
  redisMisses: number;
  redisErrors: number;
  redisMs: number;
  projectionFallbacks: number;
};

const storage = new AsyncLocalStorage<ApiRequestContext>();

export const apiContext = {
  run<T>(context: ApiRequestContext, callback: () => T): T {
    return storage.run(context, callback);
  },
  current() {
    return storage.getStore();
  },
  actor() {
    return storage.getStore()?.actor ?? null;
  },
  countFirestore(durationMs = 0, operations = 1) {
    const current = storage.getStore();
    if (current) {
      current.firestoreOperations += operations;
      current.firestoreMs += durationMs;
    }
  },
  projectionFallback() {
    const current = storage.getStore();
    if (current) current.projectionFallbacks += 1;
  },
  countRedis(durationMs: number, outcome: "hit" | "miss" | "error") {
    const current = storage.getStore();
    if (!current) return;
    current.redisMs += durationMs;
    if (outcome === "hit") current.redisHits += 1;
    else if (outcome === "miss") current.redisMisses += 1;
    else current.redisErrors += 1;
  },
};
