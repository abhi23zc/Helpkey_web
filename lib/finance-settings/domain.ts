import { z } from "zod";
import { offeringCategories } from "@/lib/stay/contracts";

export const MAX_MONEY_PAISE = 1_000_000_000; // ₹1 crore
const money = z.number().int("Use rupees with no more than two decimal places.").min(0, "Money cannot be negative.").max(MAX_MONEY_PAISE, "Money cannot exceed ₹1 crore.");
const days = z.number().int("Enter a whole number of days.").min(0, "Days cannot be negative.").max(365, "Days cannot exceed 365.");
export const fields = {
  commissionBasisPoints: z.number().int("Use no more than two decimal places.").min(0, "Commission must be between 0% and 100%.").max(10_000, "Commission must be between 0% and 100%."),
  commissionBasis: z.enum(["rooms", "rooms_and_extras"]),
  eligibleExtraCategories: z.array(z.enum(offeringCategories)).min(1, "Select at least one extra category.").max(offeringCategories.length).refine(v => new Set(v).size === v.length, "Select each category only once."),
  marketplaceCommission: z.boolean(),
  directCommission: z.boolean(),
  walkInCommission: z.boolean(),
  guestPaymentOptions: z.array(z.enum(["full_online", "partial_advance", "at_hotel"])).min(1, "Select at least one guest payment option.").max(3).refine(v => new Set(v).size === v.length, "Select each payment option only once."),
  advance: z.discriminatedUnion("type", [
    z.object({ type: z.literal("fixed"), amountPaise: money.min(1, "Fixed advance must be at least ₹0.01.") }).strict(),
    z.object({ type: z.literal("percentage"), basisPoints: z.number().int("Use no more than two decimal places.").min(100, "Advance percentage must be between 1% and 100%.").max(10_000, "Advance percentage must be between 1% and 100%.") }).strict(),
  ]),
  payoutDelayDays: days,
  payoutCycle: z.enum(["daily", "weekly"]),
  payoutWeekday: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
  minimumPayoutPaise: money,
  duesLimit: z.discriminatedUnion("type", [
    z.object({ type: z.literal("unlimited") }).strict(),
    z.object({ type: z.literal("limited"), amountPaise: money }).strict(),
  ]),
  duesWarningPaise: money,
  duesGraceDays: days,
};
export const policySchema = z.object(fields).partial().strict();
export type Policy = z.infer<typeof policySchema>;
export type Field = keyof Policy;
export const fieldNames = Object.keys(fields) as Field[];
export const saveSchema = z.object({
  changes: policySchema,
  remove: z.array(z.enum(fieldNames as [Field, ...Field[]])).max(fieldNames.length),
  expectedRevision: z.number().int().nonnegative(),
  expectedGlobalRevision: z.number().int().nonnegative(),
  requestId: z.uuid(),
  reason: z.string().trim().min(3).max(500),
}).strict().superRefine((v, ctx) => {
  if (v.remove.some(key => key in v.changes)) ctx.addIssue({ code: "custom", path: ["remove"], message: "A setting cannot be changed and removed together." });
});
export type SaveInput = z.infer<typeof saveSchema>;
export function applyChanges(previous: Policy, input: Pick<SaveInput, "changes" | "remove">): Policy {
  const next = { ...previous, ...input.changes };
  for (const key of input.remove) delete next[key];
  return policySchema.parse(next);
}
export function resolvePolicy(global: Policy, overrides: Policy = {}) {
  const merged: Policy = { ...global, ...overrides };
  const effective = { ...merged };
  if (!merged.guestPaymentOptions?.includes("partial_advance")) delete effective.advance;
  if (merged.payoutCycle !== "weekly") delete effective.payoutWeekday;
  if (merged.commissionBasis !== "rooms_and_extras") delete effective.eligibleExtraCategories;
  return {
    effective,
    values: merged,
    provenance: Object.fromEntries(fieldNames.map(key => [key, key in overrides ? "overridden" : key in global ? "inherited" : "unconfigured"])) as Record<Field, "overridden" | "inherited" | "unconfigured">,
  };
}
/** Validate the combined policy, while allowing independent terms to remain unset. */
export function policyErrors(policy: Policy): string[] {
  const errors: string[] = [];
  if (policy.guestPaymentOptions?.includes("partial_advance") && !policy.advance) errors.push("Partial advance requires a fixed amount or percentage advance.");
  if (policy.payoutCycle === "weekly" && !policy.payoutWeekday) errors.push("Select a payout weekday for the weekly cycle.");
  if (policy.commissionBasis === "rooms_and_extras" && !policy.eligibleExtraCategories?.length) errors.push("Select at least one eligible extra category.");
  if (policy.duesLimit?.type === "limited" && policy.duesWarningPaise !== undefined && policy.duesWarningPaise > policy.duesLimit.amountPaise) errors.push("Dues warning threshold cannot exceed the dues limit.");
  return errors;
}
/** Preparation only: never imported by checkout or payment processing. */
export function cappedFixedAdvance(amountPaise: number, outstandingPaise: number) {
  return Math.min(amountPaise, Math.max(0, outstandingPaise));
}
export function canonical(value: unknown): string {
  if (value === undefined) return JSON.stringify("__unset__");
  if (Array.isArray(value)) return JSON.stringify(value.map(v => JSON.parse(canonical(v))).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  if (value && typeof value === "object") return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, JSON.parse(canonical(v))])));
  return JSON.stringify(value);
}
export type Workspace = ReturnType<typeof resolvePolicy> & {
  stored: Policy; global: Policy; revision: number; globalRevision: number; propertyId: string | null;
};
