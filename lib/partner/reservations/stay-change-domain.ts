import { z } from "zod";
import {
  validDate,
  evaluateStayRules as evaluateStay,
  localParts,
  resolveLocal,
} from "@/lib/booking/domain";
import type { RecordData } from "@/lib/partner/dashboard/domain";
const id = z
  .string()
  .min(1)
  .max(180)
  .refine((v) => !v.includes("/"));
const adjustment = z.number().int().min(-100_000_000).max(100_000_000);
export const stayChangeInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("move"), unitId: id }).strict(),
  z
    .object({
      action: z.literal("category"),
      unitId: id,
      settlement: z.enum(["complimentary", "charge", "credit"]),
      adjustmentPaise: adjustment,
      reductionSourceId: z.string().max(200).optional(),
      originalChargeLineId: z.string().min(1).max(1800).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("extend"),
      ratePlanId: id.optional(),
      departureDate: z.string().refine(validDate).optional(),
      additionalMinutes: z
        .number()
        .int()
        .min(60)
        .max(1440)
        .multipleOf(60)
        .optional(),
      negotiatedPaise: z.number().int().min(0).max(100_000_000).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("early_departure"),
      departure: z.union([z.literal("now"), z.iso.datetime({ offset: true })]),
      settlement: z.enum(["retain", "reduce"]),
      adjustmentPaise: adjustment,
      reductionSourceId: z.string().max(200).optional(),
      originalChargeLineId: z.string().min(1).max(1800).optional(),
    })
    .strict(),
]);
export type StayChangeInput = z.infer<typeof stayChangeInput>;
export const actionPermission = {
  move: "reservation.assign",
  category: "reservation.category",
  extend: "reservation.extend",
  early_departure: "reservation.early_departure",
} as const;
export function explicitAdjustment(input: StayChangeInput) {
  if (input.action === "category") {
    if (
      input.settlement === "complimentary"
        ? input.adjustmentPaise !== 0
        : input.settlement === "charge"
          ? input.adjustmentPaise <= 0
          : input.adjustmentPaise >= 0
    )
      throw new Error("INVALID_SETTLEMENT");
    return input.adjustmentPaise;
  }
  if (input.action === "early_departure") {
    if (
      input.settlement === "retain"
        ? input.adjustmentPaise !== 0
        : input.adjustmentPaise >= 0
    )
      throw new Error("INVALID_SETTLEMENT");
    return input.adjustmentPaise;
  }
  return 0;
}
export function extensionQuote(
  b: RecordData,
  p: RecordData,
  room: RecordData,
  rate: RecordData,
  input: Extract<StayChangeInput, { action: "extend" }>,
  now: number,
) {
  const timezone = b.timezone,
    old = localParts(Date.parse(b.endAt), timezone);
  const hourly = b.bookingMode === "hourly";
  if (
    hourly
      ? !input.additionalMinutes || !!input.departureDate
      : !input.departureDate || !!input.additionalMinutes
  )
    throw new Error("INVALID_EXTENSION");
  const q = evaluateStay(
    {
      bookingMode: hourly ? "hourly" : "overnight",
      checkIn: old.date,
      checkOut: input.departureDate,
      arrivalTime: old.time,
      durationMinutes: input.additionalMinutes,
      adults: b.adults ?? 1,
      children: b.children ?? 0,
      infants: b.infants ?? 0,
    },
    { ...p, timezone },
    room,
    {
      ...rate,
      taxBasisPoints: 0,
      customerFeePaise: 0,
      stayRules: {
        ...rate.stayRules,
        minimumNights: 1,
        minimumAdvanceMinutes: 0,
      },
    },
    now,
    undefined,
    true,
  );
  const end = hourly
    ? Date.parse(b.endAt) + input.additionalMinutes! * 60000
    : resolveLocal(
        input.departureDate!,
        p.checkOutTime || b.departureTime || "11:00",
        timezone,
      );
  const duration = (end - Date.parse(b.startAt)) / 60000;
  const nights =
    (Date.parse(localParts(end, timezone).date) - Date.parse(b.checkIn)) /
    86400000;
  if (
    end <= Math.max(now, Date.parse(b.endAt)) ||
    (hourly
      ? duration >
        Math.min(rate.stayRules?.maximumDurationMinutes || 1440, 1440)
      : nights > Math.min(rate.stayRules?.maximumNights || 30, 30))
  )
    throw new Error("STAY_LENGTH_NOT_ALLOWED");
  // Validate the entire hourly operating window, including an original cross-midnight arrival.
  if (hourly) {
    const start = localParts(Date.parse(b.startAt), timezone);
    const validationRate = {
      ...rate,
      durationPrices: [{ hours: duration / 60, pricePaise: 1 }],
      datePrices: {},
      stayRules: { ...rate.stayRules, minimumDurationMinutes: 60 },
    };
    if (Number.isInteger(duration / 60))
      evaluateStay(
        {
          bookingMode: "hourly",
          checkIn: start.date,
          arrivalTime: start.time,
          durationMinutes: duration,
          adults: b.adults ?? 1,
          children: b.children ?? 0,
          infants: b.infants ?? 0,
        },
        { ...p, timezone },
        room,
        validationRate,
        now,
        undefined,
        true,
      );
    else throw new Error("WHOLE_HOUR_DURATION_REQUIRED");
  }
  return {
    endAt: new Date(end).toISOString(),
    price: q,
    adjustmentPaise: input.negotiatedPaise ?? q.subtotalPaise,
  };
}
