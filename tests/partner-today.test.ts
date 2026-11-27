import { describe, expect, it } from "vitest";
import { evaluateReservation } from "@/lib/partner/today/domain";
import { reservationEligibility } from "@/lib/partner/reservations/eligibility";
import { landing } from "@/lib/partner/pms/domain";
const now = Date.parse("2026-11-14T20:00:00Z"), timezone = "Asia/Kolkata";
const base = { id: "a", bookingStatus: "confirmed", checkIn: "2026-11-15", checkOut: "2026-11-16", startAt: "2026-11-15T00:00:00Z", endAt: "2026-11-16T00:00:00Z", totalPaise: 10000, paidPaise: 4000 };
const evaluate = (b = base, date = "2026-11-15", units: object[] = [], blocks: object[] = [], occupants: object[] = []) => evaluateReservation(b, date, timezone, now, units, blocks, occupants);
describe("hotel-local Today queues", () => {
  it("uses hotel day and excludes future stays from live room and balance attention unless selected", () => {
    expect(evaluate().queues).toContain("balances");
    const future = { ...base, checkIn: "2026-11-16" };
    expect(evaluate(future).queues).not.toContain("balances");
    expect(evaluate(future, "2026-11-16").queues).toContain("balances");
    expect(evaluate(future, "2026-11-16").queues).toContain("arrivals");
  });
  it("includes fulfilled selected activity, but excludes cancelled stays and live history", () => {
    const completed = evaluate({ ...base, bookingStatus: "completed" });
    expect(completed.queues).toEqual(["arrivals"]);
    expect(evaluate({ ...base, bookingStatus: "cancelled" }).queues).toEqual([]);
    expect(evaluate().queues).toContain("awaiting_check_in");
  });
  it("keeps overdue checked-in guests visible independent of selected date", () => {
    const result = evaluate({ ...base, bookingStatus: "checked_in", checkIn: "2026-11-01", checkOut: "2026-11-02", endAt: "2026-11-02T00:00:00Z" }, "2027-01-01");
    expect(result.queues).toEqual(expect.arrayContaining(["in_house", "overdue_departures", "balances", "unassigned", "attention"]));
  });
  it("combines advisory reasons once, counts actionable requests separately, and honors settlement", () => {
    const result = evaluate({ ...base, physicalUnitId: "101", roomType: { id: "r" }, customizations: [{ status: "requested" }, { status: "ready" }, { status: "confirmed", settlement: "awaiting_payment" }] } as typeof base,
      "2026-11-15", [{ id: "101", status: "inactive", housekeepingStatus: "dirty", roomTypeId: "r" }], [{ unitId: "101", startAt: "2026-11-15T00:00:00Z", endAt: "2026-11-16T00:00:00Z" }], [{ id: "other", physicalUnitId: "101" }]);
    expect(result.reasons).toEqual(expect.arrayContaining(["Missing or inactive room assignment", "Cleaning: dirty", "Maintenance overlaps stay", "Conflicting current occupancy"]));
    expect(result.requestCount).toBe(2);
    expect(result.queues.filter(q => q === "attention")).toHaveLength(1);
    expect(result.balance).toBe(6000);
  });
  it("uses agreed instants for midnight-crossing hourly stays and overdue arrivals", () => {
    const b = { ...base, bookingMode: "hourly", checkIn: "2026-11-14", checkOut: "2026-11-15", startAt: "2026-11-14T18:00:00Z", endAt: "2026-11-14T21:00:00Z" };
    expect(evaluate(b).queues).toEqual(expect.arrayContaining(["departures", "overdue"]));
    expect(evaluate({ ...b, bookingStatus: "checked_in" }).queues).not.toContain("overdue_departures");
  });
  it("does not gate lifecycle on dirty rooms, incomplete registration or balances", () => {
    const actions = reservationEligibility({ ...base, startAt: "2026-11-14T00:00:00Z", registrationIncomplete: true }, ["reservation.operate"], { allocation: true, payments: false, amendments: false }, now);
    expect(actions.checked_in.allowed).toBe(true);
    expect(actions.collect.reason).toContain("role");
    expect(landing("owner")).toBe("/partner/dashboard");
    expect(landing("receptionist")).toBe("/partner/reservations");
    expect(landing("cashier")).toBe("/partner/operations");
  });
});
