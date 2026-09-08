import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/admin/data";
import { adminDb } from "@/lib/firebase/admin";
import { moderationReview, REVIEW_COLLECTION } from "@/lib/reviews";
export async function GET() {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try { await requireAdmin(user.uid); const [pending, photoPending] = await Promise.all([adminDb.collection(REVIEW_COLLECTION).where("status", "==", "pending").limit(100).get(), adminDb.collection(REVIEW_COLLECTION).where("photoModerationPending", "==", true).limit(100).get()]); const docs = [...new Map([...pending.docs, ...photoPending.docs].map((doc) => [doc.id, doc])).values()]; const rows = await Promise.all(docs.map(async doc => { const property = await adminDb.collection("properties").doc(doc.data().propertyId).get(); return { ...(await moderationReview(doc)), propertyId: doc.data().propertyId, propertyName: property.data()?.name ?? "Unknown property", status: doc.data().status }; })); return Response.json({ reviews: rows.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt))) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Admin access required." }, { status: 403 }); }
}
