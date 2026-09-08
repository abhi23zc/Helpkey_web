import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/admin/data";
import { adminDb } from "@/lib/firebase/admin";
import { z } from "zod";

const retrySchema = z.object({ jobId: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

export async function GET() {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try { await requireAdmin(user.uid); const jobs = await adminDb.collection("mediaPublicationJobs").where("status", "in", ["retryable", "dead"]).limit(100).get(); return Response.json({ jobs: jobs.docs.map((doc) => { const data = doc.data(); return { id: doc.id, operation: data.operation, assetType: data.assetType, assetId: data.assetId, status: data.status, attempts: data.attempts ?? 0, lastErrorCode: data.lastErrorCode ?? null, updatedAt: data.updatedAt?.toDate?.().toISOString?.() ?? null }; }) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "ADMIN_REQUIRED" }, { status: 403 }); }
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    await requireAdmin(user.uid); const { jobId } = retrySchema.parse(await request.json()); const ref = adminDb.collection("mediaPublicationJobs").doc(jobId);
    await adminDb.runTransaction(async (tx) => { const job = await tx.get(ref); const data = job.data(); if (!data || !["dead", "retryable"].includes(data.status)) throw new Error("MEDIA_PUBLICATION_IN_PROGRESS"); tx.update(ref, { status: "queued", attempts: 0, notBefore: Timestamp.now(), leaseOwner: null, leaseExpiresAt: null, lastErrorCode: null, updatedAt: FieldValue.serverTimestamp(), retriedBy: user.uid }); });
    return Response.json({ ok: true, status: "queued" });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "MEDIA_PUBLICATION_FAILED" }, { status: 422 }); }
}
