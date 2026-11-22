import { z } from "zod";
import { validDate } from "@/lib/booking/domain";
import { gstinSchema, panSchema } from "./identity";
const bps = z.number().int().min(0).max(10_000);
const money = z.number().int().min(0).max(100_000_000_000);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const zone = z
  .string()
  .max(100)
  .refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Invalid timezone");
export const scheduleSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("daily"), localTime: time, timezone: zone })
    .strict(),
  z
    .object({
      kind: z.literal("weekdays"),
      weekdays: z
        .array(z.number().int().min(0).max(6))
        .min(1)
        .max(7)
        .refine((v) => new Set(v).size === v.length),
      localTime: time,
      timezone: zone,
    })
    .strict(),
  z
    .object({
      kind: z.literal("interval"),
      everyDays: z.number().int().positive().max(365),
      anchorDate: z.string().refine(validDate, "Use a valid local date"),
      localTime: time,
      timezone: zone,
    })
    .strict(),
]);
export const policySchema = z
  .object({
    roomCommissionBps: bps,
    extrasCommissionBps: bps,
    directBookingCommissionBps: bps,
    paymentOptions: z
      .array(z.enum(["full_online", "advance_online", "pay_at_property"]))
      .min(1)
      .max(3)
      .refine((v) => new Set(v).size === v.length),
    advance: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("percentage"), basisPoints: bps }).strict(),
      z.object({ kind: z.literal("fixed"), amountPaise: money }).strict(),
    ]),
    providerCharges: z.enum(["helpkey", "hotel"]),
    payoutSchedule: scheduleSchema,
    payoutWaitHours: z.number().int().min(0).max(8760),
    minimumPayoutPaise: money,
    dues: z.object({ limitPaise: money, warningBps: bps }).strict(),
    priceEntry: z.enum(["tax_exclusive", "tax_inclusive"]),
    approval: z.literal("founder_required"),
  })
  .strict();
export type FinancePolicy = z.infer<typeof policySchema>;
export const overrideSchema = policySchema.partial().strict();
export type FinanceOverrides = z.infer<typeof overrideSchema>;
export const policyKeys = Object.keys(
  policySchema.shape,
) as (keyof FinancePolicy)[];
export const DEFAULT_POLICY: FinancePolicy = {
  roomCommissionBps: 1000,
  extrasCommissionBps: 0,
  directBookingCommissionBps: 0,
  paymentOptions: ["full_online"],
  advance: { kind: "percentage", basisPoints: 2500 },
  providerCharges: "helpkey",
  payoutSchedule: {
    kind: "weekdays",
    weekdays: [1],
    localTime: "10:00",
    timezone: "Asia/Kolkata",
  },
  payoutWaitHours: 48,
  minimumPayoutPaise: 0,
  dues: { limitPaise: 200_000, warningBps: 8000 },
  priceEntry: "tax_exclusive",
  approval: "founder_required",
};
export function resolvePolicy(
  global: FinancePolicy,
  overrides: FinanceOverrides,
) {
  return {
    effective: policySchema.parse({ ...global, ...overrides }),
    sources: Object.fromEntries(
      policyKeys.map((k) => [
        k,
        Object.hasOwn(overrides, k) ? "hotel" : "global",
      ]),
    ) as Record<keyof FinancePolicy, "hotel" | "global">,
  };
}
const draftText = z.string().trim().max(1000);
export const profileSchema = z
  .object({
    legalPayeeName: draftText,
    entityType: z.enum([
      "individual",
      "proprietorship",
      "partnership",
      "company",
      "trust",
      "other",
    ]),
    businessAddress: draftText,
    businessEmail: z.union([z.literal(""), z.email()]),
    businessPhone: z.string().trim().max(30),
    pan: z.union([z.literal(""), panSchema]),
    gstStatus: z.enum(["unregistered", "registered", "composition", "exempt"]),
    gstin: z.union([z.literal(""), gstinSchema]),
    operatingRelationship: z.enum(["owner", "lessee", "operator", "franchise"]),
    documentIds: z
      .array(
        z
          .string()
          .min(1)
          .max(200)
          .regex(/^[^/]+$/),
      )
      .max(30)
      .refine((v) => new Set(v).size === v.length),
  })
  .strict()
  .superRefine((v, c) => {
    if (["unregistered", "exempt"].includes(v.gstStatus) && v.gstin)
      c.addIssue({
        code: "custom",
        path: ["gstin"],
        message: "GSTIN must be empty for this registration status",
      });
    if (v.gstin && v.pan && v.gstin.slice(2, 12) !== v.pan)
      c.addIssue({
        code: "custom",
        path: ["gstin"],
        message: "GSTIN must match PAN",
      });
  });
export type FinanceProfile = z.infer<typeof profileSchema>;
export const EMPTY_PROFILE: FinanceProfile = {
  legalPayeeName: "",
  entityType: "individual",
  businessAddress: "",
  businessEmail: "",
  businessPhone: "",
  pan: "",
  gstStatus: "unregistered",
  gstin: "",
  operatingRelationship: "owner",
  documentIds: [],
};
export type SupportingDocument = {
  id: string;
  propertyId: unknown;
  deletedAt?: unknown;
  status?: unknown;
};
export function supportingDocumentsValid(
  profile: FinanceProfile,
  propertyId: string,
  documents: SupportingDocument[],
) {
  const available = new Set(
    documents
      .filter(
        (d) =>
          d.propertyId === propertyId && !d.deletedAt && d.status !== "rejected",
      )
      .map((d) => d.id),
  );
  return (
    profile.documentIds.length > 0 &&
    profile.documentIds.every((id) => available.has(id))
  );
}
export function profileReadiness(
  p: FinanceProfile,
  accepted: boolean,
  reviewed = false,
  documentsValid = p.documentIds.length > 0,
) {
  const business = !!(
    p.legalPayeeName &&
    p.businessAddress &&
    p.businessEmail &&
    p.businessPhone &&
    p.pan &&
    (!["registered", "composition"].includes(p.gstStatus) || p.gstin)
  );
  return {
    businessDetails: business,
    documents: documentsValid,
    manualReview: reviewed && business && documentsValid,
    agreementAcceptance: accepted,
    providerVerification: "not_started" as const,
    payoutsEnabled: false as const,
    canSubmit: business && documentsValid,
  };
}
export function maskTaxIdentifiers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskTaxIdentifiers);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        ["pan", "gstin"].includes(k) && typeof v === "string" && v
          ? `••••${v.slice(-4)}`
          : maskTaxIdentifiers(v),
      ]),
    );
  return value;
}
export const revisionSchema = z.number().int().nonnegative();
const base = {
  expectedRevision: revisionSchema,
  mutationId: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/),
  reason: z.string().trim().min(3).max(1000),
};
export const commandSchema = z.discriminatedUnion("action", [
  z
    .object({ ...base, action: z.literal("global"), policy: policySchema })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("overrides"),
      globalRevision: revisionSchema,
      overrides: overrideSchema,
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("profile"),
      profile: profileSchema,
      submit: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("review"),
      decision: z.enum(["changes_requested", "manually_reviewed"]),
      notes: z.string().trim().min(3).max(3000),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("publish"),
      title: z.string().trim().min(1).max(200),
      documentUrl: z
        .url()
        .refine((v) => new URL(v).protocol === "https:", "HTTPS is required"),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("accept"),
      agreementVersion: z.number().int().positive(),
    })
    .strict(),
]);
export type FinanceCommand = z.infer<typeof commandSchema>;
