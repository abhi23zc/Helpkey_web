import { z } from "zod";

export const offeringCategories = [
  "comfort",
  "bathroom",
  "food_drinks",
  "celebrations",
  "family",
  "business",
  "technology",
  "room_preferences",
  "housekeeping",
  "transport",
  "wellness",
  "experiences",
  "groups",
  "pets",
  "other",
] as const;
const legacyCategories = ["room_essentials", "devices"] as const;
export const offeringCategoryLabels: Record<string, string> = {
  comfort: "Comfort & bedding",
  bathroom: "Bathroom & personal care",
  food_drinks: "Food & drinks",
  celebrations: "Celebrations & romance",
  family: "Family & kids",
  business: "Business & productivity",
  technology: "Technology & connectivity",
  room_preferences: "Room preferences & atmosphere",
  housekeeping: "Housekeeping & laundry",
  transport: "Transport & arrival",
  wellness: "Wellness & accessibility",
  experiences: "Experiences & activities",
  groups: "Villa & group services",
  pets: "Pet-related requests",
  other: "Other / special request",
  room_essentials: "Comfort & bedding",
  devices: "Technology & connectivity",
};
export const offeringCategoryIcons: Record<string, string> = {
  comfort: "🛏",
  bathroom: "🛁",
  food_drinks: "🍰",
  celebrations: "🎉",
  family: "🧸",
  business: "💼",
  technology: "🔌",
  room_preferences: "🤫",
  housekeeping: "🧺",
  transport: "🚗",
  wellness: "💆",
  experiences: "✨",
  groups: "👥",
  pets: "🐾",
  other: "🛎",
  room_essentials: "🛏",
  devices: "🔌",
};
export function offeringCategory(
  offering: Pick<OfferingInput, "category" | "kind">,
) {
  const category = offering.category;
  return category === "room_essentials"
    ? "comfort"
    : category === "devices"
      ? "technology"
      : (category ??
        (offering.kind === "preference" ? "room_preferences" : "other"));
}
export const travelerCategories = [
  "Business",
  "Couple",
  "Family",
  "Friends / Group",
  "Solo",
  "Special occasion",
  "Other",
] as const;
export const travelerLabels: Record<string, string> = {
  Solo: "Solo / Traveller",
};
// Legacy bookings can contain several preferences. Keep the array contract.
export const travelerPreferencesSchema = z
  .array(z.enum(travelerCategories))
  .max(7)
  .refine((v) => new Set(v).size === v.length, "Choose each preference once.");
export const formTypes = [
  "simple",
  "choice",
  "quantity",
  "variants",
  "package",
  "scheduled",
  "text",
  "custom",
] as const;
export const formTypeLabels: Record<(typeof formTypes)[number], string> = {
  simple: "Free Request",
  choice: "Single Choice (e.g. Style, Aroma)",
  quantity: "Per-Item Count",
  variants: "Options & Flavors",
  package: "Curated Package",
  scheduled: "Scheduled Service (Date & Time)",
  text: "Guest Note Request",
  custom: "Custom Hotel Quote",
};
export const pricingUnits = [
  "item",
  "night",
  "person",
  "stay",
  "hour",
  "package",
] as const;
export const guestInputsSchema = z
  .object({
    people: z.number().int().min(1).max(22).optional(),
    serviceAt: z.string().datetime({ offset: true }).optional(),
    hours: z.number().int().min(1).max(744).optional(),
    note: z.string().trim().max(500).optional(),
    choices: z.record(z.string().max(80), z.string().max(100)).optional(),
  })
  .strict();
