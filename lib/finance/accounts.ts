import type { FinancePolicy } from "./domain";
import type { Projection } from "./ledger";
import type { BookingAccount, FundAllocation } from "./source-integration";
export type AccountHold = { id: string; amountPaise: number; bookingId: string | null; reason: string; responsibleAdmin: string; releaseCondition: string; releasedAt: string | null; createdAt: string };
export type EligibleAllocation = FundAllocation & { bookingId: string; availablePaise: number; eligiblePaise: number; reasons: string[]; eligibleAt: string | null };
export function eligibleAllocations(bookings: BookingAccount[], holds: AccountHold[], ready: boolean, now: string): EligibleAllocation[] {
  const active = holds.filter(h => !h.releasedAt).map(h => ({ ...h, remaining: h.amountPaise }));
  return bookings.slice().sort((a, b) => a.bookingId.localeCompare(b.bookingId)).flatMap(b => b.allocations.map(a => {
    const l = b.lines.find(l => l.agreementId === a.agreementId && l.lineId === a.lineId)!;
    const peers = b.allocations.filter(p => p.agreementId === a.agreementId && p.lineId === a.lineId && p.source === a.source);
    let priorFunding = 0; for (const p of peers) { if (p.id === a.id) break; priorFunding += p.amountPaise - p.reversedPaise; }
    const reserved = a.refundReservedPaise ?? (a.source === "helpkey" ? Math.min(a.amountPaise - a.reversedPaise, Math.max(0, l.refundReservedPaise - priorFunding)) : 0);
    const availablePaise = a.source === "helpkey" && !l.helpkeyOwned ? Math.max(0, a.amountPaise - a.reversedPaise - reserved - a.offsetPaise) : 0;
    const reasons: string[] = [];
    if (!ready) reasons.push("Finance profile, supporting documents or agreement acceptance need review");
    if (l.assessment !== "complete") reasons.push("Deduction assessment unresolved");
    if (!a.feeResolved) reasons.push("Hotel-paid provider fee unconfirmed");
    if (l.fundedPaise + l.hotelFundedPaise - l.refundReservedPaise > l.grossPaise - l.reducedPaise) reasons.push("Excess collection requires refund resolution");
    if (b.retentionPending) reasons.push("Cancellation retention requires founder resolution");
    if (!l.eligibleAt) reasons.push("Checkout or service fulfilment pending"); else if (l.eligibleAt > now) reasons.push(`Waiting period ends ${l.eligibleAt}`);
    const blocked = reasons.length > 0;
    let adminHeld = 0;
    for (const h of active) if ((!h.bookingId || h.bookingId === b.bookingId) && h.remaining > 0 && availablePaise > 0) {
      const n = Math.min(availablePaise, h.remaining); h.remaining -= n; adminHeld = Math.max(adminHeld, n); reasons.push(h.reason);
    }
    return { ...a, bookingId: b.bookingId, availablePaise, eligiblePaise: blocked ? 0 : Math.max(0, availablePaise - adminHeld), reasons, eligibleAt: l.eligibleAt };
  }));
}
function matches(date: string, s: FinancePolicy["payoutSchedule"]) {
  if (s.kind === "daily") return true;
  if (s.kind === "weekdays") return s.weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay());
  const days = (Date.parse(date) - Date.parse(s.anchorDate)) / 86400000;
  return days >= 0 && days % s.everyDays === 0;
}
/** UTC candidates preserve both occurrences of repeated DST hours and skip missing hours. */
export function nextPreparationDate(after: string, schedule: FinancePolicy["payoutSchedule"]) {
  const start = Math.ceil(Date.parse(after) / 60000) * 60000;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: schedule.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  // Offset minutes vary by zone; inspect hourly candidates after aligning local minutes.
  for (let t = start; t <= start + 367 * 86400000; ) {
    const p = Object.fromEntries(formatter.formatToParts(t).map(p => [p.type, p.value]));
    if (`${p.hour}:${p.minute}` === schedule.localTime && matches(`${p.year}-${p.month}-${p.day}`, schedule)) return new Date(t).toISOString();
    const delta = (Number(schedule.localTime.slice(3)) - Number(p.minute) + 60) % 60;
    t += (delta || 60) * 60000;
  }
  return null;
}
export function accountSummary(projection: Projection, bookings: BookingAccount[], holds: AccountHold[], policy: FinancePolicy, ready: boolean, now: string) {
  const allocations = eligibleAllocations(bookings, holds, ready, now);
  const funds = allocations.reduce((n, a) => n + a.availablePaise, 0), eligible = allocations.reduce((n, a) => n + a.eligiblePaise, 0), charges = Math.max(0, projection.balances.hotel_charges);
  const offsetEstimatePaise = Math.min(eligible, charges), eligiblePaise = eligible - offsetEstimatePaise;
  const pending = bookings.flatMap(b => b.lines).filter(l => !l.helpkeyOwned && l.assessment !== "complete").length;
  const reasons = [...new Set(allocations.flatMap(a => a.reasons))];
  if (eligiblePaise < policy.minimumPayoutPaise) reasons.push("Eligible funds are below the minimum payout");
  if (!eligiblePaise) reasons.push("No eligible funds available");
  return { balances: { helpkeyHeldPaise: projection.balances.helpkey_cash, hotelCollectionsPaise: bookings.flatMap(b => b.allocations).filter(a => a.source === "hotel").reduce((n, a) => n + a.amountPaise - a.reversedPaise, 0), customerUnpaidPaise: Math.max(0, projection.balances.customer_obligation), refundReservationsPaise: Math.max(0, -projection.balances.refund_obligation), assessedChargesPaise: charges, hotelPayablePaise: Math.max(0, funds - charges), hotelDuesPaise: Math.max(0, charges - eligible), hotelCreditPaise: Math.max(0, -projection.balances.hotel_credit) + Math.max(0, -projection.balances.hotel_charges), heldPaise: funds - eligible, eligiblePaise, offsetEstimatePaise }, assessmentCompleteness: { complete: pending === 0, pending, provisional: pending > 0 || allocations.some(a => !a.feeResolved) }, holds: holds.filter(h => !h.releasedAt), allocations, scheduleEstimate: { preparationAt: ready && eligiblePaise > 0 && eligiblePaise >= policy.minimumPayoutPaise ? nextPreparationDate(now, policy.payoutSchedule) : null, amountPaise: eligiblePaise, status: "Awaiting founder approval" as const, reasons, executionEnabled: false as const }, duesWarning: charges >= policy.dues.limitPaise * policy.dues.warningBps / 10000 && charges > 0 };
}
