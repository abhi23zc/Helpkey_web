import { eligiblePricing } from "@/lib/booking/duration-pricing";
import { photoRequirements, type PhotoRequirementAsset, type PhotoRequirementRoom } from "@/lib/partner/photo-requirements";

export const requiredDocumentKinds = ["pan", "government_id_front", "government_id_back"] as const;
export function approvalReadiness(property: { approvalStatus?: string; status?: string; coverMediaId?: string | null }, media: PhotoRequirementAsset[], rooms: PhotoRequirementRoom[], documents: { documentType?: string; status?: string }[], rates?: { roomTypeId?: string; status?: string; bookingMode?: string; pricingModel?: string; durationPrices?: unknown; cancellationPolicyId?: string }[]) {
  const photos = photoRequirements(media.filter(asset => (asset.moderationStatus ?? asset.status) === "approved"), rooms, property.coverMediaId);
  const checks = [
    { key: "pending", label: "Listing is pending review", complete: property.approvalStatus === "pending" && property.status === "pending_review" },
    ...(rates ? rooms.filter(room => !["paused", "archived"].includes(room.status ?? "active")).map(room => ({ key: `rate_${room.id}`, label: `Sellable rate: ${room.name}`, complete: rates.some(rate => rate.roomTypeId === room.id && rate.status === "active" && Boolean(rate.cancellationPolicyId) && eligiblePricing(rate)) })) : []),
    ...photos.checks.map(check => ({ ...check, label: `Approved photos: ${check.label}` })),
    ...requiredDocumentKinds.map(kind => ({ key: kind, label: `Approved document: ${kind.replaceAll("_", " ")}`, complete: documents.some(document => document.documentType === kind && document.status === "approved") })),
  ];
  return { ready: checks.every(check => check.complete), checks, blockers: checks.filter(check => !check.complete).map(check => check.label) };
}
