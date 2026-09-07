import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/admin/data";
import { adminDb } from "@/lib/firebase/admin";
import { publicReview, REVIEW_COLLECTION } from "@/lib/reviews";
export async function GET() {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try { await requireAdmin(user.uid); const snap = await adminDb.collection(REVIEW_COLLECTION).where("status", "==", "pending").limit(100).get(); const rows = await Promise.all(snap.docs.map(async doc => { const property = await adminDb.collection("properties").doc(doc.data().propertyId).get(); return { ...(await publicReview(doc, true)), propertyId: doc.data().propertyId, propertyName: property.data()?.name ?? "Unknown property", status: doc.data().status }; })); return Response.json({ reviews: rows.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt))) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Admin access required." }, { status: 403 }); }
}
