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
  const memberships = await adminDb.collection("propertyMemberships").where("userId", "==", user.uid).where("status", "==", "active").limit(201).get();
  if (memberships.size > 200) throw new Error("Too many hotel assignments. Contact support.");
  const ids = [...new Set(memberships.docs.map(d => d.get("propertyId")))].filter((id): id is string => typeof id === "string" && !id.includes("/"));
  const docs = ids.length ? await adminDb.getAll(...ids.map(id => adminDb.collection("properties").doc(id))) : [];
  const { propertyAccess } = await import("@/lib/partner/pms/access");
  const { setupStatus } = await import("@/lib/partner/pms/setup");
  const capabilities = new Map<string, { role: string; permissions: readonly string[]; accessRevision: number; pmsState: string; operationsReason: string | null }>();
  const accessible: typeof docs = [];
  for (const doc of docs) {
    if (!doc.exists) continue;
    try {
      const a = await propertyAccess(user.uid, doc.id);
      const state = a.property.pms?.activatedAt ? await setupStatus(user.uid, doc.id) : null;
      capabilities.set(doc.id, { role: a.role, permissions: a.permissions, accessRevision: a.revision, pmsState: state?.state || (a.block ? "disabled" : "not_activated"), operationsReason: a.block || (state && state.state !== "ready" ? "PMS setup is incomplete or disabled. Ask the owner to review Settings." : a.role !== "owner" && !state ? "The hotel owner needs to activate PMS." : null) });
      accessible.push(doc);
    } catch (error) {
      if (!(error && typeof error === "object" && "status" in error && error.status === 403)) throw error;
    }
  }
  const properties = { docs: accessible };
  const partnerProfileSnap = await adminDb.collection("partnerProfiles").doc(user.uid).get();
  const partnerProfile = partnerProfileSnap.data() ?? {};
  const coverIds = [...new Set(properties.docs.map((doc) => doc.data()?.coverMediaId).filter((id): id is string => typeof id === "string" && id.length > 0))];
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
      const data = doc.data() ?? {};
      return { ...capabilities.get(doc.id), id: doc.id, timezone: data.timezone ?? "Asia/Kolkata", isBookable: data.isBookable === true, slug: typeof data.slug === "string" ? data.slug : undefined, name: data.name, propertyType: data.propertyType ?? "hotel", status: data.status, approvalStatus: data.approvalStatus, rejectionReason: data.rejectionReason ?? null, address: data.address ?? {}, onboarding: data.onboarding ?? { currentStep: 1, completedSteps: [] }, totalPhysicalRooms: data.totalPhysicalRooms ?? 1, currency: typeof data.currency === "string" ? data.currency : DEFAULT_CURRENCY, coverImageUrl: coverUrls.get(data.coverMediaId) ?? null, updatedAt: serializeDate(data.updatedAt) };
    }),
  });
}
