import { canonicalAmenityKey } from "@/lib/customer/amenities";
import type { OfferingInput } from "./contracts";
/** An explicit additional quantity or upgrade must be described by the owner. */
export function includedOffering(
  offering: OfferingInput,
  includedCodes: string[],
) {
  if (["additional", "upgrade"].includes(offering.amenityRelationship ?? ""))
    return false;
  const code = canonicalAmenityKey(
    offering.includedAmenityCode || offering.name,
  );
  return includedCodes.some((c) => canonicalAmenityKey(c) === code);
}
