import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/partner/service";

export async function GET() {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try { await requireRole(user.uid, "partner"); const properties = await adminDb.collection("properties").where("partnerId", "==", user.uid).get(); return Response.json({ properties: properties.docs.map((doc) => ({ id: doc.id, name: doc.data().name, status: doc.data().status, approvalStatus: doc.data().approvalStatus, rejectionReason: doc.data().rejectionReason, onboarding: doc.data().onboarding ?? { currentStep: 1, completedSteps: [] } })) }); }
  catch { return Response.json({ error: "Partner access required." }, { status: 403 }); }
}
