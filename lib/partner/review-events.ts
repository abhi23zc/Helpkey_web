import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

/* ---------- Property review audit trail (propertyReviewEvents) ---------- */

export type ReviewAction =
  | "submitted"
  | "approved"
  | "rejected"
  | "changes_requested"
  | "paused"
  | "resumed"
  | "archived"
  | "restored";

export interface ReviewEventInput {
  propertyId: string;
  actorId: string;
  actorRole: "partner" | "admin" | "system";
  action: ReviewAction;
  fromApprovalStatus: string;
  toApprovalStatus: string;
  fromStatus: string;
  toStatus: string;
  reason?: string | null;
  submissionAttempt?: number;
}

/** Minimal writer surface satisfied by both Transaction and WriteBatch. */
type DocWriter = {
  set: (ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData) => unknown;
};

/**
 * Writes an immutable audit record for a property state transition. Accepts a
 * transaction or write batch so it commits atomically with the property update.
 * Pure with respect to reads — never reads, only writes.
 */
export function recordReviewEvent(
  writer: DocWriter,
  input: ReviewEventInput,
): string {
  const ref = adminDb.collection("propertyReviewEvents").doc();
  const now = FieldValue.serverTimestamp();
  writer.set(ref, {
    propertyId: input.propertyId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    fromApprovalStatus: input.fromApprovalStatus,
    toApprovalStatus: input.toApprovalStatus,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    reason: input.reason ?? null,
    submissionAttempt: input.submissionAttempt ?? 0,
    createdAt: now,
    updatedAt: now,
    createdBy: input.actorId,
    updatedBy: input.actorId,
    deletedAt: null,
  });
  return ref.id;
}
