import { z } from "zod";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/admin/data";
import { adminDb } from "@/lib/firebase/admin";
import { withQueueRedis, queueDiagnostics, requestRebuild } from "@/lib/background/queue-admin";
import { bookingKinds, bookingCollection } from "@/lib/background/booking-jobs";
import { backgroundKey, backgroundMode } from "@/lib/background/config";
import { projectionSchema, publicationSchema } from "@/lib/background/jobs";
import { writeProjection } from "@/lib/background/enqueue";
import { writePublication } from "@/lib/background/publication";
const collections = ["projectionOutbox", "mediaPublicationOutbox", "bookingNotificationOutbox", "refunds"] as const;
async function authorize() { const actor = await getAuthenticatedUser("strict"); if (!actor) throw new Error("UNAUTHENTICATED"); await requireAdmin(actor.uid); return actor; }
async function get() {
  await authorize();
  const heartbeats = await withQueueRedis(async redis => {
    const mode = backgroundMode();
    const names = [...(mode === "legacy" ? [] : ["background-recovery"]), ...(mode === "queue" ? [] : ["projection-dispatcher", "media-dispatcher", "bookings-expiry", "bookings-payments", "bookings-refunds", "bookings-notifications"])];
    const keys = [...names.map(name => backgroundKey("heartbeat", name)), ...await redis.smembers(backgroundKey("worker-heartbeats"))];
    const values = keys.length ? await redis.mget(...keys) : [];
    const expired = keys.filter((key, index) => !values[index] && key.split(":heartbeat:")[1]?.includes(":"));
    if (expired.length) await redis.srem(backgroundKey("worker-heartbeats"), ...expired);
    return keys.map((key, index) => ({ worker: key.split(":heartbeat:")[1], ...(values[index] ? JSON.parse(values[index]!) : { at: null }), healthy: !!values[index] }));
  });
  const failures = await Promise.all(collections.map(async collection => {
    const page = await adminDb.collection(collection).where("status", "in", ["dead", "quarantined", "attention", "failed", "dispatch_retry", "retryable"]).limit(25).get();
    return { collection, jobs: page.docs.map(doc => ({ id: doc.id, status: doc.get("status"), attempts: doc.get("attempts") ?? 0, error: doc.get("lastErrorCode") ?? doc.get("lastErrorMessage") ?? doc.get("lastError") ?? null })) };
  }));
  const overdue = await Promise.all(["projectionOutbox", "mediaPublicationOutbox"].map(async collection => {
    const page = await adminDb.collection(collection).where("recoverable", "==", true).where("nextRecoveryAt", "<=", Timestamp.fromMillis(Date.now() - 600_000)).limit(25).get();
    return { collection, overdue: page.docs.map(doc => doc.id) };
  }));
  const attention = await Promise.all(bookingKinds.map(async kind => {
    const records = await adminDb.collection(bookingCollection(kind)).where(`backgroundAttention.${kind}`, "==", true).limit(25).get();
    return { kind, records: records.docs.map(doc => ({ id: doc.id, error: doc.get("lastBackgroundError") ?? null })) };
  }));
  return Response.json({ mode: backgroundMode(), heartbeats, failures, attention, overdue, queue: await queueDiagnostics() }, { headers: { "Cache-Control": "no-store" } });
}
const retrySchema = z.object({ collection: z.enum(["projectionOutbox", "mediaPublicationOutbox", "bookingNotificationOutbox", "refunds", "bookings"]), kind: z.enum(bookingKinds).optional(), id: z.string().min(1).max(300).refine(value => !value.includes("/")) }).strict();
async function post(request: Request) {
  const actor = await authorize(), body = await request.json();
  if (body?.action === "rebuild") { const rebuild = await requestRebuild(); return Response.json(rebuild ?? { error: "QUEUE_UNAVAILABLE" }, { status: rebuild ? 202 : 503 }); }
  const input = retrySchema.parse(body);
  await adminDb.runTransaction(async tx => {
    const ref = adminDb.collection(input.collection).doc(input.id), data = (await tx.get(ref)).data();
    if (input.collection === "bookings" || input.collection === "refunds") {
      const kind = input.collection === "refunds" ? "refunds" : input.kind;
      if (!data || !kind || !["expiry", "payments", "refunds"].includes(kind) || !(data.backgroundAttention?.[kind] || input.collection === "refunds" && data.status === "attention")) throw new Error("JOB_NOT_RETRYABLE");
      const dueField = kind === "expiry" ? "expiryRetryAt" : kind === "payments" ? "nextReconcileAt" : "nextAttemptAt";
      tx.update(ref, { [`backgroundAttention.${kind}`]: false, [`backgroundFailures.${kind}`]: 0, [dueField]: Timestamp.now(), ...(kind === "refunds" ? { status: "retry" } : {}), retriedBy: actor.uid, retriedAt: FieldValue.serverTimestamp() }); return;
    }
    if (!data || !["dead", "quarantined", "dispatch_retry", "retryable"].includes(data.status) && !data.backgroundAttention?.notifications) throw new Error("JOB_NOT_RETRYABLE");
    const related = Array.isArray(data.groupIds) ? data.groupIds.map((id: string) => adminDb.collection(input.collection).doc(id)) : [ref];
    if (input.collection === "projectionOutbox") {
      const value = projectionSchema.parse({ ...data, eventId: input.id });
      writeProjection(adminDb, tx, value.kind, value.entityId, value.version, { ...(value.reviewId ? { reviewId: value.reviewId } : {}), ...(value.components ? { components: value.components } : {}) });
    } else if (input.collection === "mediaPublicationOutbox") {
      const value = publicationSchema.parse(data), asset = (await tx.get(adminDb.collection(value.sourceCollection).doc(value.assetId))).data();
      if (!asset || value.requestId && asset.publication?.requestId !== value.requestId || ((asset.moderationStatus ?? asset.status) === "approved") !== (value.operation === "publish")) throw new Error("MEDIA_REQUEST_SUPERSEDED");
      writePublication(adminDb, tx, { operation: value.operation, assetType: value.assetType, assetId: value.assetId, sourceCollection: value.sourceCollection, sourceObjectKey: value.sourceObjectKey, sourceChecksum: value.sourceChecksum });
    } else {
      tx.update(ref, { status: "pending", attempts: 0, "backgroundAttention.notifications": false, nextAttemptAt: Timestamp.now(), retriedBy: actor.uid }); return;
    }
    for (const record of related) tx.set(record, { status: "retried", recoverable: false, retriedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return Response.json({ ok: true });
}
export const GET = withApiHandler(get, { route: "/api/admin/workers", auth: "strict", requireAuth: true, cache: "private" });
export const POST = withApiHandler(post, { route: "/api/admin/workers", auth: "strict", requireAuth: true, cache: "private" });
