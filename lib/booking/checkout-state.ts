import { agreedRequests } from "@/lib/stay/domain";
import type { StayRequest } from "@/lib/stay/contracts";
/** Pure helpers for the editable guest selector and consent handling on checkout. */

export type GuestCounts = { adults: number; children: number; infants: number };

export type GuestCapacity = {
  maxAdults: number;
  maxChildren: number;
  maxInfants: number;
  maxOccupancy: number;
};

/** Hard ceilings shared with the booking contract (`bookingInput`). */
export const GUEST_HARD_LIMITS = { adults: 12, children: 10, infants: 10 } as const;

export type GuestLimits = {
  adults: { min: number; max: number; limitedByRoom: boolean };
  children: { min: number; max: number; limitedByRoom: boolean };
  infants: { min: number; max: number; limitedByRoom: boolean };
};

/**
 * Upper bounds for each stepper given the other counts, mirroring the server
 * rules in `evaluateStay`: adults and children share `maxOccupancy`, infants do
 * not, and a property that disallows children also disallows infants.
 * Without capacity data only the contract ceilings apply (the server still
 * validates everything).
 */
export function guestLimits(
  counts: GuestCounts,
  capacity: GuestCapacity | null,
  childrenAllowed: boolean,
): GuestLimits {
  const cap = (hard: number, ...room: number[]) => {
    const max = Math.min(hard, ...room);
    return { max, limitedByRoom: max < hard };
  };
  const adults = capacity
    ? cap(GUEST_HARD_LIMITS.adults, capacity.maxAdults, capacity.maxOccupancy - counts.children)
    : cap(GUEST_HARD_LIMITS.adults);
  const children = !childrenAllowed
    ? { max: 0, limitedByRoom: true }
    : capacity
      ? cap(GUEST_HARD_LIMITS.children, capacity.maxChildren, capacity.maxOccupancy - counts.adults)
      : cap(GUEST_HARD_LIMITS.children);
  const infants = !childrenAllowed
    ? { max: 0, limitedByRoom: true }
    : capacity
      ? cap(GUEST_HARD_LIMITS.infants, capacity.maxInfants)
      : cap(GUEST_HARD_LIMITS.infants);
  return {
    // Never report a maximum below the minimum or below the current value, so a
    // stepper can always be used to move back toward a valid selection.
    adults: { min: 1, ...adults, max: Math.max(1, adults.max) },
    children: { min: 0, ...children, max: Math.max(0, children.max) },
    infants: { min: 0, ...infants, max: Math.max(0, infants.max) },
  };
}

export function clampGuests(
  next: GuestCounts,
  capacity: GuestCapacity | null,
  childrenAllowed: boolean,
): GuestCounts {
  // Adults take priority for shared occupancy; children are trimmed to what is left.
  const alone = { adults: 1, children: 0, infants: 0 };
  const adults = Math.max(1, Math.min(next.adults, guestLimits(alone, capacity, childrenAllowed).adults.max));
  const withAdults = { adults, children: 0, infants: 0 };
  const children = Math.max(0, Math.min(next.children, guestLimits(withAdults, capacity, childrenAllowed).children.max));
  const infants = Math.max(0, Math.min(next.infants, guestLimits(withAdults, capacity, childrenAllowed).infants.max));
  return { adults, children, infants };
}

export function sameGuests(a: GuestCounts, b: GuestCounts) {
  return a.adults === b.adults && a.children === b.children && a.infants === b.infants;
}

export function guestSummary({ adults, children, infants }: GuestCounts) {
  return `${adults} Adult${adults === 1 ? "" : "s"}, ${children} ${children === 1 ? "Child" : "Children"}, ${infants} Infant${infants === 1 ? "" : "s"}`;
}

/** Writes the guest counts into a query string, leaving every other parameter alone. */
export function searchWithGuests(search: string, counts: GuestCounts) {
  const params = new URLSearchParams(search);
  params.set("adults", String(counts.adults));
  params.set("children", String(counts.children));
  params.set("infants", String(counts.infants));
  return params.toString();
}

/**
 * The parts of a quote a guest agrees to. Guest counts, timestamps, and the
 * opaque fingerprint are deliberately excluded: changing only the number of
 * guests must not make someone re-accept terms, but any change to the price,
 * payment split, timing, room, rate, or cancellation rules must.
 */
export type TermsQuote = {
  bookingMode: string;
  roomType: { name: string };
  ratePlan: { name: string; paymentMode: string };
  startAt: string;
  checkIn: string;
  checkOut: string;
  durationMinutes: number;
  nights: number;
  currency: string;
  subtotalPaise: number;
  taxPaise: number;
  customerFeePaise: number;
  totalPaise: number;
  payableNowPaise: number;
  balanceDuePaise: number;
  cancellationPolicy: unknown;
  customizations?: StayRequest[];
};

export function quoteTermsKey(quote: TermsQuote) {
  return JSON.stringify([
    quote.bookingMode,
    quote.roomType.name,
    quote.ratePlan.name,
    quote.ratePlan.paymentMode,
    quote.startAt,
    quote.checkIn,
    quote.checkOut,
    quote.durationMinutes,
    quote.nights,
    quote.currency,
    quote.subtotalPaise,
    quote.taxPaise,
    quote.customerFeePaise,
    quote.totalPaise,
    quote.payableNowPaise,
    quote.balanceDuePaise,
    quote.cancellationPolicy ?? null,
    agreedRequests(quote.customizations ?? []),
  ]);
}
