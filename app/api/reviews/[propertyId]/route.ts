import { withApiHandler } from "@/lib/api/handler";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { hasCompletedStay, ownReview, REVIEW_COLLECTION } from "@/lib/reviews";
import { enqueueProjection } from "@/lib/projections";
import { invalidatePublic } from "@/lib/api/cache";

const schema = z.object({ rating: z.number().int().min(1).max(5), text: z.string().trim().min(10).max(3000) }).strict();
const reviewId = (propertyId: string, uid: string) => `${propertyId}_${uid}`;
async function customer() { const user = await getAuthenticatedUser(); if (!user) throw new Error("UNAUTHENTICATED"); return user; }

const rawGET = async function GET(_request: Request, { params }: RouteContext<"/api/reviews/[propertyId]">) {
  try { const user = await customer(); const { propertyId } = await params; const [doc, eligible] = await Promise.all([adminDb.collection(REVIEW_COLLECTION).doc(reviewId(propertyId, user.uid)).get(), hasCompletedStay(user.uid, propertyId)]); return Response.json({ review: doc.exists ? ownReview(doc) : null, eligible }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to load review." }, { status: error instanceof Error && error.message === "UNAUTHENTICATED" ? 401 : 422 }); }
}
const rawPOST = async function POST(request: Request, { params }: RouteContext<"/api/reviews/[propertyId]">) {
  try {
    const user = await customer(); const { propertyId } = await params; const input = schema.parse(await request.json()); const [property, eligible] = await Promise.all([adminDb.collection("properties").doc(propertyId).get(), hasCompletedStay(user.uid, propertyId)]);
    if (!property.exists || property.data()?.status !== "active" || property.data()?.approvalStatus !== "approved") throw new Error("PROPERTY_NOT_AVAILABLE");
    if (!eligible) throw new Error("COMPLETED_STAY_REQUIRED");
    const ref = adminDb.collection(REVIEW_COLLECTION).doc(reviewId(propertyId, user.uid));
    await adminDb.runTransaction(async tx => { if ((await tx.get(ref)).exists) throw new Error("REVIEW_ALREADY_EXISTS"); tx.create(ref, { propertyId, reviewerId: user.uid, reviewerName: user.fullName || "Helpkey guest", rating: input.rating, text: input.text, photoIds: [], hasPhotos: false, replyState: "awaiting", sentiment: input.rating >= 4 ? "positive" : input.rating <= 2 ? "critical" : "neutral", status: "approved", submittedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), createdBy: user.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid, editHistory: [{ action: "published", at: new Date(), rating: input.rating }] }); enqueueProjection(tx, "review_summary", propertyId); });
    await invalidatePublic("home", "search:*", "property:*", "bookable:*");
    return Response.json({ review: ownReview(await ref.get()) }, { status: 201 });
  } catch (error) { const message = error instanceof Error ? error.message : "Unable to submit review."; return Response.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 422 }); }
}
const rawPATCH = async function PATCH(request: Request, { params }: RouteContext<"/api/reviews/[propertyId]">) {
  try {
    const user = await customer(); const { propertyId } = await params; const input = schema.parse(await request.json()); const [eligible] = await Promise.all([hasCompletedStay(user.uid, propertyId)]); if (!eligible) throw new Error("COMPLETED_STAY_REQUIRED"); const ref = adminDb.collection(REVIEW_COLLECTION).doc(reviewId(propertyId, user.uid));
    await adminDb.runTransaction(async tx => { const current = await tx.get(ref); if (!current.exists || current.data()?.reviewerId !== user.uid) throw new Error("REVIEW_NOT_FOUND"); tx.update(ref, { rating: input.rating, text: input.text, sentiment: input.rating >= 4 ? "positive" : input.rating <= 2 ? "critical" : "neutral", status: "approved", moderationReason: null, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid, editHistory: FieldValue.arrayUnion({ action: "edited_and_published", at: new Date(), rating: input.rating }) }); enqueueProjection(tx, "review_summary", propertyId); });
    await invalidatePublic("home", "search:*", "property:*", "bookable:*");
    return Response.json({ review: ownReview(await ref.get()) });
  } catch (error) { const message = error instanceof Error ? error.message : "Unable to update review."; return Response.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 422 }); }
}

export const GET = withApiHandler(rawGET, { route: "/api/reviews/[propertyId]", auth: "read", requireAuth: true, cache: "private" });
export const POST = withApiHandler(rawPOST, { route: "/api/reviews/[propertyId]", auth: "strict", requireAuth: true, cache: "private" });
export const PATCH = withApiHandler(rawPATCH, { route: "/api/reviews/[propertyId]", auth: "strict", requireAuth: true, cache: "private" });
