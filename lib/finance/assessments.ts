import { z } from "zod";
import { percentage } from "./calculation";
import { money } from "./ledger";
import { validDate } from "@/lib/booking/domain";
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
export const deductionRuleSchema = z.object({
  id, version: z.number().int().positive(), title: z.string().trim().min(3).max(200), legalReference: z.string().trim().min(3).max(2000), synthetic: z.boolean(),
  category: z.enum(["room", "extra", "service", "customer_fee", "commission"]), recognitionEvent: z.enum(["checkout", "fulfilment", "retention"]),
  base: z.enum(["taxable", "gross", "commission"]), outcome: z.enum(["assess", "not_applicable"]), calculation: z.discriminatedUnion("kind", [z.object({ kind: z.literal("percentage"), basisPoints: z.number().int().min(0).max(10000) }).strict(), z.object({ kind: z.literal("fixed"), amountPaise: z.number().int().nonnegative().safe() }).strict()]),
  rounding: z.literal("half_up_paise"), effectiveFrom: z.string().refine(validDate), effectiveThrough: z.string().refine(validDate),
  applicability: z.object({ jurisdictions: z.array(id).min(1), registrations: z.array(id).min(1), propertyIds: z.array(id), legalParticipant: z.enum(["hotel_pan", "helpkey"]) }).strict(),
  threshold: z.object({ amountPaise: z.number().int().nonnegative().safe(), period: z.enum(["calendar_year", "indian_financial_year"]), aggregation: z.enum(["participant", "property"]), treatment: z.enum(["excess", "whole"]), timezone: z.string().refine(v => { try { new Intl.DateTimeFormat("en", { timeZone: v }); return true; } catch { return false; } }) }).strict().nullable(),
  correction: z.enum(["reverse_saved", "no_reversal"]),
}).strict().refine(v => v.effectiveThrough >= v.effectiveFrom, "Invalid effective dates");
export type DeductionRule = z.infer<typeof deductionRuleSchema>;
export function assessmentPreview(rule: DeductionRule, basePaise: number, counterBeforePaise = 0) {
  deductionRuleSchema.parse(rule); money(basePaise); money(counterBeforePaise);
  const counterAfterPaise = money(basePaise + counterBeforePaise);
  const threshold = rule.threshold;
  const qualifyingBasePaise = !threshold ? basePaise : threshold.treatment === "excess" ? Math.max(0, counterAfterPaise - threshold.amountPaise) - Math.max(0, counterBeforePaise - threshold.amountPaise) : counterAfterPaise > threshold.amountPaise ? (counterBeforePaise <= threshold.amountPaise ? counterAfterPaise : basePaise) : 0;
  const amountPaise = rule.outcome === "not_applicable" || !qualifyingBasePaise ? 0 : rule.calculation.kind === "percentage" ? percentage(qualifyingBasePaise, rule.calculation.basisPoints) : rule.calculation.amountPaise;
  return { basePaise, counterBeforePaise, counterAfterPaise, qualifyingBasePaise, amountPaise, outcome: rule.outcome, correction: rule.correction };
}
export function counterPeriod(rule: DeductionRule, instant: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: rule.threshold?.timezone ?? "Asia/Kolkata", year: "numeric", month: "2-digit" }).formatToParts(new Date(instant));
  const year = Number(parts.find(p => p.type === "year")!.value), month = Number(parts.find(p => p.type === "month")!.value);
  return String(rule.threshold?.period === "indian_financial_year" && month < 4 ? year - 1 : year);
}
