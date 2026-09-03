/* eslint-disable @typescript-eslint/no-unused-expressions */
import { FieldValue } from "firebase-admin/firestore";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { propertyOwner, stepSchema } from "@/lib/partner/service";

export async function POST(request: Request, { params }: RouteContext<"/api/partner/properties/[propertyId]/steps">) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try { const { propertyId } = await params; const ref = await propertyOwner(user.uid, propertyId); const input = stepSchema.parse(await request.json()); await ref.update({ [`onboarding.currentStep`]: input.completed ? Math.min(input.step + 1, 8) : input.step, [`onboarding.completedSteps`]: input.completed ? FieldValue.arrayUnion(input.step) : FieldValue.arrayRemove(input.step), [`onboarding.lastSavedAt`]: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid }); return Response.json({ ok: true }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to save progress." }, { status: 422 }); }
}
