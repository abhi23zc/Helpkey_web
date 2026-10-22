import { FieldValue, Timestamp, type Firestore, type DocumentReference } from "firebase-admin/firestore";
import { components, projectionStateId, type ProjectionComponent, type ProjectionJob } from "./jobs";
type Writer = { set(ref: DocumentReference, data: FirebaseFirestore.DocumentData, options?: FirebaseFirestore.SetOptions): unknown };
/** No reads: safe after the caller's transaction reads and in write batches. */
export function writeProjection(db: Firestore, writer: Writer, kind: ProjectionJob["kind"], entityId: string, version = 1, options: { components?: ProjectionComponent[]; reviewId?: string } = {}) {
  const ref = db.collection("projectionOutbox").doc(), now = FieldValue.serverTimestamp();
  writer.set(ref, { kind, entityId, version, eventId: ref.id, ...options, status: "pending", dispatchAttempts: 0, recoverable: true, nextRecoveryAt: Timestamp.now(), createdAt: now, updatedAt: now });
  if (kind === "property_search") {
    const requested = Object.fromEntries((options.components ?? components).map(component => [component, ref.id]));
    writer.set(db.collection("projectionState").doc(projectionStateId(entityId, kind)), { requested, updatedAt: now }, { merge: true });
  }
  if (kind === "review_summary") writer.set(db.collection("propertyReviewState").doc(entityId), { requestedRevision: FieldValue.increment(1) }, { merge: true });
  return ref.id;
}
