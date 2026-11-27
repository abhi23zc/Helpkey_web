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
  return {
    stayChanges: true,
    allocation: true,
    payments: true,
    amendments: true,
  };
}
