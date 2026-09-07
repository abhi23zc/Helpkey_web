import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/admin/data";
import { adminDb } from "@/lib/firebase/admin";
import { refreshPropertyReviewSummary, REVIEW_COLLECTION, REVIEW_PHOTOS_COLLECTION } from "@/lib/reviews";
const schema = z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().trim().max(1000).optional() }).strict();
export async function POST(request: Request, { params }: RouteContext<"/api/admin/reviews/[reviewId]/moderate">) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try { await requireAdmin(user.uid); const { reviewId } = await params; const input = schema.parse(await request.json()); const ref = adminDb.collection(REVIEW_COLLECTION).doc(reviewId); let propertyId = ""; await adminDb.runTransaction(async tx => { const review = await tx.get(ref); if (!review.exists || review.data()?.status !== "pending") throw new Error("REVIEW_NOT_PENDING"); const data = review.data()!; propertyId = data.propertyId; const status = input.decision === "approve" ? "approved" : "rejected"; const photoIds = Array.isArray(data.photoIds) ? data.photoIds.filter((id): id is string => typeof id === "string") : []; const photos = await Promise.all(photoIds.map(id => tx.get(adminDb.collection(REVIEW_PHOTOS_COLLECTION).doc(id)))); tx.update(ref, { status, moderationReason: input.decision === "reject" ? input.reason || null : null, moderatedAt: FieldValue.serverTimestamp(), moderatedBy: user.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid, editHistory: FieldValue.arrayUnion({ action: input.decision === "approve" ? "approved" : "rejected", at: new Date(), actorId: user.uid }) }); for (const photo of photos) if (photo.exists) tx.update(photo.ref, { status, isPrivate: input.decision !== "approve", moderatedAt: FieldValue.serverTimestamp(), moderatedBy: user.uid }); }); await refreshPropertyReviewSummary(propertyId); return Response.json({ ok: true }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to moderate review." }, { status: 422 }); }
}
