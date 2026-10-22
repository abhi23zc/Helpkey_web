import { validDurationPrices, type DurationPrice } from "./duration-pricing";
/** Pure booking rules shared by authoritative quotes and reservation transactions. */
export type BookingMode = "overnight" | "hourly";
export type PricingModel = "nightly" | "duration";
export const INTERVAL_MS = 15 * 60_000;
export type StayRequest = { bookingMode?: BookingMode; checkIn: string; checkOut?: string; arrivalTime?: string; durationMinutes?: number; adults: number; children: number; infants: number };
type Settings = {
  childrenPolicy?: { allowed?: boolean | null };
  timezone?: string; bookingModes?: string[]; bookingMode?: string; pricingModel?: PricingModel;
  maxAdults?: number; maxChildren?: number; maxInfants?: number; maxOccupancy?: number;
  checkInTime?: string; checkOutTime?: string; cleaningBufferMinutes?: number;
  basePricePaise?: number; durationPrices?: DurationPrice[];
  paymentMode?: string; depositBasisPoints?: number; taxBasisPoints?: number; customerFeePaise?: number;
  allowMidnightCrossing?: boolean; arrivalWindow?: { start: string; end: string };
  operatingWindow?: { start: string; end: string }; eligibleWeekdays?: number[];
  refundableUntilHours?: number; cancellationFeePercent?: number;
  stayRules?: { minimumNights?: number; maximumNights?: number; minimumDurationMinutes?: number; maximumDurationMinutes?: number; minimumAdvanceMinutes?: number; maximumAdvanceDays?: number };
};

