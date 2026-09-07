import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { ownReview, refreshPropertyReviewSummary, REVIEW_COLLECTION } from "@/lib/reviews";

const schema = z.object({ rating: z.number().int().min(1).max(5), text: z.string().trim().min(10).max(3000) }).strict();
const reviewId = (propertyId: string, uid: string) => `${propertyId}_${uid}`;
async function customer() { const user = await getAuthenticatedUser(); if (!user) throw new Error("UNAUTHENTICATED"); return user; }

export async function GET(_request: Request, { params }: RouteContext<"/api/reviews/[propertyId]">) {
  try { const user = await customer(); const { propertyId } = await params; const doc = await adminDb.collection(REVIEW_COLLECTION).doc(reviewId(propertyId, user.uid)).get(); return Response.json({ review: doc.exists ? ownReview(doc) : null }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to load review." }, { status: error instanceof Error && error.message === "UNAUTHENTICATED" ? 401 : 422 }); }
}
export async function POST(request: Request, { params }: RouteContext<"/api/reviews/[propertyId]">) {
  try {
    const user = await customer(); const { propertyId } = await params; const input = schema.parse(await request.json()); const property = await adminDb.collection("properties").doc(propertyId).get();
    if (!property.exists || property.data()?.status !== "active" || property.data()?.approvalStatus !== "approved") throw new Error("PROPERTY_NOT_AVAILABLE");
    const ref = adminDb.collection(REVIEW_COLLECTION).doc(reviewId(propertyId, user.uid));
    await adminDb.runTransaction(async tx => { if ((await tx.get(ref)).exists) throw new Error("REVIEW_ALREADY_EXISTS"); tx.create(ref, { propertyId, reviewerId: user.uid, reviewerName: user.fullName || "Helpkey guest", rating: input.rating, text: input.text, photoIds: [], status: "pending", submittedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), createdBy: user.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid, editHistory: [{ action: "submitted", at: new Date(), rating: input.rating }] }); });
    return Response.json({ review: ownReview(await ref.get()) }, { status: 201 });
  } catch (error) { const message = error instanceof Error ? error.message : "Unable to submit review."; return Response.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 422 }); }
}
export async function PATCH(request: Request, { params }: RouteContext<"/api/reviews/[propertyId]">) {
  try {
    const user = await customer(); const { propertyId } = await params; const input = schema.parse(await request.json()); const ref = adminDb.collection(REVIEW_COLLECTION).doc(reviewId(propertyId, user.uid)); let wasApproved = false;
    await adminDb.runTransaction(async tx => { const current = await tx.get(ref); if (!current.exists || current.data()?.reviewerId !== user.uid) throw new Error("REVIEW_NOT_FOUND"); wasApproved = current.data()?.status === "approved"; tx.update(ref, { rating: input.rating, text: input.text, status: "pending", updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid, editHistory: FieldValue.arrayUnion({ action: "edited", at: new Date(), rating: input.rating }) }); });
    if (wasApproved) await refreshPropertyReviewSummary(propertyId);
    return Response.json({ review: ownReview(await ref.get()) });
  } catch (error) { const message = error instanceof Error ? error.message : "Unable to update review."; return Response.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 422 }); }
}
