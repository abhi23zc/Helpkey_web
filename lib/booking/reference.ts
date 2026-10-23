import { randomInt } from "node:crypto";

const SIX_DIGIT_LIMIT = 1_000_000;

function firstThreeLetters(value: unknown) {
  if (typeof value !== "string") return null;
  const letters = value
    .normalize("NFKD")
    .toUpperCase();
  const asciiLetters = letters.replace(/[^A-Z]/g, "");
  // City labels are commonly written in full (for example, Kanpur) while
  // their compact display code drops vowels (KNP). Prefer that compact form
  // when it has three letters, while retaining a sensible fallback for names
  // with fewer than three consonants.
  const compactLetters = asciiLetters.replace(/[AEIOU]/g, "");
  return compactLetters.length >= 3 ? compactLetters.slice(0, 3) : asciiLetters.length >= 3 ? asciiLetters.slice(0, 3) : null;
}

/**
 * Formats the human-readable reference for a newly created booking. Historic
 * references are stored as-is and must never be passed through this formatter.
 */
export function formatBookingReference(city: unknown, propertySlug: unknown, suffix: number) {
  if (!Number.isInteger(suffix) || suffix < 0 || suffix >= SIX_DIGIT_LIMIT) throw new Error("INVALID_BOOKING_REFERENCE_SUFFIX");
  const cityCode = firstThreeLetters(city) ?? firstThreeLetters(propertySlug) ?? "HKY";
  return `${cityCode}${String(suffix).padStart(6, "0")}`;
}

export function generateBookingReference(city: unknown, propertySlug: unknown) {
  return formatBookingReference(city, propertySlug, randomInt(SIX_DIGIT_LIMIT));
}
