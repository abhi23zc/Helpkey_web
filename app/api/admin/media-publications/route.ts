import { withApiHandler } from "@/lib/api/handler";
import { FieldValue } from "firebase-admin/firestore";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/admin/data";
import { adminDb } from "@/lib/firebase/admin";
import { z } from "zod";
import { enqueuePublicationInTransaction } from "@/lib/media-publication";

const retrySchema = z.object({ jobId: z.string().regex(/^(?:job-)?[a-f0-9]{64}$/) }).strict();

const rawGET = async function GET() {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try { await requireAdmin(user.uid); const jobs = await adminDb.collection("mediaPublicationJobs").where("status", "in", ["retryable", "dead"]).limit(100).get(); return Response.json({ jobs: jobs.docs.map((doc) => { const data = doc.data(); return { id: doc.id, operation: data.operation, assetType: data.assetType, assetId: data.assetId, status: data.status, attempts: data.attempts ?? 0, lastErrorCode: data.lastErrorCode ?? null, updatedAt: data.updatedAt?.toDate?.().toISOString?.() ?? null }; }) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "ADMIN_REQUIRED" }, { status: 403 }); }
}

const rawPOST = async function POST(request: Request) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    await requireAdmin(user.uid); const { jobId } = retrySchema.parse(await request.json()); const ref = adminDb.collection("mediaPublicationJobs").doc(jobId);
    await adminDb.runTransaction(async tx => {
      const data = (await tx.get(ref)).data();
      if (!data || !["dead", "retryable"].includes(data.status)) throw new Error("MEDIA_PUBLICATION_IN_PROGRESS");
      const asset = (await tx.get(adminDb.collection(data.sourceCollection).doc(data.assetId))).data();
      if (!asset || (data.requestId && asset.publication?.requestId !== data.requestId)) throw new Error("MEDIA_REQUEST_SUPERSEDED");
      if (((asset.moderationStatus ?? asset.status) === "approved") !== (data.operation === "publish")) throw new Error("MEDIA_REQUEST_SUPERSEDED");
      enqueuePublicationInTransaction(tx, { operation: data.operation, assetType: data.assetType, assetId: data.assetId, sourceCollection: data.sourceCollection, sourceObjectKey: data.sourceObjectKey, sourceChecksum: data.sourceChecksum });
      tx.update(ref, { status: "retried", retriedBy: user.uid, updatedAt: FieldValue.serverTimestamp() });
      tx.set(adminDb.collection("mediaPublicationOutbox").doc(jobId), { status: "retried", recoverable: false }, { merge: true });
    });
    return Response.json({ ok: true, status: "queued" });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "MEDIA_PUBLICATION_FAILED" }, { status: 422 }); }
}

export const GET = withApiHandler(rawGET, { route: "/api/admin/media-publications", auth: "read", requireAuth: true, cache: "private" });
export const POST = withApiHandler(rawPOST, { route: "/api/admin/media-publications", auth: "strict", requireAuth: true, cache: "private" });
