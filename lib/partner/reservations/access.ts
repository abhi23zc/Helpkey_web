import "server-only";
import { propertyAccess } from "@/lib/partner/pms/access";
import type { Permission } from "@/lib/partner/pms/domain";
export async function authorize(
  uid: string,
  propertyId: string,
  tx?: FirebaseFirestore.Transaction,
  permission: Permission = "reservation.read",
) {
  return propertyAccess(uid, propertyId, permission, tx);
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
