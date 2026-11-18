import { localParts } from "@/lib/booking/domain";
import { actionableRequest, bookingStart, bookingEnd, type RecordData } from "@/lib/partner/dashboard/domain";
import { stayFinancials } from "@/lib/stay/domain";

export const todayQueues = {
  arrivals: "Arrivals", awaiting_check_in: "Awaiting check-in", departures: "Departures",
  in_house: "Currently checked in", unassigned: "Unassigned reservations", room_attention: "Assigned rooms needing attention",
  balances: "Outstanding balances", requests: "Actionable guest requests", overdue: "Overdue arrivals", overdue_departures: "Overdue departures", attention: "All live attention",
} as const;
export type TodayQueue = keyof typeof todayQueues;
export function evaluateReservation(b: RecordData, date: string, timezone: string, now: number, units: RecordData[], blocks: RecordData[], occupants: RecordData[]) {
  const status = b.bookingStatus, active = ["confirmed", "checked_in"].includes(status);
  const currentDate = localParts(now, timezone).date;
  const live = status === "checked_in" || (status === "confirmed" && b.checkIn <= currentDate);
  const roomScope = live || (status === "confirmed" && b.checkIn === date);
  const reasons: string[] = [];
  if (roomScope) {
    const unit = units.find(u => u.id === b.physicalUnitId);
    if (!b.physicalUnitId) reasons.push("Room unassigned");
    else {
      if (!unit || unit.status !== "active" || unit.roomTypeId !== b.roomType?.id) reasons.push("Missing or inactive room assignment");
      if (!unit || !["clean", "inspected"].includes(unit.housekeepingStatus)) reasons.push(`Cleaning: ${unit?.housekeepingStatus || "unknown"}`);
      if (blocks.some(r => (!r.unitId ? r.roomTypeId === b.roomType?.id : r.unitId === b.physicalUnitId) && bookingStart(r, timezone) < bookingEnd(b, timezone) && bookingEnd(r, timezone) > bookingStart(b, timezone))) reasons.push("Maintenance overlaps stay");
      if (occupants.some(o => o.id !== b.id && o.physicalUnitId === b.physicalUnitId)) reasons.push("Conflicting current occupancy");
    }
  }
  const requestCount = active && actionableRequest(b) ? (b.customizations || []).filter((r: RecordData) => ["requested", "confirmed", "preparing", "ready"].includes(r.status) && !["awaiting_customer", "awaiting_payment"].includes(r.settlement || "")).length : 0;
  const balance = stayFinancials(b).balanceDuePaise;
  const queues: TodayQueue[] = [];
  const add = (q: TodayQueue, yes: boolean) => { if (yes) queues.push(q); };
  const fulfilled = ["confirmed", "checked_in", "checked_out", "completed"].includes(status);
  add("arrivals", fulfilled && b.checkIn === date);
  add("awaiting_check_in", status === "confirmed" && b.checkIn === date);
  add("departures", fulfilled && b.checkOut === date);
  add("in_house", status === "checked_in");
  add("unassigned", roomScope && !b.physicalUnitId);
  add("room_attention", !!b.physicalUnitId && reasons.length > 0);
  add("balances", roomScope && balance > 0);
  add("requests", requestCount > 0);
  add("overdue", status === "confirmed" && bookingStart(b, timezone) < now);
  add("overdue_departures", status === "checked_in" && bookingEnd(b, timezone) < now);
  if (queues.includes("balances")) reasons.push("Outstanding balance");
  if (requestCount) reasons.push(`${requestCount} actionable requests`);
  if (queues.includes("overdue")) reasons.push("Agreed arrival time passed");
  if (queues.includes("overdue_departures")) reasons.push("Agreed departure time passed");
  add("attention", reasons.length > 0);
  return { queues, reasons, requestCount, balance };
}
