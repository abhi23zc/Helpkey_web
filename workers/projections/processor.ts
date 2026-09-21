import { FieldValue } from "firebase-admin/firestore";
import type { Job } from "bullmq";
import { db } from "../media/firebase";
import type { ProjectionJob } from "./queue";
import { projectionConnection } from "./queue";

const normalize = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const cacheRedis = projectionConnection();
export async function closeProjectionProcessor() { await cacheRedis.quit(); }

async function invalidateCatalogCache() {
  const environment = process.env.HELPKEY_ENV ?? process.env.NODE_ENV ?? "development";
  let cursor = "0";
  do {
    const [next, keys] = await cacheRedis.scan(cursor, "MATCH", `helpkey:${environment}:v1:public:*`, "COUNT", 200);
    cursor = next;
    if (keys.length) await cacheRedis.del(...keys);
  } while (cursor !== "0");
}

async function propertySearch(propertyId: string) {
  const propertyRef = db.collection("properties").doc(propertyId);
  const [property, rooms, rates, amenities, media] = await Promise.all([
    propertyRef.get(),
    db.collection("roomTypes").where("propertyId", "==", propertyId).where("status", "==", "active").limit(50).get(),
    db.collection("ratePlans").where("propertyId", "==", propertyId).where("status", "==", "active").limit(100).get(),
    db.collection("amenities").where("status", "!=", "archived").limit(500).get(),
    db.collection("mediaAssets").where("propertyId", "==", propertyId).limit(50).get(),
  ]);
  if (!property.exists) return;
  const data = property.data() ?? {};
  const amenityById = new Map(amenities.docs.map((doc) => [doc.id, doc.data().code]).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const ids = [...new Set([...(Array.isArray(data.amenityIds) ? data.amenityIds : []), ...rooms.docs.flatMap((room) => Array.isArray(room.data().amenityIds) ? room.data().amenityIds : [])])];
  const prices = rates.docs.map((rate) => rate.data().basePricePaise).filter((price): price is number => Number.isSafeInteger(price) && price >= 0);
  const cover = media.docs.find((doc) => doc.id === data.coverMediaId)?.data()?.publication?.variants;
  const rawVariants: unknown[] = cover && typeof cover === "object" ? Object.values(cover as Record<string, unknown>) : [];
  const largest = rawVariants.filter((variant): variant is Record<string, unknown> => Boolean(variant && typeof variant === "object")).sort((a, b) => Number(b.width ?? 0) - Number(a.width ?? 0))[0] ?? null;
  const variants = rawVariants.filter((variant): variant is Record<string, unknown> => Boolean(variant && typeof variant === "object" && typeof (variant as Record<string, unknown>).url === "string")).sort((a, b) => Number(a.width ?? 0) - Number(b.width ?? 0));
  const searchTokens = [...new Set([data.name, data.address?.city, data.address?.state, data.propertyType].flatMap((value) => normalize(value).split(/\s+/)).filter(Boolean))].slice(0, 40);
  await propertyRef.set({
    normalizedName: normalize(data.name),
    normalizedCity: normalize(data.address?.city ?? data.city),
    normalizedState: normalize(data.address?.state ?? data.state),
    minimumPricePaise: prices.length ? Math.min(...prices) : null,
    ratingAverage: Number(data.reviewSummary?.average ?? data.ratingAverage ?? 0),
    ratingCount: Number(data.reviewSummary?.count ?? data.ratingCount ?? 0),
    amenityCodes: ids.flatMap((id) => amenityById.get(String(id)) ?? []),
    freeCancellation: Array.isArray(data.cancellationPolicyIds) && data.cancellationPolicyIds.length > 0,
    searchTokens,
    publicCover: largest ? { imageUrl: largest.url, srcSet: variants.map((variant) => `${variant.url} ${variant.width}w`).join(", "), width: Number(largest.width ?? 1), height: Number(largest.height ?? 1), checksum: String(data.coverSourceChecksum ?? "") } : null,
    searchProjectionVersion: 1,
    searchProjectionUpdatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function reviewSummary(propertyId: string) {
  const reviews = await db.collection("propertyReviews").where("propertyId", "==", propertyId).where("status", "==", "approved").get();
  const buckets = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  let ratingSum = 0;
  let awaiting = 0; let withPhotos = 0;
  const topics: Record<string, number> = {};
  const topicPatterns: Array<[string, RegExp]> = [["Cleanliness", /\b(clean|cleanliness|spotless|hygiene)\b/i], ["Staff & service", /\b(staff|service|helpful|friendly|reception)\b/i], ["Breakfast", /\b(breakfast|food|dining)\b/i], ["Location", /\b(location|located|area|nearby)\b/i], ["Noise", /\b(noise|noisy|quiet|sound)\b/i], ["Check-in", /\b(check[ -]?in|arrival|wait)\b/i]];
  const rows: Array<{ rating: number; time: number; hasReply: boolean; hasPhotos: boolean }> = [];
  let batch = db.batch(); let batchSize = 0;
  for (const review of reviews.docs) {
    const data = review.data();
    const rating = Math.max(1, Math.min(5, Number(data.rating) || 0));
    if (rating) { ratingSum += rating; buckets[String(rating) as keyof typeof buckets] += 1; }
    const hasReply = typeof data.partnerReply?.text === "string" && data.partnerReply.text.trim().length > 0;
    const hasPhotos = Array.isArray(data.photoIds) && data.photoIds.length > 0;
    rows.push({ rating, time: data.submittedAt?.toMillis?.() ?? data.updatedAt?.toMillis?.() ?? 0, hasReply, hasPhotos });
    if (!hasReply) awaiting += 1; if (hasPhotos) withPhotos += 1;
    for (const [name, pattern] of topicPatterns) if (pattern.test(String(data.text ?? ""))) topics[name] = (topics[name] ?? 0) + 1;
    batch.set(review.ref, { replyState: hasReply ? "replied" : "awaiting", sentiment: rating >= 4 ? "positive" : rating <= 2 ? "critical" : "neutral", hasPhotos }, { merge: true });
    if (++batchSize === 400) { await batch.commit(); batch = db.batch(); batchSize = 0; }
  }
  if (batchSize) await batch.commit();
  const count = reviews.size;
  const average = count ? Math.round(ratingSum / count * 10) / 10 : 0;
  const now = Date.now();
  const periods = Object.fromEntries(([7, 30, 90] as const).map((days) => {
    const window = days * 86_400_000;
    const summarize = (from: number, to: number) => { const matches = rows.filter((row) => row.time >= from && row.time < to); return { average: matches.length ? Math.round(matches.reduce((sum, row) => sum + row.rating, 0) / matches.length * 10) / 10 : 0, count: matches.length, awaiting: matches.filter((row) => !row.hasReply).length, withPhotos: matches.filter((row) => row.hasPhotos).length }; };
    return [String(days), { current: summarize(now - window, now + 1), previous: summarize(now - window * 2, now - window) }];
  }));
  periods.all = { current: { average, count, awaiting, withPhotos }, previous: { average: 0, count: 0, awaiting: 0, withPhotos: 0 } };
  await Promise.all([
    db.collection("properties").doc(propertyId).set({ reviewSummary: { count, ratingSum, average, buckets }, ratingCount: count, ratingAverage: average, reviewProjectionUpdatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    db.collection("propertyReviewMetrics").doc(propertyId).set({ propertyId, average, count, awaiting, withPhotos, buckets, periods, topics: Object.entries(topics).map(([name, topicCount]) => ({ name, count: topicCount })).sort((a, b) => b.count - a.count), updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
  ]);
}

async function dailyMetrics(propertyId: string) {
  const date = new Date().toISOString().slice(0, 10);
  const [bookings, reviews] = await Promise.all([
    db.collection("bookings").where("propertyId", "==", propertyId).where("checkIn", ">=", date).limit(50).get(),
    db.collection("propertyReviews").where("propertyId", "==", propertyId).where("status", "==", "approved").count().get(),
  ]);
  await db.collection("propertyDailyMetrics").doc(`${propertyId}_${date}`).set({ propertyId, date, upcomingReservations: bookings.size, reviewCount: reviews.data().count, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function processProjection(job: Job<ProjectionJob>) {
  const { kind, entityId } = job.data;
  if (kind === "property_search") await propertySearch(entityId);
  else if (kind === "review_summary") { await reviewSummary(entityId); await propertySearch(entityId); }
  else if (kind === "daily_metrics" || kind === "dashboard_summary") await dailyMetrics(entityId);
  if (kind === "property_search" || kind === "review_summary" || kind === "cache_invalidation") await invalidateCatalogCache();
  await db.collection("projectionJobs").doc(String(job.id)).set({ ...job.data, status: "completed", attempts: job.attemptsMade + 1, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
