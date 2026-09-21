import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin, serializeDirectoryUser } from "@/lib/admin/data";
import { decodeCursor, encodeCursor } from "@/lib/api/pagination";

const rawGET = async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    await requireAdmin(user.uid);
    const url = new URL(request.url); const search = (url.searchParams.get("search") ?? "").trim().toLowerCase(); const role = url.searchParams.get("role"); const status = url.searchParams.get("status"); const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 25, 1), 50);
    let query: FirebaseFirestore.Query = adminDb.collection("users");
    if (role) query = query.where("roles", "array-contains", role);
    if (status) query = query.where("accountStatus", "==", status);
    if (search) query = query.where("searchTokens", "array-contains", search);
    query = query.orderBy("__name__"); const rawCursor = url.searchParams.get("cursor"); if (rawCursor) query = query.startAfter(decodeCursor(rawCursor).id);
    const snapshot = await query.limit(limit + 1).get(); const page = snapshot.docs.slice(0, limit); const hasMore = snapshot.size > limit; const last = page.at(-1);
    return Response.json({ users: page.map(serializeDirectoryUser), hasMore, nextCursor: hasMore && last ? encodeCursor({ values: [], id: last.id }) : null });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Admin access required." }, { status: 403 }); }
}

export const GET = withApiHandler(rawGET, { route: "/api/admin/users", auth: "read", requireAuth: true, cache: "private" });
