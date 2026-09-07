import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { createR2ReadUrl } from "@/lib/r2";

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

function asIso(value: unknown) { return value instanceof Timestamp ? value.toDate().toISOString() : typeof value === "string" ? value : null; }
function photoUrl(key: unknown) { try { return typeof key === "string" && key ? createR2ReadUrl(key).url : null; } catch { return null; } }

export async function publicReview(doc: FirebaseFirestore.QueryDocumentSnapshot, includePrivatePhotos = false) {
  const data = doc.data();
  const photoIds = Array.isArray(data.photoIds) ? data.photoIds.filter((id): id is string => typeof id === "string").slice(0, 5) : [];
  const photos = await Promise.all(photoIds.map(async (id) => {
    const photo = await adminDb.collection(REVIEW_PHOTOS_COLLECTION).doc(id).get(); const raw = photo.data();
    if (!photo.exists || !raw || (raw.status !== "approved" && !includePrivatePhotos)) return null;
    return { id: photo.id, imageUrl: photoUrl(raw.r2ObjectKey), altText: typeof raw.fileName === "string" ? raw.fileName : "Guest review photo" };
  }));
  return { id: doc.id, reviewerName: typeof data.reviewerName === "string" ? data.reviewerName : "Helpkey guest", rating: data.rating, text: typeof data.text === "string" ? data.text : "", submittedAt: asIso(data.submittedAt) ?? asIso(data.updatedAt), photos: photos.filter((photo): photo is { id: string; imageUrl: string | null; altText: string } => Boolean(photo?.imageUrl)) };
}

export async function publicReviews(propertyId: string, page: number, pageSize: number) {
  const base = adminDb.collection(REVIEW_COLLECTION).where("propertyId", "==", propertyId).where("status", "==", "approved");
  const start = (page - 1) * pageSize;
  const countPromise = base.count().get();
  // The ordered query uses the composite index declared in firestore.indexes.json.
  // Until that index has been deployed, retain a small-data fallback so guest pages
  // continue to work instead of returning a generic review-loading error.
  let docs: FirebaseFirestore.QueryDocumentSnapshot[];
  try {
    docs = (await base.orderBy("submittedAt", "desc").offset(start).limit(pageSize).get()).docs;
  } catch (cause) {
    console.warn("Review index unavailable; using fallback ordering.", cause instanceof Error ? cause.message : cause);
    const all = await base.limit(500).get();
    const ordered = all.docs.sort((a, b) => ((b.data().submittedAt as Timestamp | undefined)?.toMillis?.() ?? 0) - ((a.data().submittedAt as Timestamp | undefined)?.toMillis?.() ?? 0));
    docs = ordered.slice(start, start + pageSize);
  }
  const count = await countPromise;
  const total = count.data().count;
  return { reviews: await Promise.all(docs.map(doc => publicReview(doc))), page, pageSize, total, hasMore: start + pageSize < total };
}

export function ownReview(doc: FirebaseFirestore.DocumentSnapshot) {
  const data = doc.data() ?? {};
  return { id: doc.id, propertyId: data.propertyId, rating: data.rating, text: data.text, status: data.status, photoIds: Array.isArray(data.photoIds) ? data.photoIds : [], submittedAt: asIso(data.submittedAt), updatedAt: asIso(data.updatedAt) };
}
