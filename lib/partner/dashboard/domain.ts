import { rangeDays } from "@/lib/partner/date-range";
import { localParts, resolveLocal, validDate } from "@/lib/booking/domain";
import { eligiblePricing } from "@/lib/booking/duration-pricing";
import {
  photoRequirements,
  type PhotoRequirementAsset,
  type PhotoRequirementRoom,
} from "@/lib/partner/photo-requirements";

export type Range = "daily" | "weekly" | "monthly";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RecordData = Record<string, any>; // Firestore compatibility at the serialization boundary.
export const amount = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value)
    ? Math.max(0, value)
    : 0;
export function instant(value: unknown): number | null {
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  )
    return value.toMillis();
  return null;
}
export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function reportBuckets(date: string, range: Range) {
  if (!validDate(date)) throw new Error("INVALID_DATE");
  const label = (key: string) =>
    new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${key}T12:00Z`));
  if (range === "daily")
    return Array.from({ length: 7 }, (_, i) => {
      const key = addDays(date, i - 6);
      return { key, label: label(key), start: key, end: key };
    });
  if (range === "weekly") {
    const monday = addDays(
      date,
      -((new Date(`${date}T12:00Z`).getUTCDay() + 6) % 7),
    );
    return Array.from({ length: 8 }, (_, i) => {
      const key = addDays(monday, (i - 7) * 7);
      return {
        key,
        label: label(key),
        start: key,
        end: i === 7 ? date : addDays(key, 6),
      };
    });
  }
  const selected = new Date(`${date.slice(0, 7)}-01T12:00Z`);
  return Array.from({ length: 12 }, (_, i) => {
    const value = new Date(
      Date.UTC(
        selected.getUTCFullYear(),
        selected.getUTCMonth() + i - 11,
        1,
        12,
      ),
    );
    const key = value.toISOString().slice(0, 10);
    return {
      key,
      label: new Intl.DateTimeFormat("en-IN", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }).format(value),
      start: key,
      end:
        i === 11
          ? date
          : new Date(
              Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0, 12),
            )
              .toISOString()
              .slice(0, 10),
    };
  });
}
export function selectedBuckets(from: string, to: string, grouping: Range) {
  const dates = rangeDays(from, to);
  const buckets: ReturnType<typeof reportBuckets> = [];
  for (const date of dates) {
    const group =
      grouping === "monthly"
        ? date.slice(0, 7)
        : grouping === "weekly"
          ? addDays(date, -((new Date(`${date}T12:00Z`).getUTCDay() + 6) % 7))
          : date;
    const last = buckets.at(-1);
    if (last?.key === group) last.end = date;
    else
      buckets.push({
        key: group,
        label: new Intl.DateTimeFormat("en-IN", {
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        }).format(new Date(`${date}T12:00Z`)),
        start: date,
        end: date,
      });
  }
  return buckets;
}
export const liveProperty = (p: RecordData) =>
  p.status === "active" &&
  p.approvalStatus === "approved" &&
  p.isBookable === true;
export function readiness(
  property: RecordData,
  rooms: RecordData[],
  rates: RecordData[],
  media: RecordData[],
  documents: RecordData[],
) {
  const active = rooms.filter((r) => r.status === "active");
  const photos = photoRequirements(
    media.filter(
      (m) => m.moderationStatus === "approved",
    ) as PhotoRequirementAsset[],
    active as PhotoRequirementRoom[],
    property.coverMediaId,
  );
  const checks = [
    {
      key: "details",
      label: "Property name, description and contact",
      complete: Boolean(
        property.name &&
        property.description &&
        property.publicPhone &&
        property.publicEmail,
      ),
      href: "/partner/listing",
    },
    {
      key: "location",
      label: "Address and timezone",
      complete: Boolean(
        property.address?.city && property.address?.line1 && property.timezone,
      ),
      href: "/partner/listing",
    },
    {
      key: "rooms",
      label: "Active rooms with sellable capacity",
      complete: active.some((r) => amount(r.totalInventory) > 0),
      href: "/partner/rooms",
    },
    ...active.map((r) => ({
      key: `rate_${r.id}`,
      label: `Active rate and cancellation policy: ${r.name}`,
      complete: rates.some(
        (rate) =>
          rate.roomTypeId === r.id &&
          rate.status === "active" &&
          rate.cancellationPolicyId &&
          eligiblePricing(rate),
      ),
      href: "/partner/rooms",
    })),
    ...photos.checks.map((c) => ({ ...c, href: "/partner/listing" })),
    ...["pan", "government_id_front", "government_id_back"].map((kind) => ({
      key: kind,
      label: `Approved ${kind.replaceAll("_", " ")}`,
      complete: documents.some(
        (d) => d.documentType === kind && d.status === "approved",
      ),
      href: "/partner/onboarding",
    })),
  ];
  return {
    checks,
    completed: checks.filter((c) => c.complete).length,
    total: checks.length,
    percentage: Math.round(
      (checks.filter((c) => c.complete).length / checks.length) * 100,
    ),
  };
}
export const activeStay = (b: RecordData) =>
  ["confirmed", "checked_in"].includes(b.bookingStatus);
export function actionableRequest(b: RecordData) {
  return (
    activeStay(b) &&
    (b.customizations ?? []).some(
      (r: RecordData) =>
        ["requested", "confirmed", "preparing", "ready"].includes(r.status) &&
        !["awaiting_customer", "awaiting_payment"].includes(r.settlement ?? ""),
    )
  );
}
export function bookingStart(b: RecordData, timezone: string) {
  return instant(b.startAt) ?? resolveLocal(b.checkIn, "14:00", timezone);
}
export function bookingEnd(b: RecordData, timezone: string) {
  return instant(b.endAt) ?? resolveLocal(b.checkOut, "11:00", timezone);
}
export function operationMatches(
  b: RecordData,
  view: string,
  date: string,
  timezone: string,
  now: number,
) {
  switch (view) {
    case "arrivals":
      return (
        b.checkIn === date &&
        ["confirmed", "checked_in", "checked_out", "completed"].includes(
          b.bookingStatus,
        )
      );
    case "departures":
      return (
        b.checkOut === date &&
        ["confirmed", "checked_in", "checked_out", "completed"].includes(
          b.bookingStatus,
        )
      );
    case "in_house":
      return (
        b.bookingStatus === "checked_in" &&
        b.checkIn <= date &&
        b.checkOut >= date
      );
    case "requests":
      return actionableRequest(b) && b.checkIn <= date && b.checkOut >= date;
    case "overdue_departures":
      return b.bookingStatus === "checked_in" && bookingEnd(b, timezone) < now;
    case "overdue":
      return b.bookingStatus === "confirmed" && bookingStart(b, timezone) < now;
    case "balances":
      return (
        activeStay(b) &&
        amount(b.balanceDuePaise) > 0 &&
        b.checkIn <= date &&
        b.checkOut >= date
      );
    case "upcoming":
      return activeStay(b) && b.checkIn >= date;
    default:
      return true;
  }
}
export function financialSeries(
  buckets: ReturnType<typeof reportBuckets>,
  bookings: RecordData[],
  attempts: RecordData[],
  refunds: RecordData[],
  timezone: string,
  propertyLedger: RecordData[] = [],
) {
  const seen = new Set<string>();
  const payments = attempts.filter((p) => {
    const id = p.paymentId ?? p.id;
    if (seen.has(id)) return false;
    seen.add(id);
    return ["captured", "refund_pending", "refunded"].includes(p.status);
  });
  // Legacy/manual payments have a recorded booking paidAt but no provider attempt.
  const originalBookings = new Set(
    payments.filter((p) => !p.stayQuote).map((p) => p.bookingId),
  );
  for (const b of bookings)
    if (
      !originalBookings.has(b.id) &&
      amount(b.paidPaise - (b.propertyLedgerPaise ?? 0)) &&
      instant(
        "originalPropertyPaidAt" in b ? b.originalPropertyPaidAt : b.paidAt,
      ) !== null
    )
      payments.push({
        id: `legacy_${b.id}`,
        amountPaise: b.paidPaise - (b.propertyLedgerPaise ?? 0),
        createdAt:
          "originalPropertyPaidAt" in b ? b.originalPropertyPaidAt : b.paidAt,
        method: b.paymentStatus === "paid_at_property" ? "property" : "online",
        stayQuote: false,
      });
  const inside = (value: unknown, start: string, end: string) => {
    const ms = instant(value);
    if (ms === null) return false;
    const key = localParts(ms, timezone).date;
    return key >= start && key <= end;
  };
  return buckets.map((bucket) => {
    const sales = bookings.filter(
      (b) =>
        !["cancelled", "expired", "payment_failed", "no_show"].includes(
          b.bookingStatus,
        ) && inside(b.createdAt, bucket.start, bucket.end),
    );
    const paid = payments.filter((p) =>
      inside(p.createdAt, bucket.start, bucket.end),
    );
    const bookedPaise = sales.reduce(
      (sum, b) =>
        sum +
        Math.max(0, amount(b.totalPaise) - amount(b.customizationCreditPaise)),
      0,
    );
    const ledger = propertyLedger.filter((p) =>
      inside(p.createdAt, bucket.start, bucket.end),
    );
    const propertyPaise = ledger.reduce(
      (s, p) =>
        s +
        (p.type === "collection"
          ? amount(p.amountPaise)
          : p.type === "reversal"
            ? -amount(p.amountPaise)
            : 0),
      0,
    );
    const paidPaise =
      paid.reduce((sum, p) => sum + amount(p.amountPaise), 0) + propertyPaise;
    const refundedPaise =
      refunds
        .filter(
          (r) =>
            r.status === "processed" &&
            inside(r.processedAt, bucket.start, bucket.end),
        )
        .reduce((sum, r) => sum + amount(r.amountPaise), 0) +
      ledger
        .filter((p) => p.type === "refund")
        .reduce((s, p) => s + amount(p.amountPaise), 0);
    return {
      ...bucket,
      bookedPaise,
      paidPaise,
      refundedPaise,
      netPaise: paidPaise - refundedPaise,
      propertyCollectedPaise:
        paid
          .filter((p) => p.method === "property")
          .reduce((s, p) => s + amount(p.amountPaise), 0) + propertyPaise,
      serviceCollectedPaise: paid
        .filter((p) => p.stayQuote)
        .reduce((s, p) => s + amount(p.amountPaise), 0),
      bookingCount: sales.length,
    };
  });
}
export type Overview = Awaited<
  ReturnType<typeof import("./service").loadOverview>
>;
