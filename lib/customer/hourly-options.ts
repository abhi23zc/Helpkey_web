import { eligiblePricing, validDurationPrices } from "@/lib/booking/duration-pricing";

/** A public configuration hint, never an availability or price promise. */
export function configuredHourlyPrices(property: Record<string, unknown>, room: Record<string, unknown> | undefined, rate: Record<string, unknown>) {
  const modes = (value: unknown) => Array.isArray(value) ? value : ["overnight"];
  if (property.inventoryEngine !== "interval_v1" || !modes(property.bookingModes).includes("hourly")
    || !room || room.status !== "active" || typeof room.totalInventory !== "number" || !Number.isFinite(room.totalInventory) || room.totalInventory <= 0
    || !modes(room.bookingModes ?? property.bookingModes).includes("hourly")
    || rate.status !== "active" || rate.bookingMode !== "hourly" || !eligiblePricing(rate)
    || !validDurationPrices(rate.durationPrices)) return [];
  return rate.durationPrices.map(({ hours, pricePaise }) => ({ hours, pricePaise }));
}

// Matches evaluateStay() and staySearchSchema; not a device-local assumption.
export const HOURLY_ARRIVAL_STEP_MINUTES = 15;
