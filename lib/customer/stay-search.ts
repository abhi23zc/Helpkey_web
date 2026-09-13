import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The shareable customer-search contract used between search, hotel, and checkout. */
export const staySearchSchema = z.object({
  checkIn: date.optional(),
  checkOut: date.optional(),
  adults: z.coerce.number().int().min(1).max(12).default(2),
  children: z.coerce.number().int().min(0).max(10).default(0),
  infants: z.coerce.number().int().min(0).max(10).default(0),
}).superRefine((value, context) => {
  if (Boolean(value.checkIn) !== Boolean(value.checkOut)) context.addIssue({ code: "custom", message: "DATES_MUST_BE_PAIRED" });
  if (value.checkIn && value.checkOut && value.checkOut <= value.checkIn) context.addIssue({ code: "custom", message: "CHECK_OUT_MUST_FOLLOW_CHECK_IN" });
});

export type StaySearch = z.infer<typeof staySearchSchema>;

export function staySearchFromParams(params: URLSearchParams): StaySearch | null {
  const parsed = staySearchSchema.safeParse({
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
  for (const key of ["checkIn", "checkOut", "adults", "children", "infants"] as const) {
    const value = stay[key];
    if (value === undefined || value === "") next.delete(key);
    else next.set(key, String(value));
  }
  return next;
}

export function formatStayDate(value?: string) {
  if (!value) return "Add dates";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}
