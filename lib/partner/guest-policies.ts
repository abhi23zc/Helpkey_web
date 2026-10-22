import { z } from "zod";

const choice = z.boolean().nullable().optional();
export const guestPolicyFields = {
  childrenPolicy: z.object({ allowed: choice }).strict().optional(),
  petPolicy: z.object({ allowed: choice }).strict().optional(),
  smokingPolicy: z.object({ allowed: choice }).strict().optional(),
  identityRequirements: z.object({ governmentIdRequired: choice }).strict().optional(),
  minimumCheckInAge: z.number().int().min(18).max(100).nullable().optional(),
  additionalHouseRules: z.string().trim().max(2000).nullable().optional(),
};
export const guestPoliciesSchema = z.object(guestPolicyFields).strict();
export type GuestPolicies = z.infer<typeof guestPoliciesSchema>;

/** Explicit public allowlist; malformed legacy values remain unspecified. */
export function publicGuestPolicies(value: Record<string, unknown>): GuestPolicies {
  const allowed = (raw: unknown, key: string) => raw && typeof raw === "object" && key in raw && typeof (raw as Record<string, unknown>)[key] === "boolean" ? (raw as Record<string, boolean>)[key] : null;
  return {
    childrenPolicy: { allowed: allowed(value.childrenPolicy, "allowed") },
    petPolicy: { allowed: allowed(value.petPolicy, "allowed") },
    smokingPolicy: { allowed: allowed(value.smokingPolicy, "allowed") },
    identityRequirements: { governmentIdRequired: allowed(value.identityRequirements, "governmentIdRequired") },
    minimumCheckInAge: typeof value.minimumCheckInAge === "number" && Number.isInteger(value.minimumCheckInAge) && value.minimumCheckInAge >= 18 && value.minimumCheckInAge <= 100 ? value.minimumCheckInAge : null,
    additionalHouseRules: typeof value.additionalHouseRules === "string" ? value.additionalHouseRules.trim().slice(0, 2000) : null,
  };
}
