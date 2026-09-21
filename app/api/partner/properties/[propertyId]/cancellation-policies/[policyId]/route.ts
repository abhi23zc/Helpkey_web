import { withApiHandler } from "@/lib/api/handler";
import { FieldValue } from "firebase-admin/firestore";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { propertyOwner } from "@/lib/partner/service";

const rawDELETE = async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ propertyId: string; policyId: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    const { propertyId, policyId } = await params;
    const propertyRef = await propertyOwner(user.uid, propertyId);

    const ref = adminDb.collection("cancellationPolicies").doc(policyId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.propertyId !== propertyId) throw new Error("POLICY_NOT_FOUND");

    // Referential integrity: refuse to delete a policy that rate plans still
    // reference, otherwise guests would see rates with a missing promise.
    const linkedRates = await adminDb
      .collection("ratePlans")
      .where("propertyId", "==", propertyId)
      .where("cancellationPolicyId", "==", policyId)
      .limit(1)
      .get();
    if (!linkedRates.empty) throw new Error("This policy is used by a rate. Remove or repoint that rate first.");

    const batch = adminDb.batch();
    batch.delete(ref);
    batch.update(propertyRef, {
      cancellationPolicyIds: FieldValue.arrayRemove(policyId),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
    });
    await batch.commit();

    return Response.json({ ok: true, policyId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to delete cancellation policy." }, { status: 422 });
  }
}

export const DELETE = withApiHandler(rawDELETE, { route: "/api/partner/properties/[propertyId]/cancellation-policies/[policyId]", auth: "strict", requireAuth: true, cache: "private" });
