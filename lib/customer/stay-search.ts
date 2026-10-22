import { z } from "zod";

import { validDate } from "@/lib/booking/domain";
const date = z.string().refine(validDate, "INVALID_DATE");
export const hourlySearchFields = {
  bookingMode: z.enum(["overnight", "hourly"]).optional(),
  arrivalTime: z.string().regex(/^([01]\d|2[0-3]):(00|15|30|45)$/).optional(),
  durationMinutes: z.coerce.number().int().min(60).max(1440).multipleOf(60).optional(),
};

/** The shareable customer-search contract used between search, hotel, and checkout. */
export const staySearchSchema = z.object({
  ...hourlySearchFields,
  checkIn: date.optional(),
  checkOut: date.optional(),
  adults: z.coerce.number().int().min(1).max(12).default(2),
  children: z.coerce.number().int().min(0).max(10).default(0),
  infants: z.coerce.number().int().min(0).max(10).default(0),
}).superRefine((value, context) => {
  if (value.bookingMode === "hourly") {
    if (!value.checkIn || !value.arrivalTime || !value.durationMinutes) context.addIssue({ code: "custom", message: "HOURLY_ARRIVAL_AND_DURATION_REQUIRED" });
    return;
  }
  if (Boolean(value.checkIn) !== Boolean(value.checkOut)) context.addIssue({ code: "custom", message: "DATES_MUST_BE_PAIRED" });
  if (value.checkIn && value.checkOut && (Date.parse(`${value.checkOut}T00:00:00Z`) - Date.parse(`${value.checkIn}T00:00:00Z`)) / 86_400_000 > 30) context.addIssue({ code: "custom", message: "MAXIMUM_STAY_IS_30_NIGHTS" });
  if (value.checkIn && value.checkOut && value.checkOut <= value.checkIn) context.addIssue({ code: "custom", message: "CHECK_OUT_MUST_FOLLOW_CHECK_IN" });
});

export type StaySearch = z.infer<typeof staySearchSchema>;

export function staySearchFromParams(params: URLSearchParams): StaySearch | null {
  const parsed = staySearchSchema.safeParse({
    bookingMode: params.get("bookingMode") || undefined,
    arrivalTime: params.get("arrivalTime") || undefined,
    durationMinutes: params.get("durationMinutes") || undefined,
    checkIn: params.get("checkIn") || undefined,
    checkOut: params.get("checkOut") || undefined,
    adults: params.get("adults") ?? 2,
    children: params.get("children") ?? 0,
    infants: params.get("infants") ?? 0,
  });
  return parsed.success ? parsed.data : null;
}

export function withStaySearch(params: URLSearchParams, stay: StaySearch) {
  const next = new URLSearchParams(params);
  for (const key of ["bookingMode", "arrivalTime", "durationMinutes", "checkIn", "checkOut", "adults", "children", "infants"] as const) {
    const value = stay[key];
    if (value === undefined || value === "") next.delete(key);
    else next.set(key, String(value));
  }
  // A quoted room/rate belongs to one stay. Editing that stay starts a new
  // selection rather than comparing its offers with the previous search.
  return JSON.stringify(normalizedStay(staySearchFromParams(params))) === JSON.stringify(normalizedStay(stay))
    ? next
    : withoutStayOffer(next);
}

export function withoutStayOffer(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  for (const key of ["roomTypeId", "ratePlanId", "searchTotalPaise", "room", "rate"]) next.delete(key);
  return next;
}

export function formatStayDate(value?: string) {
  if (!value) return "Add dates";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

/** Stable defaults for both server hydration and client availability requests. */
export function normalizedStay(stay: StaySearch | null) {
  return { bookingMode: stay?.bookingMode ?? "overnight", adults: stay?.adults ?? 2, children: stay?.children ?? 0, infants: stay?.infants ?? 0,
    ...(stay?.checkIn ? { checkIn: stay.checkIn, ...(stay.bookingMode === "hourly" ? { arrivalTime: stay.arrivalTime!, durationMinutes: stay.durationMinutes! } : { checkOut: stay.checkOut! }) } : {}) };
}
export function availabilityParams(stay: StaySearch | null) {
  return new URLSearchParams(Object.entries(normalizedStay(stay)).map(([key, value]) => [key, String(value)]));
}
