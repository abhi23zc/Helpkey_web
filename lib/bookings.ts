import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { resolvePublicImage } from "@/lib/media-resolver";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const HOLD_TTL_MS = 10 * 60_000;
const cancellableStatuses = new Set(["pending_payment", "confirmed"]);
const releaseStatuses = new Set(["pending_payment", "confirmed"]);

export const bookingInput = z.object({
  propertySlug: z.string().min(1).max(180),
  roomTypeId: z.string().min(1),
  ratePlanId: z.string().min(1),
  checkIn: z.string().regex(isoDate),
  checkOut: z.string().regex(isoDate),
  adults: z.number().int().min(1).max(12),
  children: z.number().int().min(0).max(10).default(0),
  infants: z.number().int().min(0).max(10).default(0),
});

export const createBookingInput = bookingInput.extend({
  paymentMethod: z.enum(["online", "pay_at_property"]),
  leadEmail: z.string().trim().email(),
  leadPhone: z.string().regex(/^\+91[6-9]\d{9}$/),
  adultGuestNames: z.array(z.string().trim().min(2).max(120)).min(1).max(12),
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

type BookingInput = z.infer<typeof bookingInput>;
type CreateBookingInput = z.infer<typeof createBookingInput>;

function dateRange(checkIn: string, checkOut: string) {
  const out: string[] = [];
  for (let value = new Date(`${checkIn}T00:00:00Z`), end = new Date(`${checkOut}T00:00:00Z`); value < end; value = new Date(value.getTime() + 86400000)) {
    out.push(value.toISOString().slice(0, 10));
  }
  return out;
}

function paise(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asIso(value: unknown) {
  return typeof (value as { toDate?: unknown })?.toDate === "function" ? (value as { toDate: () => Date }).toDate().toISOString() : null;
}

function inventoryRef(propertyId: string, roomTypeId: string, day: string) {
  return adminDb.collection("roomNightInventory").doc(`${propertyId}_${roomTypeId}_${day}`);
}

function safeCompare(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function propertyCover(propertyData: FirebaseFirestore.DocumentData) {
  if (typeof propertyData.coverMediaId !== "string" || !propertyData.coverMediaId) return { id: null, checksum: null, url: null };
  const media = await adminDb.collection("mediaAssets").doc(propertyData.coverMediaId).get();
  const data = media.data();
  if (!media.exists || !data || (data.moderationStatus ?? data.status) !== "approved") return { id: null, checksum: null, url: null };
  const resolved = await resolvePublicImage(media.id, data, typeof data.altText === "string" ? data.altText : "");
  return { id: media.id, checksum: typeof data.checksum === "string" ? data.checksum : null, url: resolved?.imageUrl ?? null };
}

export function bookingError(error: unknown) {
  if (error instanceof z.ZodError) {
    const field = error.issues[0]?.path.join(".");
    return field ? `Please check ${field.replaceAll(".", " ")} and try again.` : "Please review your booking details and try again.";
  }
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    CHECK_IN_IN_PAST: "Choose a future check-in date.",
    CHECK_OUT_MUST_FOLLOW_CHECK_IN: "Check-out must be after check-in.",
    PROPERTY_NOT_AVAILABLE: "This stay is not available right now.",
    ROOM_NOT_AVAILABLE: "This room is not available right now.",
    RATE_NOT_AVAILABLE: "This rate is not available right now.",
    ROOM_CAPACITY_EXCEEDED: "The selected room cannot host this many guests.",
    STAY_LENGTH_NOT_ALLOWED: "The selected rate does not allow this stay length.",
    SOLD_OUT_FOR_DATES: "This room is sold out for the selected dates.",
    ADULT_GUEST_NAMES_REQUIRED: "Add the name of every adult guest.",
    PAYMENT_METHOD_NOT_AVAILABLE: "This payment method is not available for the selected rate.",
    ONLINE_PAYMENT_NOT_CONFIGURED: "Online payment is not configured yet. Choose a pay-at-property rate.",
    PAYMENT_ORDER_CREATION_FAILED: "Unable to start secure payment. Please try again.",
    BOOKING_NOT_FOUND: "Booking not found.",
    BOOKING_NOT_CANCELLABLE: "This booking cannot be cancelled from here.",
    PAYMENT_NOT_EXPECTED: "Payment is not expected for this booking.",
    PAYMENT_SIGNATURE_INVALID: "Payment could not be verified.",
    WEBHOOK_NOT_CONFIGURED: "Payment webhook is not configured.",
    WEBHOOK_SIGNATURE_INVALID: "Payment webhook signature is invalid.",
    CRON_UNAUTHORIZED: "Unauthorized cleanup request.",
  };
  return messages[code] ?? "Unable to process this booking. Please try again.";
}

export async function quote(input: BookingInput) {
  if (input.checkIn < new Date().toISOString().slice(0, 10)) throw new Error("CHECK_IN_IN_PAST");
  if (input.checkOut <= input.checkIn) throw new Error("CHECK_OUT_MUST_FOLLOW_CHECK_IN");

  const property = (await adminDb.collection("properties").where("slug", "==", input.propertySlug).limit(1).get()).docs[0];
  const propertyData = property?.data();
  if (!property || propertyData?.status !== "active" || propertyData?.approvalStatus !== "approved" || propertyData?.isBookable !== true) throw new Error("PROPERTY_NOT_AVAILABLE");

  const [room, rate] = await Promise.all([
    adminDb.collection("roomTypes").doc(input.roomTypeId).get(),
    adminDb.collection("ratePlans").doc(input.ratePlanId).get(),
  ]);
  const roomData = room.data();
  const rateData = rate.data();
  if (!room.exists || roomData?.propertyId !== property.id || roomData.status !== "active") throw new Error("ROOM_NOT_AVAILABLE");
  if (!rate.exists || rateData?.propertyId !== property.id || rateData.roomTypeId !== room.id || rateData.status !== "active") throw new Error("RATE_NOT_AVAILABLE");
  if (input.adults > asNumber(roomData.maxAdults, 1) || input.children > asNumber(roomData.maxChildren, 0) || input.infants > asNumber(roomData.maxInfants, 10) || input.adults + input.children > asNumber(roomData.maxOccupancy, asNumber(roomData.maxAdults, 1) + asNumber(roomData.maxChildren, 0))) {
    throw new Error("ROOM_CAPACITY_EXCEEDED");
  }

  const nights = dateRange(input.checkIn, input.checkOut);
  const rules = rateData.stayRules ?? {};
  if (nights.length < asNumber(rules.minimumNights, 1) || (asNumber(rules.maximumNights, 0) > 0 && nights.length > asNumber(rules.maximumNights))) throw new Error("STAY_LENGTH_NOT_ALLOWED");

  const inventory = asNumber(roomData.totalInventory, 0);
  const inventoryDocs = await adminDb.getAll(...nights.map((day) => inventoryRef(property.id, room.id, day)));
  if (inventory <= 0 || inventoryDocs.some((doc) => asNumber(doc.data()?.reserved) >= inventory)) throw new Error("SOLD_OUT_FOR_DATES");

  const nightlyPricePaise = paise(rateData.basePricePaise);
  const subtotalPaise = nightlyPricePaise * nights.length;
  const taxBasisPoints = Math.max(0, Math.min(10000, Math.round(asNumber(rateData.taxBasisPoints))));
  const taxPaise = Math.round(subtotalPaise * taxBasisPoints / 10000);
  const customerFeePaise = paise(rateData.customerFeePaise);
  const totalPaise = subtotalPaise + taxPaise + customerFeePaise;
  const paymentMode = rateData.paymentMode === "pay_at_property" ? "pay_at_property" : rateData.paymentMode === "deposit" ? "deposit" : "full";
  const depositBasisPoints = Math.max(0, Math.min(10000, Math.round(asNumber(rateData.depositBasisPoints, paymentMode === "deposit" ? 2500 : 10000))));
  const payableNowPaise = paymentMode === "pay_at_property" ? 0 : paymentMode === "deposit" ? Math.round(totalPaise * depositBasisPoints / 10000) : totalPaise;

  const [cover, policy] = await Promise.all([propertyCover(propertyData ?? {}), rateData.cancellationPolicyId ? adminDb.collection("cancellationPolicies").doc(rateData.cancellationPolicyId).get() : Promise.resolve(null)]);
  const policyData = policy?.data();
  return {
    propertyId: property.id,
    propertySlug: input.propertySlug,
    propertyName: propertyData?.name ?? "Property",
    propertyCity: propertyData?.address?.city ?? propertyData?.city ?? null,
    propertyState: propertyData?.address?.state ?? propertyData?.state ?? null,
    propertyRatingAverage: typeof propertyData?.reviewSummary?.average === "number" && propertyData.reviewSummary.count > 0 ? propertyData.reviewSummary.average : typeof propertyData?.ratingAverage === "number" ? propertyData.ratingAverage : 0,
    propertyCoverImageUrl: cover.url,
    propertyCoverMediaId: cover.id,
    propertyCoverSourceChecksum: cover.checksum,
    checkInTime: propertyData?.checkInTime ?? "14:00",
    checkOutTime: propertyData?.checkOutTime ?? "11:00",
    currency: propertyData?.currency ?? "INR",
    roomType: { id: room.id, name: roomData.name ?? "Room" },
    ratePlan: { id: rate.id, name: rateData.name ?? "Standard", paymentMode, depositBasisPoints },
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights: nights.length,
    dates: nights,
    adults: input.adults,
    children: input.children,
    infants: input.infants,
    nightlyPricePaise,
    subtotalPaise,
    taxBasisPoints,
    taxPaise,
    customerFeePaise,
    totalPaise,
    payableNowPaise,
    cancellationPolicyId: rateData.cancellationPolicyId ?? null,
    cancellationPolicy: policyData ? { name: policyData.name ?? "Cancellation policy", description: policyData.description ?? "", refundableUntilHours: asNumber(policyData.refundableUntilHours), cancellationFeePercent: asNumber(policyData.cancellationFeePercent) } : null,
  };
}

async function holdInventoryAndCreateBooking(uid: string, input: CreateBookingInput, quoteData: Awaited<ReturnType<typeof quote>>) {
  const id = adminDb.collection("bookings").doc().id;
  const confirmationCode = `HK-${id.slice(0, 8).toUpperCase()}`;
  const expiresAt = Timestamp.fromMillis(Date.now() + HOLD_TTL_MS);

  await adminDb.runTransaction(async (tx) => {
    const refs = quoteData.dates.map((day) => inventoryRef(quoteData.propertyId, quoteData.roomType.id, day));
    const roomRef = adminDb.collection("roomTypes").doc(quoteData.roomType.id);
    const [roomSnap, ...docs] = await Promise.all([tx.get(roomRef), ...refs.map((ref) => tx.get(ref))]);
    const inventory = asNumber(roomSnap.data()?.totalInventory, 0);
    if (inventory <= 0 || docs.some((doc) => asNumber(doc.data()?.reserved) >= inventory)) throw new Error("SOLD_OUT_FOR_DATES");

    for (const day of quoteData.dates) {
      tx.set(inventoryRef(quoteData.propertyId, quoteData.roomType.id, day), {
        propertyId: quoteData.propertyId,
        roomTypeId: quoteData.roomType.id,
        date: day,
        reserved: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    const { propertyCoverImageUrl: _renderedCoverUrl, ...persistedQuote } = quoteData;
    void _renderedCoverUrl;
    tx.create(adminDb.collection("bookings").doc(id), {
      ...persistedQuote,
      id,
      confirmationCode,
      guestId: uid,
      leadGuest: {
        name: input.adultGuestNames[0],
        email: input.leadEmail.toLowerCase(),
        phone: input.leadPhone,
        adultGuestNames: input.adultGuestNames,
      },
      specialRequest: input.specialRequest || null,
      billing: input.billing,
      termsAcceptance: { version: "2026-09", cancellationPolicyId: quoteData.cancellationPolicyId, acceptedAt: FieldValue.serverTimestamp() },
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentMethod === "pay_at_property" ? "pay_at_property" : "pending",
      paidPaise: 0,
      bookingStatus: input.paymentMethod === "pay_at_property" ? "confirmed" : "pending_payment",
      inventoryReleased: false,
      expiresAt: input.paymentMethod === "pay_at_property" ? null : expiresAt,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    });
  });

  return { id, confirmationCode };
}

export async function releaseBookingHold(bookingId: string, actorId: string, nextStatus: "cancelled" | "expired" | "payment_failed" | "no_show", reason: string) {
  await adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection("bookings").doc(bookingId);
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!snap.exists || !data) throw new Error("BOOKING_NOT_FOUND");
    if (data.inventoryReleased === true) return;
    if (!releaseStatuses.has(String(data.bookingStatus))) throw new Error("BOOKING_NOT_CANCELLABLE");

    const days = Array.isArray(data.dates) ? data.dates : dateRange(String(data.checkIn), String(data.checkOut));
    for (const day of days) {
      tx.set(inventoryRef(String(data.propertyId), String(data.roomType?.id), String(day)), {
        reserved: FieldValue.increment(-1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    tx.update(ref, {
      bookingStatus: nextStatus,
      paymentStatus: ["cancelled", "no_show"].includes(nextStatus) && data.paymentStatus === "paid" ? "refund_pending" : nextStatus,
      inventoryReleased: true,
      statusReason: reason,
      cancelledAt: ["cancelled", "no_show"].includes(nextStatus) ? FieldValue.serverTimestamp() : data.cancelledAt ?? null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorId,
    });
  });
}

export async function createBooking(uid: string, raw: unknown) {
  const input = createBookingInput.parse(raw);
  if (input.adultGuestNames.length !== input.adults) throw new Error("ADULT_GUEST_NAMES_REQUIRED");
  const quoteData = await quote(input);
  if ((quoteData.ratePlan.paymentMode === "pay_at_property") !== (input.paymentMethod === "pay_at_property")) throw new Error("PAYMENT_METHOD_NOT_AVAILABLE");
  if (input.paymentMethod === "online" && (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)) throw new Error("ONLINE_PAYMENT_NOT_CONFIGURED");

  const booking = await holdInventoryAndCreateBooking(uid, input, quoteData);
  if (input.paymentMethod === "online") {
    try {
      const credentials = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
      const response = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: quoteData.payableNowPaise, currency: quoteData.currency, receipt: booking.confirmationCode, notes: { bookingId: booking.id } }),
      });
      const order = await response.json() as { id?: string };
      if (!response.ok || !order.id) throw new Error("PAYMENT_ORDER_CREATION_FAILED");
      await adminDb.collection("bookings").doc(booking.id).update({ razorpayOrderId: order.id, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid });
      return { bookingId: booking.id, confirmationCode: booking.confirmationCode, quote: quoteData, requiresPayment: true, razorpay: { keyId: process.env.RAZORPAY_KEY_ID, orderId: order.id, amount: quoteData.payableNowPaise, currency: quoteData.currency, name: "Helpkey" } };
    } catch (error) {
      await releaseBookingHold(booking.id, uid, "payment_failed", "PAYMENT_ORDER_CREATION_FAILED").catch(() => {});
      throw error instanceof Error ? error : new Error("PAYMENT_ORDER_CREATION_FAILED");
    }
  }
  return { bookingId: booking.id, confirmationCode: booking.confirmationCode, quote: quoteData, requiresPayment: false };
}

export async function verifyBookingPayment(uid: string, bookingId: string, raw: unknown) {
  const input = paymentVerificationInput.parse(raw);
  const expected = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET ?? "").update(`${input.razorpay_order_id}|${input.razorpay_payment_id}`).digest("hex");
  if (!process.env.RAZORPAY_KEY_SECRET || !safeCompare(expected, input.razorpay_signature)) throw new Error("PAYMENT_SIGNATURE_INVALID");
  await confirmPaidBooking(bookingId, {
    actorId: uid,
    orderId: input.razorpay_order_id,
    paymentId: input.razorpay_payment_id,
    source: "customer_verify",
  });
}

export async function confirmPaidBooking(bookingId: string, input: { actorId: string; orderId: string; paymentId: string; source: string }) {
  await adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection("bookings").doc(bookingId);
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!snap.exists || !data) throw new Error("BOOKING_NOT_FOUND");
    if (data.bookingStatus === "confirmed" && data.paymentStatus === "paid") return;
    if (data.bookingStatus !== "pending_payment" || data.razorpayOrderId !== input.orderId) throw new Error("PAYMENT_NOT_EXPECTED");
    tx.update(ref, {
      bookingStatus: "confirmed",
      paymentStatus: "paid",
      paidPaise: data.payableNowPaise ?? data.totalPaise ?? 0,
      razorpayPaymentId: input.paymentId,
      paymentVerifiedAt: FieldValue.serverTimestamp(),
      paidAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: input.actorId,
      paymentSource: input.source,
    });
  });
}

