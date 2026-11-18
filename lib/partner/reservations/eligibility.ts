import { assignmentRestriction, collectionRestriction, amendmentRestriction, type ActionRestriction } from "./action-rules";
import type { Permission } from "@/lib/partner/pms/domain";
import type { RecordData } from "@/lib/partner/dashboard/domain";
import { operationalPolicies, registrationFacts, type OperationalPolicies } from "./operational-policies";
import { stayFinancials } from "@/lib/stay/domain";
export type EligibilityBlocker = {
  code: string;
  category: "permission" | "restriction" | "state" | "policy" | "stale";
  message: string;
  resolution: "guests" | "assignment" | "payments" | "housekeeping" | "settings" | null;
};
export type ActionEligibility = { allowed: boolean; reason: string | null; blockers: EligibilityBlocker[]; eligibilityVersion: string };
export type EligibilityFacts = {
  policies?: Partial<OperationalPolicies>;
  version?: string;
  restriction?: string | null;
  room?: { valid: boolean; clean: boolean; occupied: boolean; maintenance: boolean };
};
export function reservationEligibility(b: RecordData, permissions: readonly Permission[], switches: { allocation: boolean; payments: boolean; amendments: boolean }, now: number, facts: EligibilityFacts = {}) {
  const active = ["confirmed", "checked_in"].includes(b.bookingStatus);
  const policies = operationalPolicies(facts.policies);
  const action = (permission: Permission, available: boolean, reason: string, enabled = true, lifecycle?: "checked_in" | "checked_out", restriction?: ActionRestriction | null): ActionEligibility => {
    const blockers: EligibilityBlocker[] = [];
    const add = (code: string, category: EligibilityBlocker["category"], message: string, resolution: EligibilityBlocker["resolution"] = null) => blockers.push({ code, category, message, resolution });
    const resolve = (permission: Permission, destination: EligibilityBlocker["resolution"]) => permissions.includes(permission) ? destination : null;
    if (!permissions.includes(permission)) add("FORBIDDEN", "permission", "Your hotel role does not permit this action. Ask the hotel owner for help.");
    else if (facts.restriction) add("HOTEL_RESTRICTED", "restriction", facts.restriction, resolve("setup.manage", "settings"));
    else if (!enabled) add("FEATURE_UNAVAILABLE", "restriction", "This feature is disabled in this deployment.");
    else {
      if (restriction) add(restriction.code, "state", restriction.message);
      else if (!available) add("RESERVATION_STATE_CONFLICT", "state", reason);
      if (lifecycle === "checked_in" && b.bookingStatus === "confirmed") {
        if (policies.requireAssignedRoom || policies.requireCleanRoom) {
          if (!b.physicalUnitId || !facts.room?.valid) add("ASSIGNED_ROOM_REQUIRED", "policy", "Assign an active physical room of this reservation's room type. Ask reception or the owner for help.", resolve("reservation.assign", "assignment"));
          if (facts.room?.occupied) add("ROOM_OCCUPIED", "policy", "The assigned room has conflicting occupancy. Ask reception or the owner to review the assignment.", resolve("reservation.assign", "assignment"));
          if (facts.room?.maintenance) add("ROOM_MAINTENANCE_RESTRICTED", "policy", "Maintenance restricts the assigned room during this stay. Ask reception or the owner to review the assignment.", resolve("reservation.assign", "assignment"));
        }
        if (policies.requireCleanRoom && !facts.room?.clean) add("CLEAN_ROOM_REQUIRED", "policy", "The assigned room must be clean or inspected. Unknown condition is not clean. Ask housekeeping or the owner for help.", resolve("housekeeping", "housekeeping"));
        if (policies.requireGuestRegistration) {
          const registration = registrationFacts(b);
          if (registration.historical) add("HISTORICAL_REGISTRATION_REVIEW_REQUIRED", "policy", "Historical manual guest identities cannot be established. No historical correction workflow is available; the owner controls this hotel policy.", resolve("setup.manage", "settings"));
          else if (!registration.complete) add("GUEST_REGISTRATION_REQUIRED", "policy", Object.values(registration.missing).some(n => n > 0) ? `Register saved names for ${registration.missing.adult} adult(s), ${registration.missing.child} child(ren) and ${registration.missing.infant} infant(s). Ask reception or the owner for help.` : "Saved guest names must match the reservation’s adult, child and infant counts. Ask reception or the owner to review registration.", resolve("reservation.note", "guests"));
        }
      }
      if (lifecycle === "checked_out" && b.bookingStatus === "checked_in" && policies.requireSettledBalance && stayFinancials(b).balanceDuePaise > 0) add("RESERVATION_BALANCE_DUE", "policy", permissions.includes("payment.read") ? `Settle the reservation balance of ₹${(stayFinancials(b).balanceDuePaise / 100).toFixed(2)} before checkout. Ask the cashier or owner for help.` : "The reservation balance must be settled before checkout. Ask the cashier or owner for help.", resolve("payment.collect", "payments"));
    }
    // Time boundaries are represented by availability, not the moving wall clock.
    return { allowed: blockers.length === 0, blockers, reason: blockers[0]?.message ?? null, eligibilityVersion: facts.version || "legacy" };
  };
  return {
    checked_in: action("reservation.operate", b.bookingStatus === "confirmed" && !(b.startAt && Date.parse(b.startAt) > now) && !(b.endAt && Date.parse(b.endAt) <= now), "Check-in requires a confirmed reservation within its agreed stay times.", true, "checked_in"),
    checked_out: action("reservation.operate", b.bookingStatus === "checked_in", "Only a checked-in stay can be checked out.", true, "checked_out"),
    no_show: action("reservation.cancel", b.bookingStatus === "confirmed" && !!b.startAt && Date.parse(b.startAt) <= now, "No-show is available after the agreed arrival for a confirmed reservation.", true, undefined, b.billingOpenCount > 0 ? { code: "BILLING_REVIEW_REQUIRED", status: 409, message: "Billing review required: an owner or manager must neutralize outstanding billing entries." } : null),
    cancelled: action("reservation.cancel", ["confirmed", "pending_payment"].includes(b.bookingStatus), "This reservation cannot be cancelled in its current state.", true, undefined, b.billingOpenCount > 0 ? { code: "BILLING_REVIEW_REQUIRED", status: 409, message: "Billing review required: an owner or manager must neutralize outstanding billing entries." } : null),
    assign: action("reservation.assign", active, "Only active stays can be assigned.", switches.allocation, undefined, assignmentRestriction(b)),
    collect: action("payment.collect", active || ["checked_out", "completed"].includes(b.bookingStatus), "This reservation cannot accept collection in its current state.", switches.payments, undefined, collectionRestriction(b)),
    amend: action("reservation.amend", active, "Only active stays can be amended.", switches.amendments, undefined, amendmentRestriction(b, now)),
  };
}
