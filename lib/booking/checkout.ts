import { bookingInput } from "@/lib/booking/contracts";
import type { z } from "zod";

export type CheckoutInput = z.infer<typeof bookingInput>;

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

/** Parses the public checkout URL identically on the server and client. */
export function checkoutInputFromSearchParams(params: SearchParams): CheckoutInput | null {
  const bookingMode = one(params.bookingMode) === "hourly" ? "hourly" : "overnight";
  const parsed = bookingInput.safeParse({
    bookingMode,
    propertySlug: one(params.property) ?? "",
    roomTypeId: one(params.room) ?? "",
    ratePlanId: one(params.rate) ?? "",
    checkIn: one(params.checkIn) ?? "",
    checkOut: one(params.checkOut) || undefined,
    arrivalTime: one(params.arrivalTime) || undefined,
    durationMinutes: one(params.durationMinutes) ? Number(one(params.durationMinutes)) : undefined,
    adults: Number(one(params.adults) ?? 2),
    children: Number(one(params.children) ?? 0),
    infants: Number(one(params.infants) ?? 0),
  });
  if (!parsed.success) return null;
  const input = parsed.data;
  if (input.bookingMode === "overnight" && !input.checkOut) return null;
  if (input.bookingMode === "hourly" && (!input.arrivalTime || !input.durationMinutes)) return null;
  return input;
}

export type CheckoutDisplay = {
  propertyName: string;
  propertyCity: string | null;
  propertyState: string | null;
  propertyAddress: string | null;
  propertyRatingAverage: number;
  propertyCoverImageUrl: string | null;
  propertyRules: import("@/lib/partner/guest-policies").GuestPolicies;
  timezone: string;
  roomType: { id: string; name: string };
  /** The room's guest limits, used to bound the checkout guest selector. */
  capacity: { maxAdults: number; maxChildren: number; maxInfants: number; maxOccupancy: number };
  ratePlan: { id: string; name: string; paymentMode: "full" | "deposit" | "pay_at_property" };
  bookingMode: "overnight" | "hourly";
  checkIn: string;
  checkOut: string;
  arrivalTime: string;
  departureTime: string;
  nights: number;
  durationMinutes: number;
  adults: number;
  children: number;
  infants: number;
};
