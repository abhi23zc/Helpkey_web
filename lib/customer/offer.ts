/** Public offer fields only; safe to share with browser components. */
export type CancellationTerms = { freeCancellation: boolean; deadline: string | null; feePercent: number | null; name: string | null };
export type SearchOffer = {
  roomTypeId: string; ratePlanId: string; roomName: string | null;
  beds: { bedType: string; count: number }[]; amenityCodes: string[];
  payableNowPaise?: number; balanceDuePaise?: number; totalPaise: number; subtotalPaise: number; taxPaise: number; customerFeePaise: number;
  breakfastIncluded: boolean; cancellation: CancellationTerms;
  startAt: string; endAt: string; timezone: string; nights: number; durationMinutes: number;
  bookingMode: "overnight" | "hourly"; validUntil: number;
};

export function cancellationTerms(policy: Record<string, unknown> | null | undefined, startAt: string, now = Date.now()): CancellationTerms {
  const hours = policy?.refundableUntilHours;
  const fee = policy?.cancellationFeePercent;
  const valid = Number.isInteger(hours) && Number(hours) >= 0 && Number.isInteger(fee) && Number(fee) >= 0 && Number(fee) <= 100;
  const deadlineMs = valid ? Date.parse(startAt) - Number(hours) * 3600_000 : NaN;
  const deadline = Number.isFinite(deadlineMs) ? new Date(deadlineMs).toISOString() : null;
  return { freeCancellation: !!deadline && fee === 0 && now <= deadlineMs, deadline, feePercent: valid ? Number(fee) : null, name: typeof policy?.name === "string" ? policy.name : null };
}

export function cancellationLabel(terms: CancellationTerms, timezone: string, now = Date.now()) {
  if (!terms.freeCancellation || !terms.deadline || Date.parse(terms.deadline) < now) return null;
  return `Free cancellation until ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: timezone, timeZoneName: "short" }).format(new Date(terms.deadline))}`;
}

export function guestScoreLabel(rating: number) {
  return rating >= 4.5 ? "Exceptional" : rating >= 4 ? "Very good" : rating >= 3.5 ? "Good" : rating >= 3 ? "Pleasant" : "Guest rating";
}

export function formatMoney(value: number | null, currency = "INR") {
  return value === null ? "Choose dates for price" : new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: value % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(value / 100);
}
