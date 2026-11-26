import { categories, categoryLabels, type Deductions } from "./deductions";
export type DeductionDraft = Record<
  (typeof categories)[number],
  {
    choice: "unknown" | "amount" | "zero" | "not_applicable";
    amount: string;
    reason: string;
  }
>;
export function deductionDraft(items: Deductions): DeductionDraft {
  return Object.fromEntries(
    categories.map((k) => {
      const item = items[k];
      return [
        k,
        {
          choice:
            item.status === "amount"
              ? item.amountPaise === 0
                ? "zero"
                : "amount"
              : item.status,
          amount:
            item.status === "amount" && item.amountPaise > 0
              ? String(item.amountPaise / 100)
              : "",
          reason: item.status === "unknown" ? "" : item.reason,
        },
      ];
    }),
  ) as DeductionDraft;
}
export function parseDeductionAmount(raw: string) {
  const value = raw.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw Error(
      "Enter a valid rupee amount with up to two decimal places. Blank amounts are not zero.",
    );
  const [whole, fraction = ""] = value.split(".");
  const paise = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  if (paise > BigInt(1_000_000_000))
    throw Error("A deduction cannot exceed ₹1 crore.");
  return Number(paise);
}
export function draftDeductionTotal(draft: DeductionDraft): number | null {
  try {
    if (categories.some((k) => draft[k].choice === "unknown")) return null;
    return categories.reduce(
      (n, k) =>
        n +
        (draft[k].choice === "amount"
          ? parseDeductionAmount(draft[k].amount)
          : 0),
      0,
    );
  } catch {
    return null;
  }
}
export function assessmentFromDraft(
  draft: DeductionDraft,
  grossPaise: number,
): Deductions {
  const items = Object.fromEntries(
    categories.map((k) => {
      const item = draft[k],
        reason = item.reason.trim();
      if (item.choice === "unknown")
        throw Error(`Review ${categoryLabels[k].toLowerCase()} before saving.`);
      if (reason.length < 3 || reason.length > 500)
        throw Error(
          `Add a reason of 3–500 characters for ${categoryLabels[k].toLowerCase()}.`,
        );
      return [
        k,
        item.choice === "not_applicable"
          ? { status: "not_applicable", reason }
          : {
              status: "amount",
              amountPaise:
                item.choice === "zero" ? 0 : parseDeductionAmount(item.amount),
              reason,
            },
      ];
    }),
  ) as Deductions;
  const total = draftDeductionTotal(draft)!;
  if (total >= grossPaise)
    throw Error("Deductions must leave a positive hotel payment.");
  return items;
}
