import { FieldValue } from "firebase-admin/firestore";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { cancellationPolicySchema, propertyOwner } from "@/lib/partner/service";

export async function POST(request: Request, { params }: RouteContext<"/api/partner/properties/[propertyId]/cancellation-policies">) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try { const { propertyId } = await params; const property = await propertyOwner(user.uid, propertyId); const input = cancellationPolicySchema.parse(await request.json()); const ref = adminDb.collection("cancellationPolicies").doc(); await ref.set({ propertyId, ...input, status: "active", createdAt: FieldValue.serverTimestamp(), createdBy: user.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid }); await property.update({ cancellationPolicyIds: FieldValue.arrayUnion(ref.id), updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid }); return Response.json({ cancellationPolicyId: ref.id, policy: { id: ref.id, name: input.name, description: input.description, refundableUntilHours: input.refundableUntilHours, cancellationFeePercent: input.cancellationFeePercent } }, { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to add policy." }, { status: 422 }); }
}
