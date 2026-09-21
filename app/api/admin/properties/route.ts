import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { propertySummary, requireAdmin } from "@/lib/admin/data";
import { decodeCursor, encodeCursor } from "@/lib/api/pagination";

const rawGET = async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    await requireAdmin(user.uid);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const approval = url.searchParams.get("approval");
    const search = (url.searchParams.get("search") ?? "").toLowerCase();

    let query: FirebaseFirestore.Query = adminDb.collection("properties");
    if (approval) query = query.where("approvalStatus", "==", approval);
    if (status) query = query.where("status", "==", status);
    if (search) query = query.where("searchTokens", "array-contains", search);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 25, 1), 50);
    query = query.orderBy("__name__"); const rawCursor = url.searchParams.get("cursor"); if (rawCursor) query = query.startAfter(decodeCursor(rawCursor).id);
    const snapshot = await query.limit(limit + 1).get(); const page = snapshot.docs.slice(0, limit); const hasMore = snapshot.size > limit; const last = page.at(-1);
    return Response.json({ properties: page.map((doc) => propertySummary(doc.id, doc.data())), hasMore, nextCursor: hasMore && last ? encodeCursor({ values: [], id: last.id }) : null });
  } catch {
    return Response.json({ error: "Admin access required." }, { status: 403 });
  }
}

export const GET = withApiHandler(rawGET, { route: "/api/admin/properties", auth: "read", requireAuth: true, cache: "private" });
