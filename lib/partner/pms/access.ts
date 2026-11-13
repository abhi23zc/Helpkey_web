import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";
import {
  administrativeBlock,
  can,
  isHotelRole,
  publicBookable,
  rolePermissions,
  type Permission,
} from "./domain";

export async function propertyAccess(
  uid: string,
  propertyId: string,
  permission: Permission = "setup.read",
  tx?: FirebaseFirestore.Transaction,
) {
  if (!propertyId || propertyId.includes("/"))
    throw new ApiException("FORBIDDEN", 403, "Hotel access required.");
  const read = (ref: FirebaseFirestore.DocumentReference) =>
    tx ? tx.get(ref) : ref.get();
  const [membership, property, user] = await Promise.all([
    read(adminDb.collection("propertyMemberships").doc(`${propertyId}_${uid}`)),
    read(adminDb.collection("properties").doc(propertyId)),
    read(adminDb.collection("users").doc(uid)),
  ]);
  const m = membership.data(),
    p = property.data(),
    u = user.data();
  if (
    !p ||
    m?.status !== "active" ||
    !isHotelRole(m.role) ||
    !u ||
    !u.roles?.includes("partner") ||
    u.isActive === false ||
    ["suspended", "disabled", "deleted"].includes(u.accountStatus) ||
    !can(m.role, permission)
  )
    throw new ApiException(
      "FORBIDDEN",
      403,
      "Property access required. You do not have permission for this hotel action.",
    );
  const ownerId = p.ownerId || p.partnerId;
  const owner =
    ownerId && ownerId !== uid
      ? (await read(adminDb.collection("users").doc(ownerId))).data()
      : u;
  return {
    property: p,
    membership: m,
    role: m.role,
    permissions: rolePermissions[m.role],
    revision: m.accessRevision ?? 0,
    block:
      ownerId && !owner
        ? "The hotel owner account is unavailable. Contact Helpkey support."
        : administrativeBlock(p, owner),
    user: u,
  };
}

export async function operationalAccess(
  uid: string,
  propertyId: string,
  permission: Permission,
  tx?: FirebaseFirestore.Transaction,
) {
  const access = await propertyAccess(uid, propertyId, permission, tx);
  if (access.block) throw new ApiException("PMS_RESTRICTED", 403, access.block);
  if (access.property.pms?.activatedAt) {
    if (access.property.pms.ownerDisabled)
      throw new ApiException(
        "PMS_DISABLED",
        409,
        "PMS is disabled. Ask the owner to enable it.",
      );
    const { setupStatus } = await import("./setup");
    const status = await setupStatus(uid, propertyId, tx);
    if (status.state !== "ready")
      throw new ApiException(
        "PMS_SETUP_REQUIRED",
        409,
        "Complete PMS setup before using hotel operations.",
      );
  } else {
    if (access.role !== "owner")
      throw new ApiException(
        "PMS_SETUP_REQUIRED",
        409,
        "The hotel owner needs to activate and prepare PMS first.",
      );
    if (
      ["reservation.create", "reservation.amend"].includes(permission) &&
      !publicBookable(access.property)
    )
      throw new ApiException(
        "PROPERTY_NOT_AVAILABLE",
        409,
        "Activate and prepare PMS before making internal reservations while public bookings are unavailable.",
      );
  }
  return access;
}
