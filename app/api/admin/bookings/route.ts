import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/admin/data";
import { serializeBooking } from "@/lib/bookings";
import { Timestamp } from "firebase-admin/firestore";
import { decodeCursor, encodeCursor } from "@/lib/api/pagination";

const rawGET = async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    await requireAdmin(user.uid);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const search = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 25, 1), 50);
    let query: FirebaseFirestore.Query = adminDb.collection("bookings");
    if (status && status !== "all") query = query.where("bookingStatus", "==", status);
    if (search) query = query.where("searchTokens", "array-contains", search);
    query = query.orderBy("createdAt", "desc").orderBy("__name__", "desc");
    const rawCursor = url.searchParams.get("cursor");
    if (rawCursor) { const cursor = decodeCursor(rawCursor); const millis = cursor.values[0]; if (typeof millis !== "number") throw new Error("INVALID_CURSOR"); query = query.startAfter(Timestamp.fromMillis(millis), cursor.id); }
    const snap = await query.limit(limit + 1).get();
    const page = snap.docs.slice(0, limit);
    const hasMore = snap.size > limit;
    const last = page.at(-1);
    const lastMillis = last?.data().createdAt?.toMillis?.() ?? 0;
    return Response.json({ bookings: page.map((doc) => serializeBooking(doc.id, doc.data())), hasMore, nextCursor: hasMore && last ? encodeCursor({ values: [lastMillis], id: last.id }) : null });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load bookings." }, { status: 403 });
  }
}

export const GET = withApiHandler(rawGET, { route: "/api/admin/bookings", auth: "read", requireAuth: true, cache: "private" });
