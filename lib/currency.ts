/**
 * Currency helpers for the Helpkey platform.
 *
 * The platform stores all monetary values as integer **paise** (1 rupee = 100
 * paise) in the default currency **INR**, per the database spec. These helpers
 * are the single source of truth for turning those integers into user-facing
 * strings, so currency formatting is never hardcoded in components.
 */

export const DEFAULT_CURRENCY = "INR" as const;

export type CurrencyCode = "INR";

const FORMATTERS = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: CurrencyCode, fractionDigits: number) {
  const key = `${currency}:${fractionDigits}`;
  let formatter = FORMATTERS.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    FORMATTERS.set(key, formatter);
  }
  return formatter;
}

type FormatOptions = {
  currency?: CurrencyCode;
  /** Show paise (e.g. ₹1,234.50). Defaults to false for whole-rupee display. */
  withFractions?: boolean;
};

/**
 * Formats an integer paise amount as a localized INR string.
 *
 * @example formatPaise(4825000) // "₹48,250"
 * @example formatPaise(71250, { withFractions: true }) // "₹712.50"
 */
export function formatPaise(
  paise: number | null | undefined,
  { currency = DEFAULT_CURRENCY, withFractions = false }: FormatOptions = {},
): string {
  const safePaise = Number.isFinite(paise) ? (paise as number) : 0;
  const rupees = safePaise / 100;
  return getFormatter(currency, withFractions ? 2 : 0).format(rupees);
}

/**
 * Formats a rupee amount (not paise) as a localized INR string.
 *
 * @example formatRupees(495) // "₹495"
 */
export function formatRupees(
  rupees: number | null | undefined,
  options: FormatOptions = {},
): string {
  const safeRupees = Number.isFinite(rupees) ? (rupees as number) : 0;
  return formatPaise(Math.round(safeRupees * 100), options);
}

/** Converts a rupee amount to integer paise for persistence. */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}