export function validDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number(date.slice(0, 4)) >= 1900 && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
const formatters = new Map<string, Intl.DateTimeFormat>();
export function localParts(ms: number, timezone: string) {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    if (formatters.size >= 128) formatters.clear();
    formatters.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(ms);
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, second: p.second };
}
export function resolveLocal(date: string, time: string, timezone: string) {
  if (!validDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("INVALID_LOCAL_TIME");
  const nominal = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set<number>();
  for (let delta = -36; delta <= 36; delta += 6) {
    const sample = nominal + delta * 3600_000;
    const p = localParts(sample, timezone);
    offsets.add(Date.parse(`${p.date}T${p.time}:${p.second}Z`) - sample);
  }
  const matches = [...offsets].map((offset) => nominal - offset).filter((ms) => { const p = localParts(ms, timezone); return p.date === date && p.time === time; });
  if (matches.length !== 1) throw new Error(matches.length ? "AMBIGUOUS_LOCAL_TIME" : "NONEXISTENT_LOCAL_TIME");
  return matches[0];
}
export function money(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error("INVALID_MONEY");
  return Number(value);
}
function integer(value: unknown, fallback: number, min: number, max: number) {
  const n = value ?? fallback;
  if (!Number.isSafeInteger(n) || Number(n) < min || Number(n) > max) throw new Error("INVALID_RATE_CONFIGURATION");
  return Number(n);
}
export function evaluateStay(input: StayRequest, property: Settings, room: Settings, rate: Settings, now = Date.now()) {
  if (property.childrenPolicy?.allowed === false && (input.children > 0 || input.infants > 0)) throw new Error("CHILDREN_NOT_ALLOWED");
  const bookingMode = input.bookingMode ?? "overnight";
  const timezone = property.timezone ?? "Asia/Kolkata";
  localParts(now, timezone); // Validate the IANA timezone, including legacy defaults.
  if (!(property.bookingModes ?? ["overnight"]).includes(bookingMode) || !(room.bookingModes ?? property.bookingModes ?? ["overnight"]).includes(bookingMode)) throw new Error("BOOKING_MODE_NOT_AVAILABLE");
  const pricingModel: PricingModel = rate.pricingModel ?? "nightly";
  if ((rate.bookingMode ?? "overnight") !== bookingMode || (bookingMode === "overnight" ? pricingModel !== "nightly" : pricingModel !== "duration")) throw new Error("RATE_NOT_AVAILABLE");
  if (input.adults > (room.maxAdults ?? 1) || input.children > (room.maxChildren ?? 0) || input.infants > (room.maxInfants ?? 10) || input.adults + input.children > (room.maxOccupancy ?? (room.maxAdults ?? 1) + (room.maxChildren ?? 0))) throw new Error("ROOM_CAPACITY_EXCEEDED");
  const rules = rate.stayRules ?? {};
  let nights = 0;
  let durationMinutes: number;
  let end: number;
  const start = resolveLocal(input.checkIn, bookingMode === "hourly" ? input.arrivalTime ?? "" : property.checkInTime ?? "14:00", timezone);
  if (bookingMode === "overnight") {
    if (!input.checkOut || !validDate(input.checkOut)) throw new Error("INVALID_LOCAL_TIME");
    nights = (Date.parse(`${input.checkOut}T00:00Z`) - Date.parse(`${input.checkIn}T00:00Z`)) / 86400_000;
    if (nights < (rules.minimumNights ?? 1) || nights > Math.min(rules.maximumNights || 30, 30)) throw new Error("STAY_LENGTH_NOT_ALLOWED");
    end = resolveLocal(input.checkOut, property.checkOutTime ?? "11:00", timezone);
    durationMinutes = (end - start) / 60_000;
  } else {
    if (Number(input.arrivalTime?.slice(3)) % 15 !== 0) throw new Error("ARRIVAL_MUST_BE_QUARTER_HOUR");
    durationMinutes = integer(input.durationMinutes, 0, 60, 1440);
    if (durationMinutes % 60 !== 0) throw new Error("WHOLE_HOUR_DURATION_REQUIRED");
    if (!validDurationPrices(rate.durationPrices)) throw new Error("INVALID_DURATION_PRICES");
    if (!rate.durationPrices.some(row => row.hours * 60 === durationMinutes)) throw new Error("DURATION_NOT_PRICED");
    if (durationMinutes % 15 || durationMinutes < (rules.minimumDurationMinutes ?? 15) || durationMinutes > (rules.maximumDurationMinutes ?? 1440)) throw new Error("STAY_LENGTH_NOT_ALLOWED");
    end = start + durationMinutes * 60_000;
    const endLocal = localParts(end, timezone);
    if (rate.allowMidnightCrossing !== true && endLocal.date !== input.checkIn) throw new Error("MIDNIGHT_CROSSING_NOT_ALLOWED");
    const window = rate.arrivalWindow ?? { start: "00:00", end: "23:59" };
    const arrival = input.arrivalTime!;
    if (window.start > window.end || arrival < window.start || arrival > window.end) throw new Error("OUTSIDE_ARRIVAL_WINDOW");
    // After-midnight arrivals belong to the operating window opened the previous day.
    if (rate.operatingWindow && rate.operatingWindow.start !== rate.operatingWindow.end) {
      const w = rate.operatingWindow;
      const crossesMidnight = w.end < w.start;
      const dateOffset = crossesMidnight && arrival < w.end ? -1 : 0;
      const dateAt = (offset: number) => new Date(Date.parse(`${input.checkIn}T00:00Z`) + offset * 86400_000).toISOString().slice(0, 10);
      const windowStart = resolveLocal(dateAt(dateOffset), w.start, timezone);
      const windowEnd = resolveLocal(dateAt(dateOffset + Number(crossesMidnight)), w.end, timezone);
      if (start < windowStart || end > windowEnd) throw new Error("OUTSIDE_OPERATING_WINDOW");
    }
  }
  if (end <= start) throw new Error("CHECK_OUT_MUST_FOLLOW_CHECK_IN");
  const minimumNotice = integer(rules.minimumAdvanceMinutes, bookingMode === "hourly" ? 15 : 0, 0, 525600);
  if (start < now + minimumNotice * 60_000) throw new Error("CHECK_IN_IN_PAST");
  if (start > now + Math.min(rules.maximumAdvanceDays ?? 365, 365) * 86400_000) throw new Error("ARRIVAL_TOO_FAR_AHEAD");
  const weekday = new Date(`${input.checkIn}T00:00Z`).getUTCDay();
  if (Array.isArray(rate.eligibleWeekdays) && !rate.eligibleWeekdays.includes(weekday)) throw new Error("ARRIVAL_WEEKDAY_NOT_ALLOWED");
  const cleaningBufferMinutes = integer(room.cleaningBufferMinutes ?? property.cleaningBufferMinutes, 30, 0, 1440);
  const billedHours = bookingMode === "hourly" ? durationMinutes / 60 : 0;
  const unitPricePaise = money(pricingModel === "duration" ? rate.durationPrices?.find(row => row.hours * 60 === durationMinutes)?.pricePaise : rate.basePricePaise);
  const subtotalPaise = money(unitPricePaise * (pricingModel === "nightly" ? nights : 1));
  const taxBasisPoints = integer(rate.taxBasisPoints, 0, 0, 10000);
  const taxPaise = Number((BigInt(subtotalPaise) * BigInt(taxBasisPoints) + BigInt(5000)) / BigInt(10000));
  const customerFeePaise = money(rate.customerFeePaise ?? 0);
  const totalPaise = money(subtotalPaise + taxPaise + customerFeePaise);
  const paymentMode = rate.paymentMode ?? "full";
  if (!["full", "deposit", "pay_at_property"].includes(paymentMode)) throw new Error("INVALID_RATE_CONFIGURATION");
  const depositBasisPoints = integer(rate.depositBasisPoints, paymentMode === "deposit" ? 2500 : 10000, 0, 10000);
  const payableNowPaise = paymentMode === "pay_at_property" ? 0 : paymentMode === "deposit" ? Number((BigInt(totalPaise) * BigInt(depositBasisPoints) + BigInt(5000)) / BigInt(10000)) : totalPaise;
  return { bookingMode, pricingModel, timezone, startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(), inventoryEndAt: new Date(end + cleaningBufferMinutes * 60_000).toISOString(), checkIn: input.checkIn, checkOut: localParts(end, timezone).date, arrivalTime: localParts(start, timezone).time, departureTime: localParts(end, timezone).time, durationMinutes, cleaningBufferMinutes, nights, billedHours, unitPricePaise, subtotalPaise, taxBasisPoints, taxPaise, customerFeePaise, totalPaise, payableNowPaise, balanceDuePaise: totalPaise - payableNowPaise, paymentMode, depositBasisPoints };
}
export type Allocation = { date: string; intervals: string[] };
export function allocateIntervals(startAt: string, inventoryEndAt: string, timezone: string): Allocation[] {
  const start = Date.parse(startAt), end = Date.parse(inventoryEndAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 32 * 86400_000) throw new Error("INVALID_INVENTORY_INTERVAL");
  const byDate = new Map<string, string[]>();
  for (let ms = Math.floor(start / INTERVAL_MS) * INTERVAL_MS; ms < end; ms += INTERVAL_MS) {
    const date = localParts(ms, timezone).date;
    const intervals = byDate.get(date) ?? [];
    intervals.push(String(ms / INTERVAL_MS));
    byDate.set(date, intervals);
  }
  return [...byDate].map(([date, intervals]) => ({ date, intervals }));
}
export function canonicalStatus(status: string) { return status === "completed" ? "checked_out" : status; }
export function assertTransition(current: string, next: string) {
  const allowed: Record<string, string[]> = { pending_payment: ["confirmed", "expired", "cancelled"], confirmed: ["checked_in", "cancelled", "no_show"], checked_in: ["checked_out"] };
  if (!allowed[canonicalStatus(current)]?.includes(canonicalStatus(next))) throw new Error("INVALID_BOOKING_TRANSITION");
}
export function cancellationRefund(paidPaise: number, refundedPaise: number, startAt: string, policy: Settings | null, now: number, partnerCaused = false, bookingTotalPaise = paidPaise) {
  const remaining = Math.max(0, money(paidPaise) - money(refundedPaise));
  if (partnerCaused) return remaining;
  if (!policy || now > Date.parse(startAt) - Math.max(0, policy.refundableUntilHours ?? 0) * 3600_000) return 0;
  const feePercent = Math.max(0, Math.min(100, Number(policy.cancellationFeePercent ?? 100)));
  if (!Number.isInteger(feePercent)) return 0;
  const feePaise = Number((BigInt(money(bookingTotalPaise)) * BigInt(feePercent) + BigInt(50)) / BigInt(100));
  return Math.min(remaining, Math.max(0, paidPaise - refundedPaise - feePaise));
}
