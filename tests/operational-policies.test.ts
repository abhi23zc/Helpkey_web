import { describe, expect, it } from "vitest";
import { reservationEligibility, type EligibilityFacts } from "@/lib/partner/reservations/eligibility";
import { operationalPolicies, registrationFacts } from "@/lib/partner/reservations/operational-policies";
import { permissions } from "@/lib/partner/pms/domain";
const now = Date.parse("2026-11-15T00:30:00Z");
const base = { bookingStatus: "confirmed", startAt: "2026-11-14T23:00:00Z", endAt: "2026-11-15T02:00:00Z", adults: 2, children: 1, infants: 1, identityVersion: 2, occupants: [{ name: "Lead Guest", ageGroup: "adult" }], totalPaise: 10000, paidPaise: 0 };
const features = { allocation: true, payments: true, amendments: true };
const evaluate = (b = base, facts: EligibilityFacts = {}) => reservationEligibility(b, permissions, features, now, facts);
describe("authoritative operational policy evaluation", () => {
  it("defaults independently to off and retains advisory behavior", () => {
    expect(Object.values(operationalPolicies())).toEqual([false, false, false, false]);
    expect(evaluate().checked_in.allowed).toBe(true);
    expect(evaluate({ ...base, bookingStatus: "checked_in" }).checked_out.allowed).toBe(true);
  });
  it("collects assignment, cleaning and registration blockers together", () => {
    const result = evaluate(base, { policies: { requireAssignedRoom: true, requireCleanRoom: true, requireGuestRegistration: true } }).checked_in;
    expect(result.blockers.map(b => b.code)).toEqual(["ASSIGNED_ROOM_REQUIRED", "CLEAN_ROOM_REQUIRED", "GUEST_REGISTRATION_REQUIRED"]);
    expect(result.reason).toBe(result.blockers[0].message);
    expect(result.blockers[2].message).toContain("1 adult(s), 1 child(ren) and 1 infant(s)");
  });
  it("clean-room policy independently requires assignment", () => {
    expect(evaluate(base, { policies: { requireCleanRoom: true } }).checked_in.blockers.map(b => b.code)).toEqual(["ASSIGNED_ROOM_REQUIRED", "CLEAN_ROOM_REQUIRED"]);
  });
  it("assignment alone does not enforce cleanliness", () => {
    expect(evaluate({ ...base, physicalUnitId: "u" } as typeof base, { policies: { requireAssignedRoom: true }, room: { valid: true, clean: false, occupied: false, maintenance: false } }).checked_in.allowed).toBe(true);
  });
  it("checks named counts by group rather than trusting a saved flag or total length", () => {
    expect(registrationFacts({ ...base, registrationIncomplete: false }).complete).toBe(false);
    expect(registrationFacts({ ...base, occupants: Array.from({ length: 4 }, () => ({ name: "Adult", ageGroup: "adult" })) }).missing).toEqual({ adult: 0, child: 1, infant: 1 });
    expect(registrationFacts({ ...base, occupants: [{ name: "Adult One", ageGroup: "adult" }, { name: "Adult Two", ageGroup: "adult" }, { name: "Child", ageGroup: "child" }, { name: "Infant", ageGroup: "infant" }], registrationIncomplete: true, preCheckin: {} }).complete).toBe(true);
  });
  it("does not infer historical manual identities, contacts or staff as occupants", () => {
    const b = { ...base, source: "manual_partner", identityVersion: 1, guestId: "staff", leadGuest: { adultGuestNames: ["Staff"] } };
    expect(evaluate(b, { policies: { requireGuestRegistration: true } }).checked_in.blockers[0].code).toBe("HISTORICAL_REGISTRATION_REVIEW_REQUIRED");
    expect(registrationFacts(b).occupants).toEqual([]);
  });
  it("supports original customer adult names and explicit canonical customer registration", () => {
    expect(registrationFacts({ adults: 1, leadGuest: { adultGuestNames: ["Customer"] } }).complete).toBe(true);
    expect(registrationFacts({ adults: 1, children: 1, leadGuest: { adultGuestNames: ["Customer"] }, preCheckin: { completed: true } }).complete).toBe(false);
    expect(registrationFacts({ adults: 1, registrationVersion: 1, occupants: [{ name: "Staying Guest", ageGroup: "adult" }] }).complete).toBe(true);
  });
  it.each([
    [10000, 0, 0, 0, true], [5000, 0, 0, 0, false], [10000, 1000, 0, 0, false], [10000, 0, 1000, 0, false], [5000, 0, 0, 5000, true],
  ])("uses only reservation financials: paid %s, refunded %s, reserved %s, credit %s", (paidPaise, refundedPaise, refundDuePaise, customizationCreditPaise, allowed) => {
    expect(evaluate({ ...base, bookingStatus: "checked_in", paidPaise, refundedPaise, refundDuePaise, customizationCreditPaise, balanceDuePaise: 0, stayPaymentReceipts: [{ amountPaise: 999999 }], pendingOnlinePaise: 10000 } as typeof base, { policies: { requireSettledBalance: true } }).checked_out.allowed).toBe(allowed);
  });
  it("withholds policy details and destinations from unauthorized roles", () => {
    const action = reservationEligibility(base, [], features, now, { policies: { requireSettledBalance: true, requireGuestRegistration: true } }).checked_in;
    expect(action.blockers).toHaveLength(1); expect(action.blockers[0].category).toBe("permission"); expect(action.blockers[0].resolution).toBeNull();
    const receptionist = reservationEligibility({ ...base, bookingStatus: "checked_in" }, ["reservation.operate"], features, now, { policies: { requireSettledBalance: true } }).checked_out;
    expect(receptionist.reason).not.toContain("100"); expect(receptionist.blockers[0].resolution).toBeNull();
  });
  it("uses absolute instants across midnight and hotel/device timezones", () => {
    expect(evaluate().checked_in.allowed).toBe(true);
    expect(evaluate({ ...base, startAt: "2026-11-15T01:00:00Z" }).checked_in.blockers[0].category).toBe("state");
    expect(evaluate({ ...base, endAt: "2026-11-15T00:30:00Z" }).checked_in.allowed).toBe(false);
  });
});
