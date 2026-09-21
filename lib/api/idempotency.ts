import "server-only";

import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";

const LEASE_MS = 2 * 60_000;
export const idempotencyKey = (...parts: string[]) => createHash("sha256").update(parts.join("\0")).digest("hex");

export async function runIdempotent<T>(scope: string, key: string, actorId: string, operation: () => Promise<T>): Promise<T> {
  const ref = adminDb.collection("idempotencyKeys").doc(idempotencyKey(scope, actorId, key));
  const existing = await adminDb.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref); const data = snapshot.data(); const now = Date.now();
    if (data?.status === "completed") return { completed: true as const, result: data.result as T };
    if (data?.status === "processing" && data.leaseExpiresAt instanceof Timestamp && data.leaseExpiresAt.toMillis() > now) throw new ApiException("IDEMPOTENCY_IN_PROGRESS", 409, "An identical request is already processing.");
    tx.set(ref, { scope, actorId, requestFingerprint: idempotencyKey(key), status: "processing", leaseExpiresAt: Timestamp.fromMillis(now + LEASE_MS), attempts: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp(), createdAt: data?.createdAt ?? FieldValue.serverTimestamp() }, { merge: true });
    return { completed: false as const };
  });
  if (existing.completed) return existing.result;
  try {
    const result = await operation();
    await ref.set({ status: "completed", result, leaseExpiresAt: null, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return result;
  } catch (error) {
    await ref.set({ status: "failed", leaseExpiresAt: null, lastErrorCode: error instanceof Error ? error.message.slice(0, 100) : "UNKNOWN", updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
    throw error;
  }
}
