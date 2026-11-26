import { z } from "zod";
import {
  canonical,
  resolvePolicy,
  type Policy,
  type Field,
} from "../finance-settings/domain";
export const bankSchema = z
  .object({
    holderName: z
      .string()
      .trim()
      .min(2, "Enter the account holder name (at least 2 characters).")
      .max(160),
    accountNumber: z
      .string()
      .regex(/^\d{6,24}$/, "Use 6–24 digits, preserving leading zeroes."),
    confirmation: z.string(),
    ifsc: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter an 11-character IFSC."),
    bankName: z
      .string()
      .trim()
      .min(2, "Enter the bank name (at least 2 characters).")
      .max(160),
  })
  .strict()
  .refine((v) => v.accountNumber === v.confirmation, {
    path: ["confirmation"],
    message: "Account numbers must match.",
  });
export type MaskedBank = {
  holderName: string;
  maskedAccount: string;
  ifsc: string;
  bankName: string;
  version: string;
};
export type Business = {
  source: "invoice" | "profile";
  country?: string | null;
  businessName: string;
  address: unknown;
  contact: string;
  registration: string | null;
  gstin: string | null;
  pan: string | null;
  state: string | null;
  stateCode: string | null;
};
export const commercialFields: Field[] = [
  "commissionBasisPoints",
  "commissionBasis",
  "eligibleExtraCategories",
  "marketplaceCommission",
  "directCommission",
  "walkInCommission",
  "payoutDelayDays",
  "minimumPayoutPaise",
  "payoutCycle",
  "payoutWeekday",
];
export function commercialTerms(global: Policy, local: Policy) {
  const resolved = resolvePolicy(global, local);
  const values = Object.fromEntries(
    commercialFields
      .filter((k) => resolved.effective[k] !== undefined)
      .map((k) => [
        k,
        { value: resolved.effective[k], source: resolved.provenance[k] },
      ]),
  );
  const required: Field[] = [
    "marketplaceCommission",
    "directCommission",
    "walkInCommission",
    "payoutDelayDays",
    "minimumPayoutPaise",
    "payoutCycle",
  ];
  if (
    [
      resolved.effective.marketplaceCommission,
      resolved.effective.directCommission,
      resolved.effective.walkInCommission,
    ].some(Boolean)
  )
    required.push("commissionBasisPoints", "commissionBasis");
  if (resolved.effective.commissionBasis === "rooms_and_extras")
    required.push("eligibleExtraCategories");
  if (resolved.effective.payoutCycle === "weekly")
    required.push("payoutWeekday");
  return {
    values,
    complete: required.every((k) => resolved.effective[k] !== undefined),
    fingerprintInput: canonical(values),
  };
}
export function businessComplete(b: Business) {
  const a = b.address;
  const address =
    typeof a === "string"
      ? a.trim().length >= 2
      : !!a &&
        typeof a === "object" &&
        ["line1", "city", "state", "postalCode"].every(
          (k) =>
            typeof (a as Record<string, unknown>)[k] === "string" &&
            String((a as Record<string, unknown>)[k]).trim().length >= 2,
        );
  return (
    b.businessName.trim().length >= 2 &&
    address &&
    !!b.contact.trim() &&
    (b.registration !== "registered" ||
      (!!b.gstin && !!b.stateCode && b.gstin.startsWith(b.stateCode)))
  );
}
export function readinessStatus(
  complete: Record<"business" | "bank" | "commercial", boolean>,
  reviewed: Record<"business" | "bank" | "commercial", boolean>,
) {
  const missing = (["business", "bank", "commercial"] as const).find(
    (k) => !complete[k],
  );
  const pending = (["bank", "business", "commercial"] as const).find(
    (k) => !reviewed[k],
  );
  return {
    status: missing
      ? "Setup incomplete"
      : pending
        ? "Needs admin review"
        : "Ready for payouts",
    next: missing ?? pending ?? null,
  };
}
export function requiresBankAcknowledgement(
  saved: MaskedBank | null | undefined,
  currentVersion: string,
) {
  return !saved || saved.version !== currentVersion;
}

export function businessAddressText(address: unknown): string {
  if (typeof address === "string") return address;
  if (!address || typeof address !== "object") return "";
  const value = address as Record<string, unknown>;
  return [
    "line1",
    "line2",
    "landmark",
    "city",
    "district",
    "state",
    "postalCode",
    "countryCode",
  ]
    .map((k) => value[k])
    .filter((v) => typeof v === "string" && v.trim())
    .join(", ");
}
