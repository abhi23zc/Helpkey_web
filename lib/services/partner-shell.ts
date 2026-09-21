import "server-only";

import type { AppUser } from "@/types/auth";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/partner/service";
import { resolvePublicImage } from "@/lib/media-resolver";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { toPlainJson } from "@/lib/api/plain";

const serializeDate = (value: unknown) => value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function" ? value.toDate().toISOString() : null;

export async function loadPartnerShell(user: AppUser) {
  await requireRole(user.uid, "partner");
  const [properties, partnerProfileSnap] = await Promise.all([
    adminDb.collection("properties").where("partnerId", "==", user.uid).limit(50).get(),
    adminDb.collection("partnerProfiles").doc(user.uid).get(),
  ]);
  const partnerProfile = partnerProfileSnap.data() ?? {};
  const coverIds = [...new Set(properties.docs.map((doc) => doc.data().coverMediaId).filter((id): id is string => typeof id === "string" && id.length > 0))];
  const coverDocs = coverIds.length ? await adminDb.getAll(...coverIds.map((id) => adminDb.collection("mediaAssets").doc(id))) : [];
  const coverUrls = new Map((await Promise.all(coverDocs.map(async (media) => {
    const data = media.data();
    if (!media.exists || !data) return null;
    const image = await resolvePublicImage(media.id, data, typeof data.altText === "string" ? data.altText : "");
    return image ? [media.id, image.imageUrl] as const : null;
  }))).filter((item): item is readonly [string, string] => Boolean(item)));
  return toPlainJson({
    businessName: typeof partnerProfile.businessName === "string" && partnerProfile.businessName ? partnerProfile.businessName : null,
    currency: DEFAULT_CURRENCY,
    user: { uid: user.uid, fullName: user.fullName, email: user.email, photoURL: user.photoURL },
    properties: properties.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, slug: typeof data.slug === "string" ? data.slug : undefined, name: data.name, propertyType: data.propertyType ?? "hotel", status: data.status, approvalStatus: data.approvalStatus, rejectionReason: data.rejectionReason ?? null, address: data.address ?? {}, onboarding: data.onboarding ?? { currentStep: 1, completedSteps: [] }, totalPhysicalRooms: data.totalPhysicalRooms ?? 1, currency: typeof data.currency === "string" ? data.currency : DEFAULT_CURRENCY, coverImageUrl: coverUrls.get(data.coverMediaId) ?? null, updatedAt: serializeDate(data.updatedAt) };
    }),
  });
}
