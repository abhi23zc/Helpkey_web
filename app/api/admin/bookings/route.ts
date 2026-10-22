import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/admin/data";
import { serializeBooking } from "@/lib/bookings";
import { decodeCursor, encodeCursor } from "@/lib/api/pagination";

const rawGET = async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    await requireAdmin(user.uid);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const mode = url.searchParams.get("bookingMode");
    const search = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 25, 1), 50);
    let query: FirebaseFirestore.Query = adminDb.collection("bookings");
    if (status && status !== "all") query = status === "checked_out" ? query.where("bookingStatus", "in", ["completed", "checked_out"]) : query.where("bookingStatus", "==", status);
    if (search) query = query.where("searchTokens", "array-contains", search);
    const snap = await query.get();
    const selected = snap.docs.filter((doc) => !mode || (doc.data().bookingMode ?? "overnight") === mode).sort((a, b) => (b.data().createdAt?.toMillis?.() ?? 0) - (a.data().createdAt?.toMillis?.() ?? 0) || b.id.localeCompare(a.id));
    const summary = { count: selected.length, revenue: selected.reduce((sum, doc) => sum + Number(doc.data().paidPaise ?? 0), 0), refunds: selected.reduce((sum, doc) => sum + Number(doc.data().refundedPaise ?? 0), 0), pending: selected.filter((doc) => doc.data().bookingStatus === "pending_payment").length };
    const rawCursor = url.searchParams.get("cursor");
    const cursor = rawCursor ? decodeCursor(rawCursor) : null;
    const offset = cursor ? selected.findIndex((doc) => doc.id === cursor.id) + 1 : 0;
    if (cursor && !offset) throw new Error("CURSOR_EXPIRED");
    const page = selected.slice(offset, offset + limit);
    const hasMore = selected.length > offset + limit;
    const last = page.at(-1);
    return Response.json({ bookings: page.map((doc) => serializeBooking(doc.id, doc.data())), summary, hasMore, nextCursor: hasMore && last ? encodeCursor({ values: [], id: last.id }) : null });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load bookings." }, { status: 403 });
  }
}

export const GET = withApiHandler(rawGET, { route: "/api/admin/bookings", auth: "read", requireAuth: true, cache: "private" });
