import { FieldValue } from "firebase-admin/firestore";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { propertyOwner, ratePlanPatchSchema } from "@/lib/partner/service";

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

    if (input.cancellationPolicyId) {
      const policy = await adminDb.collection("cancellationPolicies").doc(input.cancellationPolicyId).get();
      if (!policy.exists || policy.data()?.propertyId !== propertyId) throw new Error("INVALID_POLICY");
    }

    const stayRules = {
      ...(data?.stayRules ?? {}),
      ...(input.minimumNights === undefined ? {} : { minimumNights: input.minimumNights }),
      ...(input.maximumNights === undefined ? {} : { maximumNights: input.maximumNights }),
    };
    const patch = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "minimumNights" && key !== "maximumNights"));
    await ref.update({ ...patch, stayRules, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });

    return Response.json({
      ok: true,
      ratePlan: {
        id: ratePlanId,
        name: input.name ?? data?.name,
        code: input.code ?? data?.code,
        basePricePaise: input.basePricePaise ?? data?.basePricePaise,
        roomTypeId: data?.roomTypeId,
        cancellationPolicyId: input.cancellationPolicyId ?? data?.cancellationPolicyId,
        paymentMode: input.paymentMode ?? data?.paymentMode ?? "full",
        taxBasisPoints: input.taxBasisPoints ?? data?.taxBasisPoints ?? 0,
        customerFeePaise: input.customerFeePaise ?? data?.customerFeePaise ?? 0,
        depositBasisPoints: input.depositBasisPoints ?? data?.depositBasisPoints ?? 2500,
        minimumNights: stayRules.minimumNights ?? 1,
        maximumNights: stayRules.maximumNights ?? null,
        status: input.status ?? data?.status ?? "active",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update rate plan." }, { status: 422 });
  }
}
