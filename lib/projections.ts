import "server-only";

import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

export type ProjectionKind = "property_search" | "review_summary" | "daily_metrics" | "dashboard_summary" | "cache_invalidation";
type ProjectionWriter = { set(ref: DocumentReference, data: FirebaseFirestore.DocumentData, options?: FirebaseFirestore.SetOptions): unknown };
export function enqueueProjection(tx: ProjectionWriter, kind: ProjectionKind, entityId: string, version = 1) {
  const ref = adminDb.collection("projectionOutbox").doc();
  tx.set(ref, { kind, entityId, version, eventId: ref.id, status: "pending", dispatchAttempts: 0, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
}
