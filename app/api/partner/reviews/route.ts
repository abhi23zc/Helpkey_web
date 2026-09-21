import { withApiHandler } from "@/lib/api/handler";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { propertyOwner } from "@/lib/partner/service";
import { publicReview, REVIEW_PHOTOS_COLLECTION } from "@/lib/reviews";
import { decodeCursor, encodeCursor } from "@/lib/api/pagination";

const querySchema = z.object({
  propertyId: z.string().min(1).max(200),
  range: z.enum(["7", "30", "90", "all"]).default("30"),
  filter: z.enum(["all", "awaiting", "positive", "critical"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(25).default(10),
  cursor: z.string().max(2_000).optional(),
});

type Period = { average: number; count: number; awaiting: number; withPhotos: number };
const emptyPeriod = (): Period => ({ average: 0, count: 0, awaiting: 0, withPhotos: 0 });

const rawGET = async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    const input = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    await propertyOwner(user.uid, input.propertyId);
    let filtered: FirebaseFirestore.Query = adminDb.collection("propertyReviews")
      .where("propertyId", "==", input.propertyId)
      .where("status", "==", "approved");
    if (input.filter === "awaiting") filtered = filtered.where("replyState", "==", "awaiting");
    if (input.filter === "positive" || input.filter === "critical") filtered = filtered.where("sentiment", "==", input.filter);
    const countPromise = filtered.count().get();
    filtered = filtered.orderBy("submittedAt", "desc").orderBy("__name__", "desc");
    if (input.cursor) {
      const cursor = decodeCursor(input.cursor);
      if (typeof cursor.values[0] !== "number") throw new Error("INVALID_CURSOR");
      filtered = filtered.startAfter(Timestamp.fromMillis(cursor.values[0]), cursor.id);
    } else if (input.page > 1) {
      filtered = filtered.offset((input.page - 1) * input.pageSize);
    }
    const [page, count, metricsDoc, propertyDoc] = await Promise.all([
      filtered.limit(input.pageSize + 1).get(),
      countPromise,
      adminDb.collection("propertyReviewMetrics").doc(input.propertyId).get(),
      adminDb.collection("properties").doc(input.propertyId).get(),
    ]);
    const docs = page.docs.slice(0, input.pageSize);
    const photoIds = [...new Set(docs.flatMap((doc) => Array.isArray(doc.data().photoIds) ? doc.data().photoIds.slice(0, 5) : []))].filter((id): id is string => typeof id === "string");
    const photoDocs = photoIds.length ? await adminDb.getAll(...photoIds.map((id) => adminDb.collection(REVIEW_PHOTOS_COLLECTION).doc(id))) : [];
    const photos = new Map(photoDocs.map((doc) => [doc.id, doc]));
    const rawMetrics = metricsDoc.data() ?? {};
    const propertySummary = propertyDoc.data()?.reviewSummary ?? {};
    const allTime: Period = { average: Number(rawMetrics.average ?? propertySummary.average ?? 0), count: Number(rawMetrics.count ?? propertySummary.count ?? 0), awaiting: Number(rawMetrics.awaiting ?? 0), withPhotos: Number(rawMetrics.withPhotos ?? 0) };
    const selected = (rawMetrics.periods?.[input.range]?.current ?? (input.range === "all" ? allTime : emptyPeriod())) as Period;
    const previous = (rawMetrics.periods?.[input.range]?.previous ?? emptyPeriod()) as Period;
    const buckets = rawMetrics.buckets ?? propertySummary.buckets ?? {};
    const hasMore = page.size > input.pageSize;
    const last = docs.at(-1);
    const lastMillis = last?.data().submittedAt?.toMillis?.() ?? 0;
    return Response.json({
      metrics: {
        averageRating: { value: selected.average, previous: previous.average, allTime: allTime.average },
        newReviews: { value: selected.count, previous: previous.count },
        awaitingReplies: { value: selected.awaiting, previous: previous.awaiting },
        reviewsWithPhotos: { value: selected.withPhotos, previous: previous.withPhotos },
      },
      distribution: [5, 4, 3, 2, 1].map((rating) => ({ rating, count: Number(buckets[String(rating)] ?? 0) })),
      trend: [],
      topics: Array.isArray(rawMetrics.topics) ? rawMetrics.topics.slice(0, 10) : [],
      counts: { all: allTime.count, awaiting: allTime.awaiting, positive: Number(buckets["4"] ?? 0) + Number(buckets["5"] ?? 0), critical: Number(buckets["1"] ?? 0) + Number(buckets["2"] ?? 0) },
      reviews: await Promise.all(docs.map(async (review) => ({ ...(await publicReview(review, photos)), awaitingReply: review.data().replyState !== "replied" }))),
      page: input.page,
      pageSize: input.pageSize,
      total: count.data().count,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor({ values: [lastMillis], id: last.id }) : null,
    });
  } catch (error) {
    const message = error instanceof z.ZodError ? "Invalid review dashboard request." : error instanceof Error && error.message === "FORBIDDEN" ? "Property access required." : "Unable to load reviews.";
    return Response.json({ error: message }, { status: message === "Property access required." ? 403 : 422 });
  }
};

export const GET = withApiHandler(rawGET, { route: "/api/partner/reviews", auth: "read", requireAuth: true, cache: "private" });
