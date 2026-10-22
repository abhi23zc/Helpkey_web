import { eligiblePricing, startingPrice } from "@/lib/booking/duration-pricing";
import { withApiHandler } from "@/lib/api/handler";
import { FieldValue } from "firebase-admin/firestore";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { propertyOwner, ratePlanPatchSchema } from "@/lib/partner/service";
import { enqueueProjection } from "@/lib/projections";
import { invalidatePublic } from "@/lib/api/cache";

const rawPATCH = async function PATCH(
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

    if (data?.status === "archived") throw new Error("RATE_PLAN_ARCHIVED");
    if (!eligiblePricing(data)) throw new Error("Archive this old hourly rate and create a new rate with duration prices.");
    const merged = { ...data, ...input };
    if (!eligiblePricing(merged)) throw new Error("Enter hourly duration prices before saving this rate.");
    if (input.cancellationPolicyId) {
      const policy = await adminDb.collection("cancellationPolicies").doc(input.cancellationPolicyId).get();
      if (!policy.exists || policy.data()?.propertyId !== propertyId) throw new Error("INVALID_POLICY");
    }

    const stayRules = {
      ...(data?.stayRules ?? {}),
      ...Object.fromEntries(["minimumDurationMinutes", "maximumDurationMinutes", "minimumAdvanceMinutes", "maximumAdvanceDays"].flatMap((key) => { const value = input[key as keyof typeof input]; return value === undefined ? [] : [[key, value]]; })),
      ...(input.minimumNights === undefined ? {} : { minimumNights: input.minimumNights }),
      ...(input.maximumNights === undefined ? {} : { maximumNights: input.maximumNights }),
    };
    if (stayRules.maximumNights && stayRules.minimumNights > stayRules.maximumNights) throw new Error("MAXIMUM_NIGHTS_TOO_LOW");
    const minimumDuration = Number(stayRules.minimumDurationMinutes ?? 15), maximumDuration = Number(stayRules.maximumDurationMinutes ?? 1440);
    if (minimumDuration > maximumDuration) throw new Error("MAXIMUM_DURATION_TOO_LOW");
    if (merged.arrivalWindow && merged.arrivalWindow.start > merged.arrivalWindow.end) throw new Error("INVALID_ARRIVAL_WINDOW");
    const patch = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "minimumNights" && key !== "maximumNights"));
    const batch = adminDb.batch();
    batch.update(ref, { ...patch, basePricePaise: startingPrice(merged), stayRules, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
    enqueueProjection(batch, "property_search", propertyId, 1, { components: ["pricing"] });
    await batch.commit();
    await invalidatePublic("home", "search:*", "property:*", "bookable:*");

    return Response.json({
      ok: true,
      ratePlan: {
        id: ratePlanId,
        ...data,
        ...patch,
        name: input.name ?? data?.name,
        code: input.code ?? data?.code,
        basePricePaise: startingPrice(merged),
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

export const PATCH = withApiHandler(rawPATCH, { route: "/api/partner/properties/[propertyId]/rate-plans/[ratePlanId]", auth: "strict", requireAuth: true, cache: "private" });

const rawDELETE = async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ propertyId: string; ratePlanId: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    const { propertyId, ratePlanId } = await params;
    await propertyOwner(user.uid, propertyId);

    const ref = adminDb.collection("ratePlans").doc(ratePlanId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.propertyId !== propertyId) throw new Error("RATE_PLAN_NOT_FOUND");

    const batch = adminDb.batch();
    batch.update(ref, { status: "archived", updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
    enqueueProjection(batch, "property_search", propertyId, 1, { components: ["pricing"] });
    await batch.commit();
    await invalidatePublic("home", "search:*", "property:*", "bookable:*");

    return Response.json({ ok: true, ratePlanId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to delete rate plan." }, { status: 422 });
  }
}

export const DELETE = withApiHandler(rawDELETE, { route: "/api/partner/properties/[propertyId]/rate-plans/[ratePlanId]", auth: "strict", requireAuth: true, cache: "private" });
