import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/admin/data";
import { adminDb } from "@/lib/firebase/admin";
import { enqueueProjection, type ProjectionKind } from "@/lib/projections";

const retrySchema = z.object({ jobId: z.string().min(1).max(300) }).strict();
const kinds = new Set<ProjectionKind>(["property_search", "review_summary", "daily_metrics", "dashboard_summary", "cache_invalidation"]);

async function get() {
  const actor = await getAuthenticatedUser("strict"); if (!actor) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  await requireAdmin(actor.uid);
  const snapshot = await adminDb.collection("projectionJobs").where("status", "in", ["retryable", "dead"]).limit(50).get();
  return Response.json({ jobs: snapshot.docs.map((doc) => ({ id: doc.id, kind: doc.data().kind, entityId: doc.data().entityId, status: doc.data().status, attempts: doc.data().attempts ?? 0, lastErrorCode: doc.data().lastErrorCode ?? null })) });
}

async function post(request: Request) {
  const actor = await getAuthenticatedUser("strict"); if (!actor) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  await requireAdmin(actor.uid); const { jobId } = retrySchema.parse(await request.json()); const failedRef = adminDb.collection("projectionJobs").doc(jobId);
  await adminDb.runTransaction(async (tx) => { const failed = await tx.get(failedRef); const data = failed.data(); if (!data || !["retryable", "dead"].includes(data.status) || !kinds.has(data.kind)) throw new Error("PROJECTION_NOT_RETRYABLE"); enqueueProjection(tx, data.kind as ProjectionKind, String(data.entityId), Number(data.version) || 1); tx.set(failedRef, { status: "retried", retriedBy: actor.uid, retriedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); });
  return Response.json({ ok: true });
}

export const GET = withApiHandler(get, { route: "/api/admin/projections", auth: "strict", requireAuth: true, cache: "private" });
export const POST = withApiHandler(post, { route: "/api/admin/projections", auth: "strict", requireAuth: true, cache: "private" });
