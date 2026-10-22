import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { adminDb } from "@/lib/firebase/admin";
import { publicPropertiesByIds } from "@/lib/customer/catalog";
import { decodeCursor, encodeCursor, listQuerySchema } from "@/lib/api/pagination";

export const GET = withApiHandler(async (request: Request) => {
  const user = actorFromRequest();
  const params = new URL(request.url).searchParams;
  const input = listQuerySchema.parse({ limit: params.get("limit") ?? 24, cursor: params.get("cursor") ?? undefined });
  const base = adminDb.collection("users").doc(user.uid).collection("savedProperties");
  if (params.get("ids") === "true") {
    // Fetch only IDs for visible cards, keeping this lookup bounded independently of wishlist size.
    const ids = [...new Set(params.getAll("propertyId"))].slice(0, 50);
    if (ids.some(id => !/^[A-Za-z0-9_-]{1,200}$/.test(id))) return Response.json({ error: "INVALID_PROPERTY_ID" }, { status: 422 });
    const saved = ids.length ? await adminDb.getAll(...ids.map(id => base.doc(id))) : [];
    return Response.json({ propertyIds: saved.filter(doc => doc.exists).map(doc => doc.id) });
  }
  let query = base.orderBy("__name__").limit(input.limit + 1);
  if (input.cursor) {
    const cursor = decodeCursor(input.cursor);
    if (cursor.values[0] !== user.uid) return Response.json({ error: "INVALID_CURSOR" }, { status: 422 });
    query = query.startAfter(cursor.id);
  }
  const snapshot = await query.get();
  const docs = snapshot.docs.slice(0, input.limit);
  const publicHotels = new Map((await publicPropertiesByIds(docs.map(doc => doc.id))).map(hotel => [hotel.id, hotel]));
  const hasMore = snapshot.size > input.limit;
  return Response.json({ items: docs.map(doc => ({ propertyId: doc.id, property: publicHotels.get(doc.id) ?? null })), hasMore, nextCursor: hasMore && docs.length ? encodeCursor({ id: docs.at(-1)!.id, values: [user.uid] }) : null });
}, { route: "/api/wishlist", auth: "strict", requireAuth: true, cache: "private" });
