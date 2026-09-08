import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { createR2UploadUrl } from "@/lib/r2";
import { REVIEW_COLLECTION } from "@/lib/reviews";
const schema = z.object({ fileName: z.string().min(1).max(180), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]), sizeBytes: z.number().int().positive().max(12 * 1024 * 1024), checksum: z.string().regex(/^[a-f0-9]{64}$/i) }).strict();
export async function POST(request: Request, { params }: RouteContext<"/api/reviews/[propertyId]/photos/upload-url">) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try { const { propertyId } = await params; const input = schema.parse(await request.json()); const reviewId = `${propertyId}_${user.uid}`; const review = await adminDb.collection(REVIEW_COLLECTION).doc(reviewId).get(); if (!review.exists || review.data()?.reviewerId !== user.uid) throw new Error("REVIEW_NOT_FOUND"); const photoCount = Array.isArray(review.data()?.photoIds) ? review.data()?.photoIds.length : 0; if (photoCount >= 5) throw new Error("PHOTO_LIMIT_REACHED"); const uploadId = randomUUID(), objectKey = `uploads/reviews/${reviewId}/${uploadId}`; const signed = await createR2UploadUrl(objectKey, input.mimeType, input.checksum); await adminDb.collection("pendingUploads").doc(uploadId).set({ reviewId, propertyId, ownerId: user.uid, kind: "review_photo", ...input, objectKey, expiresAt: Date.now() + 15 * 60_000, createdAt: FieldValue.serverTimestamp() }); return Response.json({ uploadId, uploadUrl: signed.uploadUrl, headers: signed.headers, expiresAt: signed.expiresAt, private: true }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to authorize upload." }, { status: 422 }); }
}
