import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";
export async function authorize(
  uid: string,
  propertyId: string,
  tx?: FirebaseFirestore.Transaction,
) {
  const ref = adminDb
    .collection("propertyMemberships")
    .doc(`${propertyId}_${uid}`);
  const membership = tx ? await tx.get(ref) : await ref.get();
  if (membership.data()?.status !== "active")
    throw new ApiException("FORBIDDEN", 403, "Property access required.");
}
export function features() {
  const enabled = (key: string) =>
    process.env[key] === "true" ||
    (process.env.NODE_ENV !== "production" && process.env[key] !== "false");
  return {
    allocation: enabled("PARTNER_RESERVATIONS_ALLOCATION"),
    payments: enabled("PARTNER_RESERVATIONS_PAYMENTS"),
    amendments: enabled("PARTNER_RESERVATIONS_AMENDMENTS"),
  };
}
