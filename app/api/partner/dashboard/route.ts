import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/partner/service";

function serializeDate(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }
  return null;
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return Response.json({ error: "Unauthenticated." }, { status: 401 });
  }

  try {
    await requireRole(user.uid, "partner");

    const properties = await adminDb
      .collection("properties")
      .where("partnerId", "==", user.uid)
      .get();

    return Response.json({
      properties: properties.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name,
          propertyType: data.propertyType ?? "hotel",
          status: data.status,
          approvalStatus: data.approvalStatus,
          rejectionReason: data.rejectionReason ?? null,
          address: data.address ?? {},
          onboarding: data.onboarding ?? { currentStep: 1, completedSteps: [] },
          totalPhysicalRooms: data.totalPhysicalRooms ?? 1,
          updatedAt: serializeDate(data.updatedAt),
        };
      }),
    });
  } catch {
    return Response.json({ error: "Partner access required." }, { status: 403 });
  }
}
