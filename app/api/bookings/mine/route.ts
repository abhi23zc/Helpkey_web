import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { serializeBookingsWithResolvedMedia } from "@/lib/bookings";
import { ownReviewWithPhotoPreviews, REVIEW_COLLECTION } from "@/lib/reviews";
import { decodeCursor, encodeCursor } from "@/lib/api/pagination";

const rawGET = async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 25, 1), 50);
  let query: FirebaseFirestore.Query = adminDb.collection("bookings").where("guestId", "==", user.uid).orderBy("checkIn", "desc").orderBy("__name__", "desc");
  const rawCursor = url.searchParams.get("cursor");
  if (rawCursor) { const cursor = decodeCursor(rawCursor); query = query.startAfter(cursor.values[0], cursor.id); }
  const snapshot = await query.limit(limit + 1).get();
  const hasMore = snapshot.size > limit;
  const pageRows = snapshot.docs.slice(0, limit);
  const bookings = await serializeBookingsWithResolvedMedia(pageRows);
  const propertyIds = [...new Set(bookings.map((booking) => booking.propertyId).filter((id): id is string => typeof id === "string" && id.length > 0))];
  const reviewDocs = propertyIds.length
    ? await adminDb.getAll(...propertyIds.map((propertyId) => adminDb.collection(REVIEW_COLLECTION).doc(`${propertyId}_${user.uid}`)))
    : [];
  const reviewsByProperty = new Map((await Promise.all(reviewDocs.filter((doc) => doc.exists).map(async (doc) => {
    const review = await ownReviewWithPhotoPreviews(doc);
    return [review.propertyId, review] as const;
  }))));
  return Response.json({
    bookings: bookings.map((booking) => ({ ...booking, review: reviewsByProperty.get(booking.propertyId) ?? null })),
    hasMore,
    nextCursor: hasMore && pageRows.length ? encodeCursor({ values: [String(pageRows.at(-1)!.data().checkIn ?? "")], id: pageRows.at(-1)!.id }) : null,
  });
}

export const GET = withApiHandler(rawGET, { route: "/api/bookings/mine", auth: "read", requireAuth: true, cache: "private" });
