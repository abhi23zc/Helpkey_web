import { z } from "zod";

export const offeringCategories = [
  "room_essentials",
  "devices",
  "food_drinks",
  "celebrations",
  "room_preferences",
  "other",
] as const;
export const offeringCategoryLabels: Record<
  (typeof offeringCategories)[number],
  string
> = {
  room_essentials: "Room essentials",
  devices: "Devices & convenience",
  food_drinks: "Food & drinks",
  celebrations: "Celebrations",
  room_preferences: "Room preferences",
  other: "Other extras",
};
export function offeringCategory(
  offering: Pick<OfferingInput, "category" | "kind">,
) {
  return (
    offering.category ??
    (offering.kind === "preference" ? "room_preferences" : "other")
  );
}

export const travelerCategories = [
  "Family",
  "Couple",
  "Business",
  "Solo",
] as const;
export const travelerPreferencesSchema = z
  .array(z.enum(travelerCategories))
  .max(4)
  .refine((v) => new Set(v).size === v.length, "Choose each preference once.");
const id = z
  .string()
  .min(1)
  .max(180)
  .regex(/^[^/]+$/);
export const selectionSchema = z
  .object({
    offeringId: id,
    variantId: id.nullable().default(null),
    quantity: z.number().int().min(1).max(100),
  })
  .strict();
export const selectionsSchema = z
  .array(selectionSchema)
  .max(30)
  .refine(
    (v) =>
      new Set(v.map((s) => JSON.stringify([s.offeringId, s.variantId])))
        .size === v.length,
    "Duplicate selection.",
  );
export const offeringSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().min(3).max(1500),
    kind: z.enum(["item", "service", "preference"]),
    category: z.enum(offeringCategories).optional(),
    travelerCategories: travelerPreferencesSchema.default([]),
    roomTypeIds: z.array(id).max(100).default([]),
    bookingModes: z
      .array(z.enum(["overnight", "hourly"]))
      .min(1)
      .max(2),
    unitPricePaise: z.number().int().min(0).max(100000000),
    maxQuantity: z.number().int().min(1).max(100),
    advanceNoticeMinutes: z.number().int().min(0).max(525600),
    confirmation: z.enum(["immediate", "approval"]),
    variants: z
      .array(
        z
          .object({
            id,
            name: z.string().trim().min(1).max(80),
            unitPricePaise: z
              .number()
              .int()
              .min(0)
              .max(100000000)
              .nullable()
              .optional(),
          })
          .strict(),
      )
      .max(20)
      .default([]),
    status: z.enum(["active", "paused"]),
  })
  .strict()
  .refine(
    (v) =>
      v.kind !== "preference" ||
      (v.unitPricePaise === 0 &&
        v.confirmation === "approval" &&
        v.variants.every((variant) => !variant.unitPricePaise)),
    "Room preferences must be free and require hotel approval.",
  )
  .refine(
    (v) => new Set(v.variants.map((s) => s.id)).size === v.variants.length,
    "Variant identifiers must be unique.",
  );
export type OfferingInput = z.infer<typeof offeringSchema>;
export type Offering = OfferingInput & {
  id: string;
  propertyId: string;
  version: number;
};
export type Selection = z.infer<typeof selectionSchema>;
export type TravelerCategory = (typeof travelerCategories)[number];
export type RequestStatus =
  | "requested"
  | "confirmed"
  | "preparing"
  | "ready"
  | "fulfilled"
  | "declined"
  | "cancelled";
export type StayRequest = {
  id: string;
  offeringId: string;
  offeringVersion: number;
  name: string;
  description: string;
  kind: OfferingInput["kind"];
  variantId: string | null;
  variantName: string | null;
  quantity: number;
  unitPricePaise: number;
  totalPaise: number;
  maxQuantity: number;
  confirmation: OfferingInput["confirmation"];
  deadlineAt: string;
  cancellationPolicy: unknown;
  status: RequestStatus;
  preparationStarted: boolean;
  response: string | null;
  updatedAt: string;
};
export type PreCheckin = {
  status: "incomplete" | "submitted";
  expectedArrivalAt: string | null;
  notes: string;
  submittedAt: string | null;
};
export type StayBookingData = {
  travelerPreferences: TravelerCategory[];
  customizations: StayRequest[];
  stayRevision: number;
  preCheckin: PreCheckin;
  guestNames: string[];
};
export const statusLabels: Record<RequestStatus, string> = {
  requested: "Awaiting hotel confirmation",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  fulfilled: "Fulfilled",
  declined: "Declined",
  cancelled: "Cancelled",
};
