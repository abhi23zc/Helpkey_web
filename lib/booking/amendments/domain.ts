import { z } from "zod";
import { validDate, type Allocation } from "../domain";
import type { RecordData } from "@/lib/partner/dashboard/domain";

export const occupantSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    ageGroup: z.enum(["adult", "child", "infant"]),
  })
  .strict();
export const contactSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email(),
    phone: z.string().regex(/^\+91[6-9]\d{9}$/),
  })
  .strict();
export const guestSchema = z
  .object({
    occupants: z.array(occupantSchema).min(1).max(32),
    bookingContact: contactSchema,
  })
  .strict();
export const proposalSchema = guestSchema
  .extend({
    roomTypeId: z
      .string()
      .min(1)
      .max(180)
      .refine((v) => !v.includes("/")),
    ratePlanId: z
      .string()
      .min(1)
      .max(180)
      .refine((v) => !v.includes("/")),
    checkIn: z.string().refine(validDate),
    checkOut: z.string().refine(validDate).optional(),
    arrivalTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    durationMinutes: z
      .number()
      .int()
      .min(60)
      .max(1440)
      .multipleOf(60)
      .optional(),
    adults: z.number().int().min(1).max(12),
    children: z.number().int().min(0).max(10),
    infants: z.number().int().min(0).max(10),
  })
  .strict();
export type Proposal = z.infer<typeof proposalSchema>;
export type Breakdown = {
  subtotalPaise: number;
  taxPaise: number;
  taxBasisPoints: number;
  customerFeePaise: number;
  totalPaise: number;
};
export type EditPolicy = {
  version: 1;
  cutoffHours: number;
  paymentMode: string;
  depositBasisPoints: number;
  originalRatePlanId: string;
  equivalentRatePlanIds: string[];
  cancellationDeadline: string | null;
  cancellationExpired: boolean;
  accepted: Breakdown;
  originalHoldExpiresAt: string | null;
};
/**
 * The customer editing policy is saved on newly-created online bookings.  Older
 * online bookings do not have that snapshot yet, so they are allowed to
 * initialise one on their first edit request.  Keep this deliberately about
 * the booking model, rather than a property switch: all supported hotels use
 * the same behaviour.
 */