export async function cancelBookingForUser(uid: string, bookingId: string) {
  const snap = await adminDb.collection("bookings").doc(bookingId).get();
  if (!snap.exists || snap.data()?.guestId !== uid) throw new Error("BOOKING_NOT_FOUND");
  if (!cancellableStatuses.has(String(snap.data()?.bookingStatus))) throw new Error("BOOKING_NOT_CANCELLABLE");
  await releaseBookingHold(bookingId, uid, "cancelled", "CUSTOMER_CANCELLED");
}

export async function adminCancelBooking(adminId: string, bookingId: string) {
  await releaseBookingHold(bookingId, adminId, "cancelled", "ADMIN_CANCELLED");
}

export async function expirePendingBookings(actorId: string) {
  const now = Timestamp.now();
  const snap = await adminDb.collection("bookings").where("bookingStatus", "==", "pending_payment").where("expiresAt", "<=", now).limit(50).get();
  let expired = 0;
  for (const doc of snap.docs) {
    await releaseBookingHold(doc.id, actorId, "expired", "PAYMENT_HOLD_EXPIRED").then(() => { expired += 1; }).catch(() => {});
  }
  return { expired };
}

export function serializeBooking(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    confirmationCode: data.confirmationCode,
    propertyId: data.propertyId,
    propertySlug: data.propertySlug ?? null,
    propertyName: data.propertyName,
    propertyCity: data.propertyCity ?? data.city ?? null,
    propertyState: data.propertyState ?? data.state ?? null,
    propertyCoverImageUrl: data.propertyCoverImageUrl ?? data.coverImageUrl ?? null,
    checkInTime: data.checkInTime ?? "15:00",
    checkOutTime: data.checkOutTime ?? "11:00",
    roomTypeId: data.roomType?.id ?? null,
    roomName: data.roomType?.name ?? "Room",
    ratePlanName: data.ratePlan?.name ?? "Rate",
    checkIn: data.checkIn,
    checkOut: data.checkOut,
    nights: data.nights ?? 0,
    adults: data.adults ?? 1,
    children: data.children ?? 0,
    infants: data.infants ?? 0,
    leadGuest: data.leadGuest ?? null,
    specialRequest: data.specialRequest ?? null,
    subtotalPaise: data.subtotalPaise ?? 0,
    taxPaise: data.taxPaise ?? 0,
    customerFeePaise: data.customerFeePaise ?? 0,
    totalPaise: data.totalPaise ?? 0,
    payableNowPaise: data.payableNowPaise ?? 0,
    paidPaise: data.paidPaise ?? 0,
    currency: data.currency ?? "INR",
    bookingStatus: data.bookingStatus ?? "pending_payment",
    paymentStatus: data.paymentStatus ?? "pending",
    paymentMethod: data.paymentMethod ?? null,
    razorpayOrderId: data.razorpayOrderId ?? null,
    razorpayPaymentId: data.razorpayPaymentId ?? null,
    expiresAt: asIso(data.expiresAt),
    createdAt: asIso(data.createdAt),
    updatedAt: asIso(data.updatedAt),
  };
}

export async function serializeBookingWithResolvedMedia(id: string, data: FirebaseFirestore.DocumentData) {
  let imageUrl: string | null = null;
  const mediaIds = [data.propertyCoverMediaId].filter((value): value is string => typeof value === "string" && Boolean(value));
  const property = typeof data.propertyId === "string" ? await adminDb.collection("properties").doc(data.propertyId).get() : null;
  const currentCoverId = property?.data()?.coverMediaId;
  if (typeof currentCoverId === "string" && !mediaIds.includes(currentCoverId)) mediaIds.push(currentCoverId);
  for (const mediaId of mediaIds) {
    const media = await adminDb.collection("mediaAssets").doc(mediaId).get(); const raw = media.data();
    if (!raw || raw.propertyId !== data.propertyId) continue;
    const resolved = await resolvePublicImage(media.id, raw, typeof raw.altText === "string" ? raw.altText : "");
    if (resolved) { imageUrl = resolved.imageUrl; break; }
  }
  return { ...serializeBooking(id, { ...data, propertyCoverImageUrl: imageUrl }), propertyCoverImageUrl: imageUrl ?? "/balmoral_hotel.png" };
}
