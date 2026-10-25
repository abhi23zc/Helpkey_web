import { z } from "zod";
import { selectionsSchema, travelerPreferencesSchema } from "@/lib/stay/contracts";
import { validDate } from "./domain";
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const bookingInput = z.object({
  customizationSelections: selectionsSchema.optional().default([]),
  travelerPreferences: travelerPreferencesSchema.optional().default([]),
  propertySlug: z.string().min(1).max(180),
  roomTypeId: z.string().min(1),
  ratePlanId: z.string().min(1),
  checkIn: z.string().regex(isoDate).refine(validDate, "INVALID_DATE"),
  checkOut: z.preprocess((value) => value === "" ? undefined : value, z.string().regex(isoDate).refine(validDate, "INVALID_DATE").optional()),
  bookingMode: z.enum(["overnight", "hourly"]).default("overnight"),
  arrivalTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  durationMinutes: z.number().int().min(60).max(1440).multipleOf(60).optional(),
  adults: z.number().int().min(1).max(12),
  children: z.number().int().min(0).max(10).default(0),
  infants: z.number().int().min(0).max(10).default(0),
});

export const createBookingInput = bookingInput.extend({
  expectedTotalPaise: z.number().int().nonnegative().optional(),
  quoteFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  paymentMethod: z.enum(["online", "pay_at_property"]),
  leadEmail: z.string().trim().email(),
  leadPhone: z.string().regex(/^\+91[6-9]\d{9}$/),
  adultGuestNames: z.array(z.string().trim().min(2).max(120)).min(1).max(12),
  // Do not accept or persist full Aadhaar numbers in a booking record. The
  // checkout validates locally and submits only the final four digits.
  adultAadhaarLastFour: z.array(z.string().regex(/^\d{4}$/)).min(1).max(12).optional(),
  bookingContact: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email(),
    phone: z.string().regex(/^\+91[6-9]\d{9}$/),
  }).optional(),
  specialRequest: z.string().trim().max(1000).optional().default(""),
  billing: z.object({ legalName: z.string().trim().min(2).max(160), gstin: z.string().trim().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/), address: z.object({ line1: z.string().trim().min(3).max(180), city: z.string().trim().min(2).max(100), state: z.string().trim().min(2).max(100), postalCode: z.string().regex(/^\d{6}$/) }) }).nullable().default(null),
  // Older checkout tabs can remain open through a deployment. Treat their
  // already-rendered confirmation action as consent rather than rejecting a
  // valid reservation with an opaque 422; current UI still requires the box.
  termsAccepted: z.boolean().optional().default(true),
});

export const paymentVerificationInput = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

