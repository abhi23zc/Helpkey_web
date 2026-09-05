import { getAuthenticatedUser } from "@/lib/auth/session";
import { propertyOwner, ratePlanPatchSchema } from "@/lib/partner/service";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ propertyId: string; ratePlanId: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    const { propertyId, ratePlanId } = await params;
    await propertyOwner(user.uid, propertyId);
    const input = ratePlanPatchSchema.parse(await request.json());

    const ref = adminDb.collection("ratePlans").doc(ratePlanId);
    const snap = await ref.get();
    const data = snap.data();
    if (!snap.exists || data?.propertyId !== propertyId) throw new Error("RATE_PLAN_NOT_FOUND");

    // Guard cross-property policy references.
    if (input.cancellationPolicyId) {
      const policy = await adminDb.collection("cancellationPolicies").doc(input.cancellationPolicyId).get();
      if (!policy.exists || policy.data()?.propertyId !== propertyId) throw new Error("INVALID_POLICY");
    }

    await ref.update({ ...input, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });

    return Response.json({
      ok: true,
      ratePlan: {
        id: ratePlanId,
        name: input.name ?? data?.name,
        code: data?.code,
        basePricePaise: input.basePricePaise ?? data?.basePricePaise,
        roomTypeId: data?.roomTypeId,
        cancellationPolicyId: input.cancellationPolicyId ?? data?.cancellationPolicyId,
        paymentMode: input.paymentMode ?? data?.paymentMode ?? "full",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update rate plan." }, { status: 422 });
  }
}
