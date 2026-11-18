import { z } from "zod";
import { validDate } from "@/lib/booking/domain";
export const money = z.number().int().safe().min(0).max(100_000_000);
export const shiftCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), openingPaise: money }).strict(),
  z
    .object({
      action: z.literal("close"),
      shiftId: z.string().regex(/^[a-f0-9]{64}$/),
      revision: z.number().int().nonnegative(),
      countedPaise: money,
      reason: z.string().trim().max(1000),
    })
    .strict(),
]);
export const dayCommand = z
  .object({
    date: z.string().refine(validDate),
    version: z.string().regex(/^[a-f0-9]{64}$/),
    note: z.string().trim().max(2000),
    acknowledge: z.boolean(),
  })
  .strict();
export type CashSource = {
  id: string;
  type: string;
  amountPaise: number;
  cashEffectPaise: number;
  shiftId: string;
};
export function cashTotals(rows: CashSource[]) {
  let collectedPaise = 0,
    returnedPaise = 0,
    correctionsPaise = 0;
  for (const r of rows) {
    if (
      !Number.isSafeInteger(r.amountPaise) ||
      r.amountPaise <= 0 ||
      !Number.isSafeInteger(r.cashEffectPaise)
    )
      throw new Error("Invalid cash source");
    if (r.type === "collection" && r.cashEffectPaise === r.amountPaise)
      collectedPaise += r.amountPaise;
    else if (r.type === "refund" && r.cashEffectPaise === -r.amountPaise)
      returnedPaise += r.amountPaise;
    else if (
      r.type === "reversal" &&
      [-r.amountPaise, 0].includes(r.cashEffectPaise)
    ) {
      correctionsPaise += r.amountPaise;
      collectedPaise += r.cashEffectPaise;
    } else throw new Error("Inconsistent cash source");
  }
  if (
    ![collectedPaise, returnedPaise, correctionsPaise].every(
      Number.isSafeInteger,
    )
  )
    throw new Error("Unsafe cash total");
  return {
    collectedPaise,
    returnedPaise,
    correctionsPaise,
    sourceCount: rows.length,
  };
}
export function closingFlags() {
  // Kept in API responses for compatibility; availability is no longer an
  // environment setting. Role permissions still authorize every operation.
  return { shifts: true, daily: true };
}
