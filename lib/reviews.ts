import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { privatePreviewDto, resolvePublicImage } from "@/lib/media-resolver";
import { decodeCursor, encodeCursor } from "@/lib/api/pagination";

export const REVIEW_COLLECTION = "propertyReviews";
export const REVIEW_PHOTOS_COLLECTION = "reviewPhotos";
export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export type ReviewSummary = { count: number; ratingSum: number; average: number; buckets: Record<"1" | "2" | "3" | "4" | "5", number> };
const emptyBuckets = (): ReviewSummary["buckets"] => ({ "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 });
export const emptyReviewSummary = (): ReviewSummary => ({ count: 0, ratingSum: 0, average: 0, buckets: emptyBuckets() });

export function reviewSummary(value: unknown): ReviewSummary | null {
  const raw = value as Partial<ReviewSummary> | null;
  if (!raw || typeof raw.count !== "number" || !Number.isInteger(raw.count) || raw.count < 1 || typeof raw.ratingSum !== "number" || !Number.isFinite(raw.ratingSum)) return null;
  const buckets = emptyBuckets();
  for (const key of Object.keys(buckets) as Array<keyof typeof buckets>) {
    const count = (raw.buckets as Record<string, unknown> | undefined)?.[key];
    buckets[key] = Number.isInteger(count) && Number(count) >= 0 ? Number(count) : 0;
  }
  return { count: raw.count, ratingSum: raw.ratingSum, average: Math.round((raw.ratingSum / raw.count) * 10) / 10, buckets };
}

export async function calculateReviewSummary(propertyId: string): Promise<ReviewSummary> {
  const snap = await adminDb.collection(REVIEW_COLLECTION).where("propertyId", "==", propertyId).where("status", "==", "approved").get();
  const summary = emptyReviewSummary();
  for (const doc of snap.docs) {
    const rating = doc.data().rating;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) continue;
    summary.count += 1; summary.ratingSum += rating; summary.buckets[String(rating) as keyof ReviewSummary["buckets"]] += 1;
  }
  summary.average = summary.count ? Math.round((summary.ratingSum / summary.count) * 10) / 10 : 0;
  return summary;
}

/** Recompute from approved documents; safe after every state/rating transition. */
export async function refreshPropertyReviewSummary(propertyId: string) {
  const summary = await calculateReviewSummary(propertyId);
  await adminDb.collection("properties").doc(propertyId).set({ reviewSummary: summary, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return summary;
}

/** A guest can review a property once a stay booked through Helpkey is completed. */
export async function hasCompletedStay(userId: string, propertyId: string) {
  const bookings = await adminDb.collection("bookings").where("guestId", "==", userId).where("propertyId", "==", propertyId).where("bookingStatus", "==", "completed").limit(1).get();
  return !bookings.empty;
}

function asIso(value: unknown) { return value instanceof Timestamp ? value.toDate().toISOString() : typeof value === "string" ? value : null; }
export async function publicReview(doc: FirebaseFirestore.QueryDocumentSnapshot, photoDocuments?: Map<string, FirebaseFirestore.DocumentSnapshot>) {
  const data = doc.data();
  const photoIds = Array.isArray(data.photoIds) ? data.photoIds.filter((id): id is string => typeof id === "string").slice(0, 5) : [];
  const photos = await Promise.all(photoIds.map(async (id) => {
    const photo = photoDocuments?.get(id) ?? await adminDb.collection(REVIEW_PHOTOS_COLLECTION).doc(id).get(); const raw = photo.data();
    if (!photo.exists || !raw) return null;
    return resolvePublicImage(photo.id, raw, typeof raw.fileName === "string" ? raw.fileName : "Guest review photo");
  }));
  const reply = data.partnerReply && typeof data.partnerReply === "object" ? data.partnerReply as Record<string, unknown> : null;
  const replyText = typeof reply?.text === "string" ? reply.text.trim() : "";
  return {
    id: doc.id,
    reviewerName: typeof data.reviewerName === "string" ? data.reviewerName : "Helpkey guest",
    rating: data.rating,
    text: typeof data.text === "string" ? data.text : "",
    submittedAt: asIso(data.submittedAt) ?? asIso(data.updatedAt),
    photos: photos.filter((photo): photo is NonNullable<typeof photo> => Boolean(photo)),
    partnerReply: replyText ? { text: replyText, repliedAt: asIso(reply?.repliedAt) } : null,
  };
}

export async function moderationReview(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = doc.data();
  const base = await publicReview(doc);
  const ids = Array.isArray(data.photoIds) ? data.photoIds.filter((id): id is string => typeof id === "string").slice(0, 5) : [];
  const photos = (await Promise.all(ids.map(async (id) => { const photo = await adminDb.collection(REVIEW_PHOTOS_COLLECTION).doc(id).get(); if (!photo.exists) return null; const preview = await privatePreviewDto(photo.id, photo.data() ?? {}); return preview ? { ...preview, imageUrl: preview.url, altText: preview.fileName } : null; }))).filter((photo): photo is NonNullable<typeof photo> => Boolean(photo));
  return { ...base, photos };
}

export async function publicReviews(propertyId: string, page: number, pageSize: number, rawCursor?: string) {
  const base = adminDb.collection(REVIEW_COLLECTION).where("propertyId", "==", propertyId).where("status", "==", "approved");
  const start = (page - 1) * pageSize;
  const countPromise = base.count().get();
  let ordered: FirebaseFirestore.Query = base.orderBy("submittedAt", "desc").orderBy("__name__", "desc");
  if (rawCursor) { const cursor = decodeCursor(rawCursor); const millis = cursor.values[0]; if (typeof millis !== "number") throw new Error("INVALID_CURSOR"); ordered = ordered.startAfter(Timestamp.fromMillis(millis), cursor.id); }
  else if (start) ordered = ordered.offset(start); // Backward compatibility while older clients finish cursor migration.
  const snapshot = await ordered.limit(pageSize + 1).get();
  const docs = snapshot.docs.slice(0, pageSize);
  const photoIds = [...new Set(docs.flatMap((doc) => Array.isArray(doc.data().photoIds) ? doc.data().photoIds.filter((id: unknown): id is string => typeof id === "string").slice(0, 5) : []))];
  const photoSnapshots = photoIds.length ? await adminDb.getAll(...photoIds.map((id) => adminDb.collection(REVIEW_PHOTOS_COLLECTION).doc(id))) : [];
  const photosById = new Map(photoSnapshots.map((photo) => [photo.id, photo]));
  const count = await countPromise;
  const total = count.data().count;
  const hasMore = snapshot.size > pageSize;
  const last = docs.at(-1); const lastMillis = (last?.data().submittedAt as Timestamp | undefined)?.toMillis?.() ?? 0;
  return { reviews: await Promise.all(docs.map(doc => publicReview(doc, photosById))), page, pageSize, total, hasMore, nextCursor: hasMore && last ? encodeCursor({ values: [lastMillis], id: last.id }) : null };
}

export function ownReview(doc: FirebaseFirestore.DocumentSnapshot) {
  const data = doc.data() ?? {};
  return { id: doc.id, propertyId: data.propertyId, rating: data.rating, text: data.text, status: data.status, photoIds: Array.isArray(data.photoIds) ? data.photoIds : [], submittedAt: asIso(data.submittedAt), updatedAt: asIso(data.updatedAt) };
}

/** Private previews are only returned through authenticated guest-facing APIs. */
export async function ownReviewWithPhotoPreviews(doc: FirebaseFirestore.DocumentSnapshot) {
  const review = ownReview(doc);
  const photoDocs = review.photoIds.length ? await adminDb.getAll(...review.photoIds.map((id) => adminDb.collection(REVIEW_PHOTOS_COLLECTION).doc(id))) : [];
  const photos = (await Promise.all(photoDocs.map(async (photo) => {
    const data = photo.data();
    if (!photo.exists || !data || data.ownerId !== doc.data()?.reviewerId) return null;
    const preview = await privatePreviewDto(photo.id, data);
    return preview ? { id: preview.id, url: preview.url, fileName: preview.fileName } : null;
  }))).filter((photo): photo is NonNullable<typeof photo> => Boolean(photo));
  return { ...review, photos };
}
