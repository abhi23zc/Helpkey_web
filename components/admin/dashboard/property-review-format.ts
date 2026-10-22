import { label } from "./types";

/** Pure display helpers for the admin property review page (no React, unit-tested). */

export const NOT_PROVIDED = "Not provided";

export function money(paise: unknown): string | null {
  if (typeof paise !== "number" || !Number.isFinite(paise)) return null;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);
}

export function formatDate(value: unknown): string {
  if (!value) return NOT_PROVIDED;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/** "14:00" -> "2:00 PM". Returns the input unchanged if it is not HH:mm. */
export function formatTime(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return value;
  const hours = Number(match[1]);
  return `${hours % 12 || 12}:${match[2]} ${hours >= 12 ? "PM" : "AM"}`;
}

export function hoursLabel(hours: number): string {
  if (hours === 1) return "1 hour";
  if (hours >= 48 && hours % 24 === 0) return `${hours / 24} days`;
  return `${hours} hours`;
}

const humanizeKey = (key: string) => label(key.replace(/([a-z0-9])([A-Z])/g, "$1 $2"));

/** Turns a free-form policy record ({ allowed: false, minAge: 5 }) into one readable line. */
export function policySummary(policy: unknown): string | null {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return null;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(policy as Record<string, unknown>)) {
    if (value === null || value === undefined || value === "") continue;
    if (key === "allowed" && typeof value === "boolean") parts.unshift(value ? "Allowed" : "Not allowed");
    else if (typeof value === "boolean") parts.push(`${humanizeKey(key)}: ${value ? "Yes" : "No"}`);
    else if (typeof value === "string" || typeof value === "number") parts.push(`${humanizeKey(key)}: ${value}`);
    else if (Array.isArray(value) && value.length && value.every(item => typeof item === "string")) parts.push(`${humanizeKey(key)}: ${value.map(item => label(item)).join(", ")}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

export function cancellationSummary(policy: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof policy.refundableUntilHours === "number") parts.push(`Refundable until ${hoursLabel(policy.refundableUntilHours)} before check-in`);
  if (typeof policy.cancellationFeePercent === "number" && policy.cancellationFeePercent > 0) parts.push(`${policy.cancellationFeePercent}% cancellation fee`);
  if (parts.length) return parts.join(" · ");
  return typeof policy.description === "string" && policy.description ? policy.description : NOT_PROVIDED;
}

export function addressLine(address: Record<string, unknown>): string {
  const text = (key: string) => (typeof address[key] === "string" ? (address[key] as string).trim() : "");
  const region = [text("city"), [text("state"), text("postalCode")].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [text("line1"), text("line2"), text("landmark"), region].filter(Boolean).join(", ");
}

export function bookingModesLabel(modes: unknown): string | null {
  return Array.isArray(modes) && modes.length ? modes.map(mode => label(String(mode))).join(" + ") : null;
}

/** Price shown for a rate plan, with the unit the guest is actually charged for. */
export function ratePrice(rate: Record<string, unknown>): string {
  if (rate.pricingModel === "duration" && Array.isArray(rate.durationPrices)) {
    return rate.durationPrices.map((row: { hours: number; pricePaise: number }) => `${money(row.pricePaise)} for ${row.hours} ${row.hours === 1 ? "hour" : "hours"}`).join(" · ") || NOT_PROVIDED;
  }
  if (rate.pricingModel === "per_hour") {
    const hourly = money(rate.hourlyPricePaise);
    return hourly ? `${hourly} / hour` : NOT_PROVIDED;
  }
  const base = money(rate.basePricePaise);
  if (!base) return NOT_PROVIDED;
  if (typeof rate.durationMinutes === "number" && rate.durationMinutes > 0) {
    const hours = rate.durationMinutes / 60;
    return `${base} for ${Number.isInteger(hours) ? `${hours}h` : `${rate.durationMinutes} min`}`;
  }
  return `${base} / night`;
}

/* ---------- Approval readiness ---------- */

export type ReadinessCheck = { key: string; label: string; complete: boolean };

const PHOTO_PREFIX = "Approved photos: ";
const DOCUMENT_NAMES: Record<string, string> = {
  pan: "PAN card",
  government_id_front: "Government ID (front)",
  government_id_back: "Government ID (back)",
};

/**
 * Splits the server's flat checklist into what an admin acts on:
 * photo gaps, document gaps, and anything else. Only incomplete items are returned.
 */
export function groupReadiness(checks: ReadinessCheck[]) {
  const missing = checks.filter(check => !check.complete);
  const photos = missing.filter(check => check.label.startsWith(PHOTO_PREFIX)).map(check => check.label.slice(PHOTO_PREFIX.length));
  const documents = missing.filter(check => check.key in DOCUMENT_NAMES).map(check => DOCUMENT_NAMES[check.key]);
  const other = missing.filter(check => !check.label.startsWith(PHOTO_PREFIX) && !(check.key in DOCUMENT_NAMES)).map(check => check.label);
  return { photos, documents, other, total: missing.length };
}

export const isAwaitingReview = (asset: { moderationStatus?: string; status?: string }) => (asset.moderationStatus ?? asset.status ?? "pending") === "pending";
