/** The only pricing model accepted for new hourly reservations. */
export type DurationPrice = { hours: number; pricePaise: number };
export function validDurationPrices(value: unknown): value is DurationPrice[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 24
    && value.every(row => row && Number.isInteger(row.hours) && row.hours >= 1 && row.hours <= 24 && Number.isSafeInteger(row.pricePaise) && row.pricePaise > 0)
    && new Set(value.map(row => row.hours)).size === value.length;
}
export function eligiblePricing(rate: { bookingMode?: string; pricingModel?: string; durationPrices?: unknown }) {
  return (rate.bookingMode ?? "overnight") === "overnight"
    ? (rate.pricingModel ?? "nightly") === "nightly"
    : rate.bookingMode === "hourly" && rate.pricingModel === "duration" && validDurationPrices(rate.durationPrices);
}
export function startingPrice(rate: { bookingMode?: string; pricingModel?: string; durationPrices?: unknown; basePricePaise?: number }) {
  if (!eligiblePricing(rate)) return null;
  return rate.bookingMode === "hourly" && validDurationPrices(rate.durationPrices)
    ? Math.min(...rate.durationPrices.map(row => row.pricePaise)) : Number.isSafeInteger(rate.basePricePaise) && Number(rate.basePricePaise) > 0 ? rate.basePricePaise! : null;
}
