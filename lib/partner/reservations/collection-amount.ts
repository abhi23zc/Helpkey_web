/** Exact rupee entry conversion. Never round fractional paise or use float multiplication. */
export function parseCollectionPaise(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const amount = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
}
export function initialCollection(
  amount: number | undefined,
  legacyPaid: boolean,
  total: number,
) {
  if (!Number.isSafeInteger(total) || total < 0)
    throw new Error("INVALID_INITIAL_COLLECTION");
  const value = amount ?? (legacyPaid ? total : 0);
  if (!Number.isSafeInteger(value) || value < 0 || value > total)
    throw new Error("INVALID_INITIAL_COLLECTION");
  return value;
}
