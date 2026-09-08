import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/admin/data";
import { adminDb } from "@/lib/firebase/admin";
import { enqueuePublicationInTransaction } from "@/lib/media-publication";
import { refreshPropertyReviewSummary, REVIEW_COLLECTION, REVIEW_PHOTOS_COLLECTION } from "@/lib/reviews";

const schema = z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().trim().max(1000).optional() }).strict();

export async function POST(request: Request, { params }: RouteContext<"/api/admin/reviews/[reviewId]/moderate">) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    await requireAdmin(user.uid);
    const { reviewId } = await params;
    const input = schema.parse(await request.json());
    const reviewRef = adminDb.collection(REVIEW_COLLECTION).doc(reviewId);
    let propertyId = "";
    let queued = 0;
    await adminDb.runTransaction(async (tx) => {
      const review = await tx.get(reviewRef);
      const data = review.data();
      const photoOnly = data?.status === "approved" && data.photoModerationPending === true;
      if (!review.exists || !data || (data.status !== "pending" && !photoOnly)) throw new Error("REVIEW_NOT_PENDING");
      propertyId = data.propertyId;
      const photoIds = Array.isArray(data.photoIds) ? data.photoIds.filter((id): id is string => typeof id === "string") : [];
      const photos = await Promise.all(photoIds.map((id) => tx.get(adminDb.collection(REVIEW_PHOTOS_COLLECTION).doc(id))));
      const reviewStatus = photoOnly ? "approved" : input.decision === "approve" ? "approved" : "rejected";
      tx.update(reviewRef, { status: reviewStatus, photoModerationPending: false, moderationReason: input.decision === "reject" && !photoOnly ? input.reason || null : null, moderatedAt: FieldValue.serverTimestamp(), moderatedBy: user.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid, editHistory: FieldValue.arrayUnion({ action: photoOnly ? `photos_${input.decision}d` : input.decision === "approve" ? "approved" : "rejected", at: new Date(), actorId: user.uid }) });
      for (const photo of photos) {
        if (!photo.exists) continue;
        const raw = photo.data();
        if (!raw) continue;
        const shouldChange = raw.status === "pending" || (!photoOnly && input.decision === "reject" && raw.status === "approved");
        if (!shouldChange) continue;
        const status = input.decision === "approve" ? "approved" : "rejected";
        tx.update(photo.ref, { status, isPrivate: true, moderatedAt: FieldValue.serverTimestamp(), moderatedBy: user.uid });
        if (typeof raw.r2ObjectKey === "string" && typeof raw.checksum === "string") {
          enqueuePublicationInTransaction(tx, { operation: input.decision === "approve" ? "publish" : "unpublish", assetType: "review_photo", assetId: photo.id, sourceCollection: "reviewPhotos", sourceObjectKey: raw.r2ObjectKey, sourceChecksum: raw.checksum });
          queued++;
        }
      }
    });
    await refreshPropertyReviewSummary(propertyId);
    return Response.json({ ok: true, publicationStatus: queued ? input.decision === "approve" ? "queued" : "unpublishing" : null, queued });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to moderate review." }, { status: 422 });
  }
}
