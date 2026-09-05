import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/partner/service";
import { createR2ReadUrl } from "@/lib/r2";
import { DEFAULT_CURRENCY } from "@/lib/currency";

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

/**
 * Resolves a short-lived read URL for a property's cover image, if one exists.
 * The batch resolution lives inside GET; failures degrade to a null URL so the
 * UI can fall back to a placeholder.
 */
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return Response.json({ error: "Unauthenticated." }, { status: 401 });
  }

  try {
    await requireRole(user.uid, "partner");

    const [properties, partnerProfileSnap] = await Promise.all([
      adminDb.collection("properties").where("partnerId", "==", user.uid).get(),
      adminDb.collection("partnerProfiles").doc(user.uid).get(),
    ]);

    const partnerProfile = partnerProfileSnap.data() ?? {};

    // Resolve cover-image read URLs in parallel. Any failure degrades to null
    // so an empty/misconfigured R2 never breaks the dashboard.
    const coverUrls = await Promise.all(
      properties.docs.map(async (doc) => {
        const coverMediaId = doc.data().coverMediaId;
        if (typeof coverMediaId !== "string" || !coverMediaId) return null;
        try {
          const media = await adminDb.collection("mediaAssets").doc(coverMediaId).get();
          const key = media.data()?.r2ObjectKey;
          return typeof key === "string" && key ? createR2ReadUrl(key).url : null;
        } catch {
          return null;
        }
      }),
    );

    return Response.json({
      businessName:
        typeof partnerProfile.businessName === "string" && partnerProfile.businessName
          ? partnerProfile.businessName
          : null,
      currency: DEFAULT_CURRENCY,
      user: {
        uid: user.uid,
        fullName: user.fullName,
        email: user.email,
        photoURL: user.photoURL,
      },
      properties: properties.docs.map((doc, index) => {
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
          currency: typeof data.currency === "string" ? data.currency : DEFAULT_CURRENCY,
          coverImageUrl: coverUrls[index],
          updatedAt: serializeDate(data.updatedAt),
        };
      }),
    });
  } catch {
    return Response.json({ error: "Partner access required." }, { status: 403 });
  }
}
