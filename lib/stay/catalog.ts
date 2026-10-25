import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { offeringSchema, type Offering } from "./contracts";

export function readOffering(
  id: string,
  value: FirebaseFirestore.DocumentData,
): Offering | null {
  const {
    propertyId,
    version,
    name,
    description,
    kind,
    category,
    travelerCategories,
    roomTypeIds,
    bookingModes,
    unitPricePaise,
    maxQuantity,
    advanceNoticeMinutes,
    confirmation,
    variants,
    status,
  } = value;
  const parsed = offeringSchema.safeParse({
    name,
    description,
    kind,
    category,
    travelerCategories,
    roomTypeIds,
    bookingModes,
    unitPricePaise,
    maxQuantity,
    advanceNoticeMinutes,
    confirmation,
    variants,
    status,
  });
  return parsed.success &&
    typeof propertyId === "string" &&
    Number.isInteger(version)
    ? { ...parsed.data, id, propertyId, version }
    : null;
}
export async function offeringsFor(propertyId: string) {
  const result = await adminDb
    .collection("properties")
    .doc(propertyId)
    .collection("stayCustomizations")
    .get();
  return result.docs.flatMap((d) => {
    const o = readOffering(d.id, d.data());
    return o ? [o] : [];
  });
}
