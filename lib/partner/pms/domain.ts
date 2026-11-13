/** Shared fixed role policy. Do not accept arbitrary membership permissions as grants. */
export const staffRoles = [
  "manager",
  "receptionist",
  "cashier",
  "housekeeper",
  "maintenance",
] as const;
export const roles = ["owner", ...staffRoles] as const;
export type HotelRole = (typeof roles)[number];
export const permissions = [
  "setup.read",
  "setup.manage",
  "team.manage",
  "property.manage",
  "listing.manage",
  "rooms.read",
  "rooms.manage",
  "rates.manage",
  "housekeeping",
  "maintenance",
  "reservation.read",
  "reservation.create",
  "reservation.operate",
  "reservation.cancel",
  "reservation.note",
  "reservation.assign",
  "reservation.amend",
  "payment.read",
  "payment.collect",
  "payment.reverse",
  "payment.refund",
  "reports.read",
  "guest.export",
  "requests.manage",
  "requests.prepare",
  "reviews.manage",
] as const;
export type Permission = (typeof permissions)[number];
const manager: Permission[] = permissions.filter(
  (p) => !["team.manage", "setup.manage", "listing.manage"].includes(p),
);
export const rolePermissions: Record<HotelRole, readonly Permission[]> = {
  owner: permissions,
  manager,
  receptionist: [
    "setup.read",
    "reservation.read",
    "reservation.create",
    "reservation.operate",
    "reservation.note",
    "reservation.assign",
    "rooms.read",
    "requests.prepare",
  ],
  cashier: ["setup.read", "payment.read", "payment.collect", "payment.reverse"],
  housekeeper: ["setup.read", "housekeeping"],
  maintenance: ["setup.read", "maintenance"],
};
export function isHotelRole(value: unknown): value is HotelRole {
  return roles.includes(value as HotelRole);
}
export function can(role: unknown, permission: Permission) {
  return isHotelRole(role) && rolePermissions[role].includes(permission);
}
type OperationalProperty = {
  status?: unknown;
  approvalStatus?: unknown;
  isBookable?: unknown;
  marketplaceOwnerPaused?: unknown;
  pms?: {
    adminDisabled?: boolean;
    adminReason?: string | null;
    activatedAt?: unknown;
    ownerDisabled?: boolean;
  };
};
export function administrativeBlock(
  p: OperationalProperty,
  owner?: { isActive?: unknown; accountStatus?: string },
) {
  if (
    owner &&
    (owner.isActive === false ||
      ["suspended", "disabled", "deleted"].includes(
        String(owner.accountStatus),
      ))
  )
    return "The hotel owner's account is restricted. Contact Helpkey support.";
  if (
    ["paused", "suspended", "archived"].includes(String(p.status)) ||
    ["revoked", "rejected"].includes(String(p.approvalStatus))
  )
    return "Hotel operations are restricted by the platform. Contact Helpkey support.";
  if (p.pms?.adminDisabled)
    return p.pms.adminReason || "PMS has been temporarily disabled by Helpkey.";
  return null;
}
export function publicBookable(p: OperationalProperty) {
  return (
    p.status === "active" &&
    p.approvalStatus === "approved" &&
    p.isBookable === true &&
    p.marketplaceOwnerPaused !== true
  );
}
export function landing(role: unknown) {
  return role === "owner"
    ? "/partner/settings"
    : role === "manager" || role === "receptionist"
      ? "/partner/reservations"
      : "/partner/operations";
}
export type SetupItem = {
  id: string;
  label: string;
  complete: boolean;
  detail: string;
  href?: string;
};
export function pmsState(
  p: OperationalProperty,
  items: SetupItem[],
  block: string | null,
) {
  if (block || p.pms?.ownerDisabled) return "disabled" as const;
  if (!p.pms?.activatedAt) return "not_activated" as const;
  return items.every((i) => i.complete)
    ? ("ready" as const)
    : ("setup" as const);
}
