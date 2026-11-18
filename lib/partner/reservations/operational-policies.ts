import type { RecordData } from "@/lib/partner/dashboard/domain";

export const policyLabels = {
  requireAssignedRoom: "Require an assigned physical room before check-in",
  requireCleanRoom: "Require the assigned room to be clean or inspected before check-in",
  requireGuestRegistration: "Require complete staying-guest name registration before check-in",
  requireSettledBalance: "Require the reservation balance to be settled before checkout",
} as const;
export type OperationalPolicies = Record<keyof typeof policyLabels, boolean>;
export function operationalPolicies(value?: Partial<OperationalPolicies> | null): OperationalPolicies {
  return Object.fromEntries(Object.keys(policyLabels).map(key => [key, value?.[key as keyof OperationalPolicies] === true])) as OperationalPolicies;
}
/** Only explicit canonical registrations and customer-supplied staying names are authoritative. */
export function registrationFacts(b: RecordData) {
  const historical = b.source === "manual_partner" && b.identityVersion !== 2;
  const canonical = b.identityVersion === 2 || b.registrationVersion === 1;
  const occupants: { name: string; ageGroup: string }[] = canonical
    ? (Array.isArray(b.occupants) ? b.occupants.filter(o => o && typeof o === "object") : [])
    : historical ? [] : (Array.isArray(b.leadGuest?.adultGuestNames) ? b.leadGuest.adultGuestNames : []).map((name: string) => ({ name, ageGroup: "adult" }));
  const missing = { adult: 0, child: 0, infant: 0 };
  let countsMatch = true;
  for (const group of ["adult", "child", "infant"] as const) {
    const count = Number(b[group === "adult" ? "adults" : group === "child" ? "children" : "infants"] ?? (group === "adult" ? 1 : 0));
    const saved = occupants.filter(o => o.ageGroup === group && typeof o.name === "string" && o.name.trim().length >= 2).length;
    missing[group] = Number.isSafeInteger(count) && count >= 0 ? Math.max(0, count - saved) : 0;
    countsMatch &&= Number.isSafeInteger(count) && count >= (group === "adult" ? 1 : 0) && saved === count;
  }
  return { historical, occupants, missing, complete: !historical && countsMatch };
}