export const unlistedRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    note: z.string().trim().max(500),
    neededAt: z.string().datetime({ offset: true }),
  })
  .strict();
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
    inputs: guestInputsSchema.optional(),
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
    category: z.enum([...offeringCategories, ...legacyCategories]).optional(),
    formType: z.enum(formTypes).optional(),
    responseConfig: z.object({ responseType: z.enum(["yes_no", "single", "multiple", "text"]), quantityEnabled: z.boolean() }).strict().optional(),
    pricingUnit: z.enum(pricingUnits).optional(),
    imageId: z.string().uuid().nullable().optional(),
    noteLabel: z.string().trim().max(100).optional(),
    noteRequired: z.boolean().optional(),
    peopleRequired: z.boolean().optional(),
    timeRequired: z.boolean().optional(),
    includedAmenityCode: z.string().trim().max(80).nullable().optional(),
    amenityRelationship: z
      .enum(["additional", "upgrade", "included"])
      .optional(),
    choiceGroups: z
      .array(
        z
          .object({
            id,
            name: z.string().trim().min(1).max(80),
            required: z.boolean(),
            options: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
          })
          .strict(),
      )
      .max(5)
      .optional(),
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
            inclusions: z.string().trim().max(500).optional(),
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
      v.responseConfig || !["choice", "variants", "package"].includes(v.formType ?? "") ||
      v.variants.length > 0,
    "Add at least one priced choice or package.",
  )
  .refine(
    (v) =>
      v.responseConfig || !["simple", "text", "custom"].includes(v.formType ?? "") ||
      (v.maxQuantity === 1 && v.variants.length === 0),
    "Simple and text requests must have a limit of one and no variants.",
  )
  .refine(
    (v) => !!v.responseConfig || v.formType !== "choice" || v.maxQuantity === 1,
    "Choose-one offerings must have a limit of one per booking.",
  )
  .refine(
    (v) => v.formType !== "custom" || v.confirmation === "approval",
    "Custom requests require hotel approval.",
  )
  .refine(
    (v) =>
      new Set((v.choiceGroups ?? []).map((g) => g.id)).size ===
      (v.choiceGroups ?? []).length,
    "Choice groups must have unique identifiers.",
  )
  .refine(
    (v) => new Set(v.variants.map((s) => s.id)).size === v.variants.length,
    "Variant identifiers must be unique.",
  )
  .superRefine((v, ctx) => {
    const config = v.responseConfig;
    if (!config) return;
    const choices = ["single", "multiple"].includes(config.responseType);
    if (choices ? !v.variants.length : v.variants.length > 0) ctx.addIssue({ code: "custom", path: ["variants"], message: choices ? "Add at least one option guests can choose." : "Remove options before saving a yes/no or text response." });
    if (!config.quantityEnabled && config.responseType !== "multiple" && v.maxQuantity !== 1) ctx.addIssue({ code: "custom", path: ["maxQuantity"], message: "This response allows one request per booking." });
    if (!config.quantityEnabled && config.responseType === "multiple" && v.maxQuantity > v.variants.length) ctx.addIssue({ code: "custom", path: ["maxQuantity"], message: "The choice limit cannot exceed the number of options." });
    const names = v.variants.map(option => option.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) ctx.addIssue({ code: "custom", path: ["variants"], message: "Give each option a different name." });
  });
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
export type RequestQuote = {
  version: number;
  amountPaise: number;
  scope: string;
  conditions: string;
  expiresAt: string;
  status: "offered" | "accepted" | "declined" | "withdrawn";
  acceptedAt?: string;
  orderId?: string;
  paymentId?: string;
  paymentStatus?: "awaiting_payment" | "paid" | "refund_pending" | "refunded";
};
export type RequestRules = Pick<OfferingInput, "formType" | "responseConfig" | "maxQuantity" | "noteRequired" | "noteLabel" | "peopleRequired" | "timeRequired" | "choiceGroups">;
export type StayRequest = {
  requestRules?: RequestRules;
  agreementVersion?: 2;
  priceOnRequest?: boolean;
  source?: "catalog" | "unlisted";
  pricingUnit?: (typeof pricingUnits)[number];
  billableQuantity?: number;
  inputs?: z.infer<typeof guestInputsSchema>;
  choiceLabels?: Record<string, string>;
  quote?: RequestQuote | null;
  settlement?:
    | "included"
    | "pending_hotel"
    | "awaiting_customer"
    | "awaiting_payment"
    | "paid";

  id: string;
  offeringId: string;
  offeringVersion: number;
  name: string;
  description: string;
  kind: OfferingInput["kind"];
  variantId: string | null;
  variantName: string | null;
  variantInclusions?: string | null;
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
export type ArrivalDraft = {
  arrivalChoice?: "time" | "unknown" | null;
  expectedArrivalAt: string | null;
  notes: string;
};
export type PreCheckin = {
  arrivalChoice?: "time" | "unknown" | null;
  guestsConfirmedAt?: string | null;
  draft?: ArrivalDraft | null;
  status: "incomplete" | "submitted";
  expectedArrivalAt: string | null;
  notes: string;
  submittedAt: string | null;
};
export type StayPaymentReceipt = {
  requestId: string;
  quoteVersion: number;
  paymentId: string;
  orderId: string;
  amountPaise: number;
  status: "paid" | "refund_pending" | "refunded";
  scope: string;
};
export type StayBookingData = {
  stayPaymentReceipts?: StayPaymentReceipt[];
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
