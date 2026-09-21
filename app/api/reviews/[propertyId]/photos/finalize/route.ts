import { withApiHandler } from "@/lib/api/handler";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { copyPrivateObject, deletePrivateObject, verifyR2Object } from "@/lib/r2";
import { hasCompletedStay, REVIEW_COLLECTION, REVIEW_PHOTOS_COLLECTION } from "@/lib/reviews";
import { enqueuePublicationInTransaction } from "@/lib/media-publication";
import { privatePreviewDto } from "@/lib/media-resolver";
import { enqueueProjection } from "@/lib/projections";

const schema = z.object({ uploadId: z.string().uuid() }).strict();

const rawPOST = async function POST(request: Request, { params }: RouteContext<"/api/reviews/[propertyId]/photos/finalize">) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    const { propertyId } = await params;
    const { uploadId } = schema.parse(await request.json());
    if (!await hasCompletedStay(user.uid, propertyId)) throw new Error("COMPLETED_STAY_REQUIRED");
    const upload = await adminDb.collection("pendingUploads").doc(uploadId).get();
    const data = upload.data();
    const reviewId = `${propertyId}_${user.uid}`;
    if (!data || data.ownerId !== user.uid || data.reviewId !== reviewId || data.kind !== "review_photo" || data.expiresAt < Date.now()) throw new Error("UPLOAD_EXPIRED");
    await verifyR2Object(data.objectKey, data.sizeBytes, data.checksum);
    const reviewRef = adminDb.collection(REVIEW_COLLECTION).doc(reviewId);
    const photoRef = adminDb.collection(REVIEW_PHOTOS_COLLECTION).doc();
    const originalKey = `originals/reviews/${reviewId}/${photoRef.id}`;
    await copyPrivateObject(data.objectKey, originalKey);
    await verifyR2Object(originalKey, data.sizeBytes, data.checksum);
    await adminDb.runTransaction(async (tx) => {
      const review = await tx.get(reviewRef);
      if (!review.exists || review.data()?.reviewerId !== user.uid || review.data()?.status !== "approved") throw new Error("REVIEW_NOT_FOUND");
      const photoIds = Array.isArray(review.data()?.photoIds) ? review.data()?.photoIds : [];
      if (photoIds.length >= 5) throw new Error("PHOTO_LIMIT_REACHED");
      tx.create(photoRef, { reviewId, propertyId, ownerId: user.uid, kind: "review_photo", fileName: data.fileName, mimeType: data.mimeType, sizeBytes: data.sizeBytes, checksum: data.checksum, r2ObjectKey: originalKey, status: "approved", isPrivate: true, publication: { status: "private", sourceChecksum: data.checksum, variants: {}, attempts: 0, lastErrorCode: null, queuedAt: null, publishedAt: null, updatedAt: FieldValue.serverTimestamp() }, createdAt: FieldValue.serverTimestamp(), createdBy: user.uid });
      enqueuePublicationInTransaction(tx, { operation: "publish", assetType: "review_photo", assetId: photoRef.id, sourceCollection: "reviewPhotos", sourceObjectKey: originalKey, sourceChecksum: data.checksum });
      tx.update(reviewRef, { photoIds: [...photoIds, photoRef.id], hasPhotos: true, photoModerationPending: false, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid, editHistory: FieldValue.arrayUnion({ action: "photo_published", at: new Date() }) });
      enqueueProjection(tx, "review_summary", propertyId);
    });
    await upload.ref.delete();
    await deletePrivateObject(data.objectKey).catch(() => {});
    const preview = await privatePreviewDto(photoRef.id, { r2ObjectKey: originalKey, mimeType: data.mimeType, fileName: data.fileName });
    return Response.json({ photoId: photoRef.id, photo: preview ? { id: preview.id, url: preview.url, fileName: preview.fileName } : null });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to finalize upload." }, { status: 422 });
  }
};

export const POST = withApiHandler(rawPOST, { route: "/api/reviews/[propertyId]/photos/finalize", auth: "strict", requireAuth: true, cache: "private" });
