import { z } from "zod";
import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { ApiException } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { propertyOwner } from "@/lib/partner/service";
const schema = z.object({ propertyId: z.string().min(1).max(200), q: z.string().trim().min(2).max(200) });
export const GET = withApiHandler(async request => {
  const { propertyId, q } = schema.parse(Object.fromEntries(new URL(request.url).searchParams));
  try { await propertyOwner(actorFromRequest().uid, propertyId); } catch { throw new ApiException("FORBIDDEN", 403, "Property access required."); }
  const base = adminDb.collection("bookings").where("propertyId", "==", propertyId);
  const snapshots = await Promise.all([base.where("searchTokens", "array-contains", q.toLowerCase()).limit(8).get(), base.where("confirmationCode", "==", q.toUpperCase()).limit(1).get()]);
  const found = new Map(snapshots.flatMap(s => s.docs).map(d => [d.id, d]));
  if (!q.includes("/")) { const exact = await adminDb.collection("bookings").doc(q).get(); if (exact.exists && exact.data()?.propertyId === propertyId) found.set(exact.id, exact as FirebaseFirestore.QueryDocumentSnapshot); }
  return Response.json({ bookings: [...found.values()].slice(0, 8).map(d => ({ id: d.id, confirmationCode: d.data().confirmationCode || d.id, leadGuest: { name: d.data().leadGuest?.name || "Guest" } })) });
}, { route: "/api/partner/bookings/search", auth: "read", requireAuth: true, cache: "private" });
