import { z } from "zod";

export const categories = [
  "commissionTax",
  "statutory",
  "gatewayFees",
  "other",
] as const;
export const categoryLabels = {
  commissionTax: "Commission tax",
  statutory: "Statutory deductions",
  gatewayFees: "Gateway fees",
  other: "Other adjustments",
};
const item = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unknown") }).strict(),
  z
    .object({
      status: z.literal("amount"),
      amountPaise: z.number().int().min(0).max(1_000_000_000),
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      status: z.literal("not_applicable"),
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
]);
export const deductionsSchema = z
  .object({
    commissionTax: item,
    statutory: item,
    gatewayFees: item,
    other: item,
  })
  .strict();
export type Deductions = z.infer<typeof deductionsSchema>;
export type Assessment = {
  version: number;
  fingerprint: string;
  items: Deductions;
  actorId: string;
  assessedAt: string;
};
export const unknownDeductions = (): Deductions => ({
  commissionTax: { status: "unknown" },
  statutory: { status: "unknown" },
  gatewayFees: { status: "unknown" },
  other: { status: "unknown" },
});
export function deductionTotal(items: Deductions) {
  const parsed = deductionsSchema.parse(items);
  if (categories.some((k) => parsed[k].status === "unknown")) return null;
  return categories.reduce(
    (n, k) => n + (parsed[k].status === "amount" ? parsed[k].amountPaise : 0),
    0,
  );
}