export function canInitializeEditPolicy(b: RecordData) {
  return (
    b.source !== "manual_partner" &&
    b.inventoryEngine === "interval_v1" &&
    typeof b.propertyId === "string" &&
    typeof b.ratePlan?.id === "string" &&
    typeof b.roomType?.id === "string" &&
    typeof b.startAt === "string" &&
    typeof b.paymentMode === "string" &&
    Number.isSafeInteger(b.depositBasisPoints) &&
    Number.isSafeInteger(b.subtotalPaise) &&
    Number.isSafeInteger(b.taxPaise) &&
    Number.isSafeInteger(b.roomTotalPaise ?? b.totalPaise)
  );
}
export function customerEditingAvailable(b: RecordData) {
  return b.editPolicy?.version === 1 || canInitializeEditPolicy(b);
}
export function breakdown(b: RecordData): Breakdown {
  const r = {
    subtotalPaise: b.subtotalPaise,
    taxPaise: b.taxPaise,
    taxBasisPoints: b.taxBasisPoints ?? 0,
    customerFeePaise: b.customerFeePaise ?? 0,
    totalPaise: b.roomTotalPaise ?? b.totalPaise,
  };
  if (
    Object.values(r).some((v) => !Number.isSafeInteger(v) || v < 0) ||
    r.subtotalPaise + r.taxPaise + r.customerFeePaise !== r.totalPaise
  )
    throw new Error("FINANCIAL_EVIDENCE_INCOMPLETE");
  return r;
}
export function snapshotPolicy(
  b: RecordData,
  property: RecordData,
  rate: RecordData,
  holdExpiry: string | null,
): EditPolicy {
  const hours = property.customerEditing?.cutoffHours ?? 0;
  if (!Number.isInteger(hours) || hours < 0 || hours > 8760)
    throw new Error("INVALID_EDIT_POLICY");
  const cancellationDeadline = b.cancellationPolicy
    ? new Date(
        Date.parse(b.startAt) -
          Number(b.cancellationPolicy.refundableUntilHours ?? 0) * 3600000,
      ).toISOString()
    : null;
  return {
    version: 1,
    cutoffHours: hours,
    paymentMode: b.paymentMode,
    depositBasisPoints: b.depositBasisPoints,
    originalRatePlanId: b.ratePlan.id,
    equivalentRatePlanIds: Array.isArray(rate.equivalentRatePlanIds)
      ? rate.equivalentRatePlanIds
          .filter(
            (v: unknown): v is string =>
              typeof v === "string" && !v.includes("/"),
          )
          .slice(0, 100)
      : [],
    cancellationDeadline,
    cancellationExpired:
      cancellationDeadline !== null &&
      Date.parse(cancellationDeadline) <= Date.now(),
    accepted: breakdown(b),
    originalHoldExpiresAt: holdExpiry,
  };
}
export function editBlocker(
  b: RecordData,
  now: number,
  namesOnly = false,
): string | null {
  const p = b.editPolicy as EditPolicy | undefined;
  if (
    p?.version !== 1 ||
    b.source === "manual_partner" ||
    b.inventoryEngine !== "interval_v1"
  )
    return "HOTEL_ASSISTANCE_REQUIRED";
  if (
    !["confirmed", "pending_payment"].includes(b.bookingStatus) ||
    b.actualCheckInAt ||
    b.checkInRecordedAt ||
    b.inventoryReleased
  )
    return "EDITING_CLOSED";
  if (
    !Number.isFinite(Date.parse(b.startAt)) ||
    now >= Date.parse(b.startAt) - (namesOnly ? 0 : p.cutoffHours * 3600000)
  )
    return "EDITING_CLOSED";
  if (
    b.bookingStatus === "pending_payment" &&
    !(b.expiresAt?.toMillis?.() > now)
  )
    return "HOLD_EXPIRED";
  if (
    !namesOnly &&
    b.totalPaise !== undefined &&
    ((b.roomTotalPaise ?? b.totalPaise) !== p.accepted.totalPaise ||
      b.subtotalPaise !== p.accepted.subtotalPaise ||
      b.taxPaise !== p.accepted.taxPaise)
  )
    return "FINANCIAL_EVIDENCE_INCOMPLETE";
  if (
    !namesOnly &&
    (b.couponId || b.couponDiscountPaise || b.negotiatedPriceReason)
  )
    return "HOTEL_ASSISTANCE_REQUIRED";
  if (
    b.refundDuePaise ||
    b.orderReconciliationRequired ||
    b.paymentReplacementUnresolved
  )
    return "PAYMENT_UNRESOLVED";
  return null;
}
export function acceptPrice(published: Breakdown, previous: Breakdown) {
  if (published.totalPaise >= previous.totalPaise)
    return { accepted: published, retainedDifferencePaise: 0 };
  if (published.taxBasisPoints !== previous.taxBasisPoints)
    throw new Error("TAX_TREATMENT_REQUIRES_ASSISTANCE");
  return {
    accepted: previous,
    retainedDifferencePaise: previous.totalPaise - published.totalPaise,
  };
}
export function requiredAdvance(
  total: number,
  policy: Pick<EditPolicy, "paymentMode" | "depositBasisPoints">,
) {
  if (policy.paymentMode === "pay_at_property") return 0;
  return policy.paymentMode === "deposit"
    ? Number(
        (BigInt(total) * BigInt(policy.depositBasisPoints) + BigInt(5000)) /
          BigInt(10000),
      )
    : total;
}
export function cancellationDeadline(
  policy: EditPolicy,
  startAt: string,
  cancellation: RecordData | null,
  now: number,
) {
  const proposed = cancellation
    ? Date.parse(startAt) -
      Number(cancellation.refundableUntilHours ?? 0) * 3600000
    : null;
  const old = policy.cancellationDeadline
    ? Date.parse(policy.cancellationDeadline)
    : null;
  const next =
    old === null ? proposed : proposed === null ? old : Math.min(old, proposed);
  return {
    cancellationDeadline: next === null ? null : new Date(next).toISOString(),
    cancellationExpired:
      policy.cancellationExpired ||
      (old !== null && now >= old) ||
      (next !== null && now >= next),
  };
}
export function validateOccupants(
  p: Pick<Proposal, "occupants" | "adults" | "children" | "infants">,
) {
  for (const [group, count] of [
    ["adult", p.adults],
    ["child", p.children],
    ["infant", p.infants],
  ] as const)
    if (p.occupants.filter((o) => o.ageGroup === group).length !== count)
      throw new Error("GUEST_COUNT_MISMATCH");
}
/** Inventory set difference, shared by staff previews and customer reservations. */
export function allocationDifference(
  proposed: Allocation[],
  original: Allocation[],
  sameCategory: boolean,
): Allocation[] {
  const originalKeys = new Set(
    sameCategory
      ? original.flatMap((a) => a.intervals.map((k) => `${a.date}:${k}`))
      : [],
  );
  return proposed
    .map((a) => ({
      date: a.date,
      intervals: a.intervals.filter((k) => !originalKeys.has(`${a.date}:${k}`)),
    }))
    .filter((a) => a.intervals.length > 0);
}
export function guestPatch(b: RecordData, guests: z.infer<typeof guestSchema>) {
  const names = guests.occupants
    .filter((o) => o.ageGroup === "adult")
    .map((o) => o.name);
  const sameNames =
    JSON.stringify(names) === JSON.stringify(b.leadGuest?.adultGuestNames);
  return {
    occupants: guests.occupants,
    registrationVersion: 1,
    bookingContact: guests.bookingContact,
    leadGuest: {
      ...b.leadGuest,
      email: guests.bookingContact.email.toLowerCase(),
      phone: guests.bookingContact.phone,
      name: names[0],
      adultGuestNames: names,
      ...(sameNames ? {} : { adultAadhaarLastFour: null }),
    },
    registrationIncomplete: false,
  };
}

export function guestSearchTokens(
  b: RecordData,
  guests: z.infer<typeof guestSchema>,
  roomName: string,
) {
  return [
    ...new Set(
      [
        b.confirmationCode,
        b.propertyName,
        roomName,
        ...guests.occupants.map((o) => o.name),
        guests.bookingContact.name,
        guests.bookingContact.email,
        guests.bookingContact.phone,
      ]
        .flatMap((v) =>
          String(v ?? "")
            .toLowerCase()
            .trim()
            .split(/\s+/),
        )
        .filter(Boolean),
    ),
  ].slice(0, 40);
}
