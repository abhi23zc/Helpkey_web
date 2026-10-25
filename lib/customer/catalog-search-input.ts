import { z } from "zod";
import { hourlySearchFields } from "./stay-search";
import { validDate } from "@/lib/booking/domain";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export const catalogSorts = [
  "top_picks",
  "homes_and_apartments",
  "price_low_to_high",
  "price_high_to_low",
  "best_reviewed_lowest_price",
  "rating_high_to_low",
  "rating_low_to_high",
  "rating_and_price",
  "distance_from_downtown",
  "top_reviewed",
  "business_traveler_picks",
] as const;
export type CatalogSort = (typeof catalogSorts)[number];

export const catalogSearchSchema = z.object({
  ...hourlySearchFields,
  destination: z.string().trim().max(120).optional().default(""),
  checkIn: z.string().regex(datePattern).refine(validDate, "INVALID_DATE").optional(),
  checkOut: z.string().regex(datePattern).refine(validDate, "INVALID_DATE").optional(),
  adults: z.coerce.number().int().min(1).max(12).default(2),
  children: z.coerce.number().int().min(0).max(10).default(0),
  infants: z.coerce.number().int().min(0).max(10).default(0),
  placeId: z.string().trim().max(300).optional(),
  placeName: z.string().trim().max(200).optional(),
  placeAddress: z.string().trim().max(300).optional(),
  placeLat: z.coerce.number().gte(-90).lte(90).optional(),
  placeLng: z.coerce.number().gte(-180).lte(180).optional(),
  amenities: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  propertyType: z.string().trim().max(40).optional(),
  propertyTypes: z.array(z.string().trim().min(1).max(40)).max(4).optional(),
  freeCancellation: z.boolean().optional(),
  minPricePaise: z.coerce.number().int().nonnegative().optional(),
  maxPricePaise: z.coerce.number().int().nonnegative().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  sort: z.enum(catalogSorts).default("top_picks"),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  cursor: z.string().max(2048).optional(),
}).superRefine((value, ctx) => {
  if (value.bookingMode === "hourly" && (!value.checkIn || !value.arrivalTime || !value.durationMinutes)) ctx.addIssue({ code: "custom", message: "HOURLY_ARRIVAL_AND_DURATION_REQUIRED" });
  if (value.bookingMode !== "hourly" && ((value.checkIn && !value.checkOut) || (!value.checkIn && value.checkOut))) {
    ctx.addIssue({ code: "custom", message: "CHECK_IN_AND_OUT_REQUIRED" });
  }
  if (value.bookingMode !== "hourly" && value.checkIn && value.checkOut && value.checkOut <= value.checkIn) {
    ctx.addIssue({ code: "custom", message: "CHECK_OUT_MUST_FOLLOW_CHECK_IN" });
  }
  if (value.checkIn && value.checkOut && (new Date(`${value.checkOut}T00:00:00Z`).getTime() - new Date(`${value.checkIn}T00:00:00Z`).getTime()) / 86400000 > 30) {
    ctx.addIssue({ code: "custom", message: "MAXIMUM_STAY_IS_30_NIGHTS" });
  }
  if (value.minPricePaise !== undefined && value.maxPricePaise !== undefined && value.minPricePaise > value.maxPricePaise) {
    ctx.addIssue({ code: "custom", message: "INVALID_PRICE_RANGE" });
  }
  if (value.sort === "distance_from_downtown" && (value.placeLat === undefined || value.placeLng === undefined)) {
    ctx.addIssue({ code: "custom", message: "DISTANCE_SORT_REQUIRES_DESTINATION_COORDINATES" });
  }
});

export type CatalogSearch = z.infer<typeof catalogSearchSchema>;
/** One normalized request contract for SSR and HTTP. */
export function catalogSearchFromParams(params: URLSearchParams) {
  return catalogSearchSchema.parse({
    ...Object.fromEntries(params), amenities: params.getAll("amenity"),
    propertyTypes: params.getAll("propertyType"),
    freeCancellation: params.get("freeCancellation") === "true",
    limit: params.get("limit") ?? 24, cursor: params.get("cursor") || undefined,
  });
}
