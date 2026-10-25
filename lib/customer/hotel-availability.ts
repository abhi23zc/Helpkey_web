import type { CancellationTerms } from "@/lib/customer/offer";

export type BookableRoom = {
  id: string;
  name: string;
  description: string;
  totalInventory: number;
  maxAdults: number;
  maxChildren: number;
  maxInfants?: number;
  maxOccupancy: number;
  roomSizeSqFt: number | null;
  amenityCodes: string[];
  bedConfigurations?: Array<{ bedType: string; count: number }>;
  imageUrl: string | null;
  imageSrcSet?: string;
  imageWidth?: number;
  imageHeight?: number;
  rates: Array<{
    id: string;
    name: string;
    bookingMode?: "overnight" | "hourly";
    endAt?: string | null;
    startAt?: string | null;
    nights?: number | null;
    validUntil?: number | null;
    subtotalPaise?: number | null;
    taxPaise?: number | null;
    payableNowPaise?: number | null;
    balanceDuePaise?: number | null;
    totalPaise?: number | null;
    durationMinutes?: number | null;
    basePricePaise: number;
    paymentMode: "full" | "deposit" | "pay_at_property";
    taxBasisPoints?: number;
    customerFeePaise?: number;
    breakfastIncluded?: boolean;
    cancellationTerms?: CancellationTerms;
    cancellation: { name: string; description: string } | null;
  }>;
};

export type Availability = {
  ratePlanModes?: Record<string, "overnight" | "hourly">;
  rooms: BookableRoom[];
  hourlyDurations: HourlyDurationOption[];
  expiresAt: number;
  serverNow?: number;
};

export type HourlyDurationOption = {
  roomTypeId: string;
  ratePlanId: string;
  prices: { hours: number; pricePaise: number }[];
};

// Deadlines belong to response objects, so reusing a cached result cannot renew it.
const deadlines = new WeakMap<Availability, { monotonic: number; wall: number }>();
export function rememberAvailability(result: Availability, elapsedMs: number) {
  if (deadlines.has(result)) return result;
  const remaining = Math.min(30_000, result.expiresAt - (result.serverNow ?? Date.now())) - Math.max(0, elapsedMs);
  const lifetime = Math.max(0, remaining);
  deadlines.set(result, { monotonic: performance.now() + lifetime, wall: Date.now() + lifetime });
  return result;
}
export function availabilityRemaining(result: Availability | undefined) {
  if (!result) return 0;
  const deadline = deadlines.get(result);
  if (!deadline) return 0;
  // Wall time catches suspended devices; monotonic time prevents clock rollback
  // from extending availability. Both are relative to receipt, not client/server skew.
  return Math.max(0, Math.min(deadline.monotonic - performance.now(), deadline.wall - Date.now()));
}
