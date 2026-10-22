import { publicGuestPolicies } from "@/lib/partner/guest-policies";
import "server-only";

import { createHash, createHmac, timingSafeEqual } from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { resolvePublicImage } from "@/lib/media-resolver";
import { invalidatePublic } from "@/lib/api/cache";
import { providerFetch } from "@/lib/providers/http";

import { bookingInput, createBookingInput, paymentVerificationInput } from "@/lib/booking/contracts";
export { bookingInput, createBookingInput, paymentVerificationInput } from "@/lib/booking/contracts";
import { enqueueBookingNotification } from "@/lib/booking/notifications";
import { evaluateStay, allocateIntervals, canonicalStatus, assertTransition, cancellationRefund } from "@/lib/booking/domain";
import { calendarRef, hasCapacity, readAvailability, writeAllocation } from "@/lib/booking/inventory";

const HOLD_TTL_MS = 10 * 60_000;
const cancellableStatuses = new Set(["pending_payment", "confirmed"]);
const releaseStatuses = new Set(["pending_payment", "confirmed"]);

type BookingInput = z.infer<typeof bookingInput>;
type CreateBookingInput = z.infer<typeof createBookingInput>;

function dateRange(checkIn: string, checkOut: string) {
  const out: string[] = [];
  for (let value = new Date(`${checkIn}T00:00:00Z`), end = new Date(`${checkOut}T00:00:00Z`); value < end; value = new Date(value.getTime() + 86400000)) {
    out.push(value.toISOString().slice(0, 10));
  }
  return out;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asIso(value: unknown) {
  return typeof (value as { toDate?: unknown })?.toDate === "function" ? (value as { toDate: () => Date }).toDate().toISOString() : null;
}

function searchableTokens(values: unknown[]) {
  return [...new Set(values.flatMap((value) => String(value ?? "").toLocaleLowerCase().trim().split(/\s+/)).filter(Boolean))].slice(0, 40);
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
    IDEMPOTENCY_CONFLICT: "This submission key was already used for different booking details.",
    PAYMENT_ORDER_RECONCILIATION_REQUIRED: "Your checkout is being reconciled. Check your trips before trying another booking.",
    PAYMENT_NOT_CAPTURED: "Payment has not been captured yet. Please check again shortly.",
    PAYMENT_REFUND_PENDING: "Payment arrived after this booking closed. A refund has been queued; check Trips for its status.",
    PAYMENT_MISMATCH: "Payment details did not match this booking.",
    DURATION_NOT_PRICED: "This stay duration is not priced. Choose another duration.",
    WHOLE_HOUR_DURATION_REQUIRED: "Choose a whole-hour stay duration.",
    QUOTE_CHANGED: "The price or stay rules changed. Review your quote and try again.",
    INVENTORY_CUTOVER_REQUIRED: "Hourly booking is not enabled for this property yet.",
    INVALID_LOCAL_TIME: "Choose a valid local arrival and departure time.",
    CHECK_IN_IN_PAST: "Choose a future check-in date.",
    CHECK_OUT_MUST_FOLLOW_CHECK_IN: "Check-out must be after check-in.",
    PROPERTY_NOT_AVAILABLE: "This stay is not available right now.",
    ROOM_NOT_AVAILABLE: "This room is not available right now.",
    RATE_NOT_AVAILABLE: "This rate is not available right now.",
    CHILDREN_NOT_ALLOWED: "This property does not allow children or infants.",
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

  const evaluated = evaluateStay(input, propertyData ?? {}, roomData, rateData);
  if (input.bookingMode === "hourly" && propertyData.inventoryEngine !== "interval_v1") throw new Error("INVENTORY_CUTOVER_REQUIRED");
  const nights = dateRange(evaluated.checkIn, evaluated.checkOut);
  const inventory = asNumber(roomData.totalInventory, 0);
  if (propertyData.inventoryEngine === "interval_v1") {
    if (!await readAvailability(property.id, room.id, evaluated, inventory)) throw new Error("SOLD_OUT_FOR_DATES");
  } else {
    const docs = await adminDb.getAll(...nights.map((day) => inventoryRef(property.id, room.id, day)));
    if (inventory <= 0 || docs.some((doc) => asNumber(doc.data()?.reserved) >= inventory)) throw new Error("SOLD_OUT_FOR_DATES");
  }
  const { subtotalPaise, taxBasisPoints, taxPaise, customerFeePaise, totalPaise, payableNowPaise, paymentMode, depositBasisPoints } = evaluated;
  const nightlyPricePaise = evaluated.unitPricePaise;

  const [cover, policy] = await Promise.all([propertyCover(propertyData ?? {}), rateData.cancellationPolicyId ? adminDb.collection("cancellationPolicies").doc(rateData.cancellationPolicyId).get() : Promise.resolve(null)]);
  const policyData = policy?.data();
  if (rateData.cancellationPolicyId && (!policyData || policyData.propertyId !== property.id || policyData.status !== "active")) throw new Error("RATE_NOT_AVAILABLE");
  return {
    ...evaluated,
    inventoryEngine: propertyData.inventoryEngine ?? "legacy",
    propertyId: property.id,
    propertySlug: input.propertySlug,
    propertyName: propertyData?.name ?? "Property",
    propertyRules: publicGuestPolicies(propertyData ?? {}),
    propertyCity: propertyData?.address?.city ?? propertyData?.city ?? null,
    propertyState: propertyData?.address?.state ?? propertyData?.state ?? null,
    propertyRatingAverage: typeof propertyData?.reviewSummary?.average === "number" && propertyData.reviewSummary.count > 0 ? propertyData.reviewSummary.average : typeof propertyData?.ratingAverage === "number" ? propertyData.ratingAverage : 0,
    propertyCoverImageUrl: cover.url,
    propertyCoverMediaId: cover.id,
    propertyCoverSourceChecksum: cover.checksum,
    checkInTime: evaluated.arrivalTime,
    checkOutTime: evaluated.departureTime,
    currency: propertyData?.currency ?? "INR",
    roomType: { id: room.id, name: roomData.name ?? "Room" },
    ratePlan: { id: rate.id, name: rateData.name ?? "Standard", paymentMode, depositBasisPoints },
    checkIn: input.checkIn,
    checkOut: evaluated.checkOut,
    nights: evaluated.nights,
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
    breakfastIncluded: rateData.breakfastIncluded === true,
    cancellationPolicyId: rateData.cancellationPolicyId ?? null,
    cancellationPolicy: policyData ? { name: policyData.name ?? "Cancellation policy", description: policyData.description ?? "", refundableUntilHours: asNumber(policyData.refundableUntilHours), cancellationFeePercent: asNumber(policyData.cancellationFeePercent) } : null,
  };
}

async function holdInventoryAndCreateBooking(uid: string, input: CreateBookingInput, quoteData: Awaited<ReturnType<typeof quote>>, id: string, requestFingerprint: string, manual?: { totalPaise: number; subtotalPaise: number; taxPaise: number; customerFeePaise: number; paid: boolean; reason: string }) {
  const confirmationCode = `HK-${id.slice(0, 20).toUpperCase()}`;
  const expiresAt = Timestamp.fromMillis(Math.min(Date.now() + HOLD_TTL_MS, Date.parse(quoteData.startAt)));

  await adminDb.runTransaction(async (tx) => {
    const existing = await tx.get(adminDb.collection("bookings").doc(id));
    if (existing.exists) {
      if (existing.data()?.requestFingerprint !== requestFingerprint) throw new Error("IDEMPOTENCY_CONFLICT");
      return;
    }
    if (manual) {
      const membership = await tx.get(adminDb.collection("propertyMemberships").doc(`${quoteData.propertyId}_${uid}`));
      if (membership.data()?.status !== "active") throw new Error("FORBIDDEN");
    }
    const propertyRef = adminDb.collection("properties").doc(quoteData.propertyId);
    const roomRef = adminDb.collection("roomTypes").doc(quoteData.roomType.id);
    const rateRef = adminDb.collection("ratePlans").doc(quoteData.ratePlan.id);
    const [propertySnap, roomSnap, rateSnap] = await Promise.all([tx.get(propertyRef), tx.get(roomRef), tx.get(rateRef)]);
    const property = propertySnap.data() ?? {}, room = roomSnap.data() ?? {}, rate = rateSnap.data() ?? {};
    if (property.status !== "active" || property.approvalStatus !== "approved" || !property.isBookable || room.status !== "active" || room.propertyId !== propertyRef.id || rate.status !== "active" || rate.propertyId !== propertyRef.id || rate.roomTypeId !== roomRef.id) throw new Error("RATE_NOT_AVAILABLE");
    if (rate.cancellationPolicyId) {
      const policy = (await tx.get(adminDb.collection("cancellationPolicies").doc(rate.cancellationPolicyId))).data();
      if (!policy || policy.propertyId !== propertyRef.id || policy.status !== "active") throw new Error("RATE_NOT_AVAILABLE");
      const snapshot = { name: policy.name ?? "Cancellation policy", description: policy.description ?? "", refundableUntilHours: asNumber(policy.refundableUntilHours), cancellationFeePercent: asNumber(policy.cancellationFeePercent) };
      if (JSON.stringify(snapshot) !== JSON.stringify(quoteData.cancellationPolicy)) throw new Error("QUOTE_CHANGED");
    }
    if ((rate.breakfastIncluded === true) !== quoteData.breakfastIncluded) throw new Error("QUOTE_CHANGED");
    const current = evaluateStay(input, property, room, rate);
    if (JSON.stringify(current) !== JSON.stringify(Object.fromEntries(Object.keys(current).map((key) => [key, quoteData[key as keyof typeof quoteData]]))) || (property.inventoryEngine ?? "legacy") !== quoteData.inventoryEngine) throw new Error("QUOTE_CHANGED");
    const allocations = allocateIntervals(current.startAt, current.inventoryEndAt, current.timezone);
    if (quoteData.inventoryEngine === "interval_v1") {
      const docs = await Promise.all(allocations.map((a) => tx.get(calendarRef(propertyRef.id, roomRef.id, a.date))));
      if (!hasCapacity(allocations, docs.map((doc) => doc.data() ?? {}), room.totalInventory)) throw new Error("SOLD_OUT_FOR_DATES");
      writeAllocation(tx, propertyRef.id, roomRef.id, allocations, 1);
      tx.create(adminDb.collection("inventoryHolds").doc(id), { bookingId: id, propertyId: propertyRef.id, roomTypeId: roomRef.id, allocations, quantity: 1, status: input.paymentMethod === "online" ? "held" : "committed", expiresAt: input.paymentMethod === "online" ? expiresAt : null, createdAt: FieldValue.serverTimestamp() });
    } else {
      const refs = quoteData.dates.map((day) => inventoryRef(propertyRef.id, roomRef.id, day));
      const docs = await Promise.all(refs.map((ref) => tx.get(ref)));
      if (room.totalInventory <= 0 || docs.some((doc) => asNumber(doc.data()?.reserved) >= room.totalInventory)) throw new Error("SOLD_OUT_FOR_DATES");
      for (const ref of refs) tx.set(ref, { propertyId: propertyRef.id, roomTypeId: roomRef.id, reserved: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }

    const initialStatus = input.paymentMethod === "pay_at_property" ? "confirmed" : "pending_payment";
    tx.create(adminDb.collection("bookings").doc(id).collection("events").doc(), { from: null, to: initialStatus, actorId: uid, createdAt: FieldValue.serverTimestamp() });
    enqueueBookingNotification(tx, id, quoteData.propertyId, uid, initialStatus);
    const { propertyCoverImageUrl: _renderedCoverUrl, ...persistedQuote } = quoteData;
    void _renderedCoverUrl;
    tx.create(adminDb.collection("bookings").doc(id), {
      ...persistedQuote,
      quoteSnapshot: persistedQuote,
      requestFingerprint,
      paymentReconciliationPending: input.paymentMethod === "online",
      nextReconcileAt: Timestamp.fromMillis(Date.now() + 60000),
      id,
      quantity: 1,
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
      paidPaise: manual?.paid ? manual.totalPaise : 0,
      bookingStatus: input.paymentMethod === "pay_at_property" ? "confirmed" : "pending_payment",
      ...(manual ? { source: "manual_partner", negotiatedPriceReason: manual.reason, publishedTotalPaise: quoteData.totalPaise, totalPaise: manual.totalPaise, subtotalPaise: manual.subtotalPaise, taxPaise: manual.taxPaise, customerFeePaise: manual.customerFeePaise, payableNowPaise: 0, balanceDuePaise: manual.paid ? 0 : manual.totalPaise, paymentStatus: manual.paid ? "paid_at_property" : "pay_at_property", paidAt: manual.paid ? FieldValue.serverTimestamp() : null } : {}),
      inventoryReleased: false,
      searchTokens: searchableTokens([confirmationCode, quoteData.propertyName, quoteData.roomType.name, input.adultGuestNames[0], input.leadEmail, input.leadPhone]),
      expiresAt: input.paymentMethod === "pay_at_property" ? null : expiresAt,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    });
  });

  await invalidatePublic("search:*");
  return { id, confirmationCode };
}

export async function releaseBookingHold(bookingId: string, actorId: string, nextStatus: "cancelled" | "expired" | "payment_failed" | "no_show", reason: string) {
  const result = await adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection("bookings").doc(bookingId);
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!snap.exists || !data) throw new Error("BOOKING_NOT_FOUND");
    if (data.inventoryReleased === true) return false;
    if (!releaseStatuses.has(String(data.bookingStatus))) throw new Error("BOOKING_NOT_CANCELLABLE");

    const now = Date.now();
    if (reason.startsWith("PARTNER_")) {
      const member = await tx.get(adminDb.collection("propertyMemberships").doc(`${data.propertyId}_${actorId}`));
      if (member.data()?.status !== "active") throw new Error("FORBIDDEN");
    }
    if (reason === "CUSTOMER_CANCELLED" && data.guestId !== actorId) throw new Error("BOOKING_NOT_FOUND");
    if (nextStatus === "expired" && (data.backgroundAttention?.expiry || data.expiryRetryAt?.toMillis() > now || !(data.expiresAt instanceof Timestamp) || data.expiresAt.toMillis() > now || data.bookingStatus !== "pending_payment")) return false;
    if (reason === "CUSTOMER_CANCELLED" && data.startAt && Date.parse(data.startAt) <= now) throw new Error("BOOKING_NOT_CANCELLABLE");
    if (nextStatus === "no_show" && (!data.startAt || Date.parse(data.startAt) > now)) throw new Error("INVALID_BOOKING_TRANSITION");
    const holdRef = adminDb.collection("inventoryHolds").doc(bookingId);
    if (data.inventoryEngine === "interval_v1") {
      const hold = (await tx.get(holdRef)).data();
      if (!hold || hold.status === "released") throw new Error("INVENTORY_ALLOCATION_MISSING");
      const allocations = hold.allocations as ReturnType<typeof allocateIntervals>;
      const calendars = await Promise.all(allocations.map((allocation) => tx.get(calendarRef(data.propertyId, data.roomType.id, allocation.date))));
      if (allocations.some((allocation, index) => allocation.intervals.some((key) => Number(calendars[index].data()?.reserved?.[key] ?? 0) < 1))) throw new Error("INVENTORY_DRIFT");
      writeAllocation(tx, data.propertyId, data.roomType.id, hold.allocations, -1);
      tx.update(holdRef, { status: "released", releasedAt: FieldValue.serverTimestamp() });
    } else {
      const days = Array.isArray(data.dates) ? data.dates : dateRange(String(data.checkIn), String(data.checkOut));
      for (const day of days) tx.set(inventoryRef(String(data.propertyId), String(data.roomType?.id), String(day)), { reserved: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    const refundPaise = data.paymentMethod === "online" && ["cancelled", "no_show"].includes(nextStatus) ? cancellationRefund(data.paidPaise ?? 0, data.refundedPaise ?? 0, data.startAt ?? `${data.checkIn}T00:00:00Z`, data.cancellationPolicy, now, ["PARTNER_CANCELLED", "ADMIN_CANCELLED"].includes(reason), data.totalPaise ?? data.paidPaise ?? 0) : 0;
    if (refundPaise > 0) tx.set(adminDb.collection("refunds").doc(`${bookingId}_cancellation`), { bookingId, propertyId: data.propertyId, paymentId: data.razorpayPaymentId, amountPaise: refundPaise, status: "pending", nextAttemptAt: Timestamp.now(), reason, updatedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp() });
    tx.create(ref.collection("events").doc(), { from: data.bookingStatus, to: nextStatus, reason, actorId, createdAt: FieldValue.serverTimestamp() });
    enqueueBookingNotification(tx, bookingId, data.propertyId, data.guestId, nextStatus);
    tx.update(ref, {
      bookingStatus: nextStatus,
      paymentStatus: refundPaise > 0 ? "refund_pending" : data.paymentStatus,
      refundDuePaise: refundPaise,
      inventoryReleased: true,
      statusReason: reason,
      cancelledAt: ["cancelled", "no_show"].includes(nextStatus) ? FieldValue.serverTimestamp() : data.cancelledAt ?? null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorId,
    });
    return true;
  });
  await invalidatePublic("search:*");
  return result;
}

export async function createBooking(uid: string, raw: unknown, idempotencyKey?: string) {
  const input = createBookingInput.parse(raw);
  const requestFingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const id = createHash("sha256").update(`${uid}\0${idempotencyKey ?? requestFingerprint}`).digest("hex");
  const existing = await adminDb.collection("bookings").doc(id).get();
  if (existing.exists) {
    const data = existing.data()!;
    if (data.requestFingerprint !== requestFingerprint) throw new Error("IDEMPOTENCY_CONFLICT");
    return existingBookingResponse(id, data);
  }
  if (!input.termsAccepted) throw new Error("TERMS_ACCEPTANCE_REQUIRED");
  if (input.adultGuestNames.length !== input.adults) throw new Error("ADULT_GUEST_NAMES_REQUIRED");
  const quoteData = await quote(input);
  if (input.expectedTotalPaise !== undefined && input.expectedTotalPaise !== quoteData.totalPaise) throw new Error("QUOTE_CHANGED");
  if ((quoteData.ratePlan.paymentMode === "pay_at_property") !== (input.paymentMethod === "pay_at_property")) throw new Error("PAYMENT_METHOD_NOT_AVAILABLE");
  if (input.paymentMethod === "online" && quoteData.payableNowPaise < 100) throw new Error("MINIMUM_ONLINE_PAYMENT_1_RUPEE");
  if (input.paymentMethod === "online" && (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)) throw new Error("ONLINE_PAYMENT_NOT_CONFIGURED");

  const booking = await holdInventoryAndCreateBooking(uid, input, quoteData, id, requestFingerprint);
  if (input.paymentMethod === "online") {
    try {
      const orderRef = adminDb.collection("bookings").doc(booking.id);
      const already = await adminDb.runTransaction(async (tx) => {
        const data = (await tx.get(orderRef)).data()!;
        if (data.razorpayOrderId) return data;
        if (data.orderCreationStartedAt) throw new Error("PAYMENT_ORDER_RECONCILIATION_REQUIRED");
        tx.update(orderRef, { orderCreationStartedAt: FieldValue.serverTimestamp() });
        return null;
      });
      if (already) return existingBookingResponse(booking.id, already);
      const credentials = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
      const response = await providerFetch("razorpay", "https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: quoteData.payableNowPaise, currency: quoteData.currency, receipt: booking.confirmationCode, notes: { bookingId: booking.id } }), timeoutMs: 8_000, idempotent: false,
      });
      const order = await response.json() as { id?: string };
      if (!response.ok || !order.id) throw new Error("PAYMENT_ORDER_CREATION_FAILED");
      await adminDb.collection("bookings").doc(booking.id).update({ razorpayOrderId: order.id, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid });
      const saved = (await adminDb.collection("bookings").doc(booking.id).get()).data()!;
      return { bookingId: booking.id, confirmationCode: booking.confirmationCode, quote: quoteData, requiresPayment: true, expiresAt: asIso(saved.expiresAt), razorpay: { keyId: process.env.RAZORPAY_KEY_ID, orderId: order.id, amount: quoteData.payableNowPaise, currency: quoteData.currency, name: "Helpkey" } };
    } catch (error) {
      // An ambiguous network failure may have created an order. Keep the durable
      // identity and hold for reconciliation/expiry; never submit a second order.
      await adminDb.collection("bookings").doc(booking.id).set({ orderReconciliationRequired: true }, { merge: true });
      throw error instanceof Error ? error : new Error("PAYMENT_ORDER_CREATION_FAILED");
    }
  }
  return { bookingId: booking.id, confirmationCode: booking.confirmationCode, quote: quoteData, requiresPayment: false };
}

function existingBookingResponse(id: string, data: FirebaseFirestore.DocumentData) {
  if (!["pending_payment", "confirmed", "checked_in", "checked_out", "completed"].includes(data.bookingStatus)) throw new Error("BOOKING_NOT_ACTIVE");
  const requiresPayment = data.bookingStatus === "pending_payment";
  if (requiresPayment && (!data.razorpayOrderId || !(data.expiresAt instanceof Timestamp) || data.expiresAt.toMillis() <= Date.now())) throw new Error("PAYMENT_ORDER_RECONCILIATION_REQUIRED");
  return { bookingId: id, confirmationCode: data.confirmationCode as string, quote: data.quoteSnapshot ?? { totalPaise: data.totalPaise, payableNowPaise: data.payableNowPaise, currency: data.currency }, requiresPayment, expiresAt: asIso(data.expiresAt), ...(requiresPayment ? { razorpay: { keyId: process.env.RAZORPAY_KEY_ID, orderId: data.razorpayOrderId as string, amount: data.payableNowPaise as number, currency: data.currency as string, name: "Helpkey" } } : {}) };
}

export async function verifyBookingPayment(uid: string, bookingId: string, raw: unknown) {
  const input = paymentVerificationInput.parse(raw);
  const expected = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET ?? "").update(`${input.razorpay_order_id}|${input.razorpay_payment_id}`).digest("hex");
  if (!process.env.RAZORPAY_KEY_SECRET || !safeCompare(expected, input.razorpay_signature)) throw new Error("PAYMENT_SIGNATURE_INVALID");
  const confirmed = await confirmPaidBooking(bookingId, {
    actorId: uid,
    orderId: input.razorpay_order_id,
    paymentId: input.razorpay_payment_id,
    source: "customer_verify",
  });
  if (!confirmed) throw new Error("PAYMENT_REFUND_PENDING");
}

export async function confirmPaidBooking(bookingId: string, input: { actorId: string; orderId: string; paymentId: string; source: string }) {
  const initial = await adminDb.collection("bookings").doc(bookingId).get();
  if (!initial.exists || (input.source === "customer_verify" && initial.data()?.guestId !== input.actorId)) throw new Error("BOOKING_NOT_FOUND");
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) throw new Error("ONLINE_PAYMENT_NOT_CONFIGURED");
  const credentials = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const response = await providerFetch("razorpay", `https://api.razorpay.com/v1/payments/${encodeURIComponent(input.paymentId)}`, { headers: { Authorization: `Basic ${credentials}` }, timeoutMs: 8_000, idempotent: true });
  const payment = await response.json() as { id: string; order_id: string; amount: number; currency: string; status: string; captured: boolean };
  if (!response.ok || payment.id !== input.paymentId || payment.order_id !== input.orderId || payment.status !== "captured" || payment.captured !== true) throw new Error("PAYMENT_NOT_CAPTURED");
  const result = await adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection("bookings").doc(bookingId);
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!snap.exists || !data) throw new Error("BOOKING_NOT_FOUND");
    if (input.source === "customer_verify" && data.guestId !== input.actorId) throw new Error("BOOKING_NOT_FOUND");
    if (data.razorpayOrderId !== input.orderId || payment.amount !== data.payableNowPaise || payment.currency !== data.currency) throw new Error("PAYMENT_MISMATCH");
    const receiptRef = adminDb.collection("paymentAttempts").doc(input.paymentId);
    const receipt = await tx.get(receiptRef);
    if (receipt.exists) {
      if (receipt.data()?.bookingId !== bookingId) throw new Error("PAYMENT_MISMATCH");
      return ["confirmed", "checked_in", "checked_out", "completed"].includes(data.bookingStatus) && data.razorpayPaymentId === input.paymentId;
    }
    const holdRef = adminDb.collection("inventoryHolds").doc(bookingId);
    const hold = data.inventoryEngine === "interval_v1" ? await tx.get(holdRef) : null;
    const active = data.bookingStatus === "pending_payment" && data.inventoryReleased !== true && data.expiresAt instanceof Timestamp && data.expiresAt.toMillis() > Date.now();
    const expireNow = !active && data.bookingStatus === "pending_payment" && data.inventoryReleased !== true;
    const allocations = expireNow && hold ? hold.data()?.allocations as ReturnType<typeof allocateIntervals> | undefined : undefined;
    if (expireNow && hold) {
      if (!allocations || hold.data()?.status !== "held") throw new Error("INVENTORY_ALLOCATION_MISSING");
      const calendars = await Promise.all(allocations.map((allocation) => tx.get(calendarRef(data.propertyId, data.roomType.id, allocation.date))));
      if (allocations.some((allocation, index) => allocation.intervals.some((key) => Number(calendars[index].data()?.reserved?.[key] ?? 0) < 1))) throw new Error("INVENTORY_DRIFT");
    }
    if (expireNow && !hold) {
      const dates = Array.isArray(data.dates) ? data.dates : dateRange(data.checkIn, data.checkOut);
      await Promise.all(dates.map((day: string) => tx.get(inventoryRef(data.propertyId, data.roomType.id, day))));
    }
    tx.create(receiptRef, { bookingId, orderId: input.orderId, paymentId: input.paymentId, amountPaise: payment.amount, currency: payment.currency, status: "captured", createdAt: FieldValue.serverTimestamp() });
    if (!active) {
      if (expireNow) {
        if (allocations) { writeAllocation(tx, data.propertyId, data.roomType.id, allocations, -1); tx.update(holdRef, { status: "released", releasedAt: FieldValue.serverTimestamp() }); }
        else for (const day of data.dates ?? dateRange(data.checkIn, data.checkOut)) tx.set(inventoryRef(data.propertyId, data.roomType.id, day), { reserved: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        tx.update(ref, { bookingStatus: "expired", inventoryReleased: true, statusReason: "CAPTURE_AFTER_HOLD" });
        tx.create(ref.collection("events").doc(), { from: "pending_payment", to: "expired", actorId: input.actorId, reason: "CAPTURE_AFTER_HOLD", createdAt: FieldValue.serverTimestamp() });
        enqueueBookingNotification(tx, bookingId, data.propertyId, data.guestId, "expired");
      }
      tx.create(adminDb.collection("refunds").doc(`${bookingId}_${input.paymentId}_late`), { bookingId, propertyId: data.propertyId, paymentId: input.paymentId, amountPaise: payment.amount, status: "pending", nextAttemptAt: Timestamp.now(), reason: "CAPTURE_AFTER_HOLD", updatedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp() });
      tx.update(ref, { paymentReconciliationPending: false, paymentStatus: "refund_pending", paidPaise: FieldValue.increment(payment.amount), refundDuePaise: FieldValue.increment(payment.amount), updatedAt: FieldValue.serverTimestamp() });
      return false;
    }
    if (hold && hold.data()?.status !== "held") throw new Error("INVENTORY_ALLOCATION_MISSING");
    if (hold) tx.update(holdRef, { status: "committed", committedAt: FieldValue.serverTimestamp() });
    tx.create(ref.collection("events").doc(), { from: data.bookingStatus, to: "confirmed", actorId: input.actorId, createdAt: FieldValue.serverTimestamp() });
    enqueueBookingNotification(tx, bookingId, data.propertyId, data.guestId, "confirmed");
    tx.update(ref, {
      bookingStatus: "confirmed",
      paymentStatus: payment.amount < data.totalPaise ? "partially_paid" : "paid",
      paidPaise: data.payableNowPaise ?? data.totalPaise ?? 0,
      razorpayPaymentId: input.paymentId,
      paymentVerifiedAt: FieldValue.serverTimestamp(),
      paidAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: input.actorId,
      paymentSource: input.source,
      paymentReconciliationPending: false,
    });
    return true;
  });
  await invalidatePublic("search:*");
  return result;
}

export async function cancelBookingForUser(uid: string, bookingId: string) {
  const snap = await adminDb.collection("bookings").doc(bookingId).get();
  if (!snap.exists || snap.data()?.guestId !== uid) throw new Error("BOOKING_NOT_FOUND");
  if (snap.data()?.bookingStatus === "cancelled" && snap.data()?.inventoryReleased) return;
  if (!cancellableStatuses.has(String(snap.data()?.bookingStatus))) throw new Error("BOOKING_NOT_CANCELLABLE");
  await releaseBookingHold(bookingId, uid, "cancelled", "CUSTOMER_CANCELLED");
}

export async function adminCancelBooking(adminId: string, bookingId: string) {
  await releaseBookingHold(bookingId, adminId, "cancelled", "ADMIN_CANCELLED");
}

export async function expirePendingBookings(actorId: string, bookingId?: string) {
  const now = Timestamp.now();
  const snap = bookingId ? { docs: [await adminDb.collection("bookings").doc(bookingId).get()], size: 1 } : await adminDb.collection("bookings").where("bookingStatus", "==", "pending_payment").where("expiresAt", "<=", now).limit(50).get();
  let expired = 0;
  const failures: string[] = [];
  const eligible = snap.docs.filter(doc => !doc.get("backgroundAttention.expiry") && !(doc.get("expiryRetryAt")?.toMillis() > Date.now()));
  for (const doc of eligible) {
    await releaseBookingHold(doc.id, actorId, "expired", "PAYMENT_HOLD_EXPIRED").then((released) => { if (released) expired += 1; }).catch(() => { failures.push(doc.id); });
  }
  return { examined: eligible.length, expired, failures, hasMore: !bookingId && eligible.length === 50 && failures.length === 0 };
}

export function serializeBooking(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    confirmationCode: data.confirmationCode,
    quantity: 1,
    propertyId: data.propertyId,
    propertySlug: data.propertySlug ?? null,
    propertyName: data.propertyName,
    propertyCity: data.propertyCity ?? data.city ?? null,
    propertyState: data.propertyState ?? data.state ?? null,
    propertyCoverImageUrl: data.propertyCoverImageUrl ?? data.coverImageUrl ?? null,
    checkInTime: data.arrivalTime ?? data.checkInTime ?? "14:00",
    checkOutTime: data.departureTime ?? data.checkOutTime ?? "11:00",
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
    bookingMode: data.bookingMode ?? "overnight",
    pricingModel: data.pricingModel ?? "nightly",
    timezone: data.timezone ?? "Asia/Kolkata",
    startAt: data.startAt ?? null,
    endAt: data.endAt ?? null,
    durationMinutes: data.durationMinutes ?? null,
    billedHours: data.billedHours ?? 0,
    balanceDuePaise: ["cancelled", "expired", "no_show", "payment_failed"].includes(data.bookingStatus) ? 0 : Math.max(0, (data.totalPaise ?? 0) - (data.paidPaise ?? 0)),
    refundDuePaise: data.refundDuePaise ?? 0,
    refundedPaise: data.refundedPaise ?? 0,
    bookingStatus: canonicalStatus(data.bookingStatus ?? "pending_payment"),
    allowedActions: data.bookingStatus === "confirmed" ? ["checked_in", ...(data.startAt && Date.parse(data.startAt) <= Date.now() ? ["no_show"] : ["cancel"])] : data.bookingStatus === "checked_in" ? ["checked_out"] : data.bookingStatus === "pending_payment" ? ["pay", "cancel"] : [],
    overdue: data.bookingStatus === "checked_in" && Boolean(data.endAt && Date.parse(data.endAt) < Date.now()),
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

/** Resolves booking covers with two getAll calls, independent of page size. */
export async function serializeBookingsWithResolvedMedia(rows: FirebaseFirestore.QueryDocumentSnapshot[]) {
  const propertyIds = [...new Set(rows.map((row) => row.data().propertyId).filter((id): id is string => typeof id === "string" && Boolean(id)))];
  const properties = propertyIds.length ? await adminDb.getAll(...propertyIds.map((id) => adminDb.collection("properties").doc(id))) : [];
  const propertyById = new Map(properties.map((doc) => [doc.id, doc.data() ?? {}]));
  const mediaIds = [...new Set(rows.flatMap((row) => {
    const data = row.data();
    const current = propertyById.get(data.propertyId)?.coverMediaId;
    return [data.propertyCoverMediaId, current].filter((id): id is string => typeof id === "string" && Boolean(id));
  }))];
  const media = mediaIds.length ? await adminDb.getAll(...mediaIds.map((id) => adminDb.collection("mediaAssets").doc(id))) : [];
  const mediaById = new Map(media.map((doc) => [doc.id, doc]));
  return Promise.all(rows.map(async (row) => {
    const data = row.data();
    const ids = [propertyById.get(data.propertyId)?.coverMediaId, data.propertyCoverMediaId].filter((id): id is string => typeof id === "string");
    let imageUrl: string | null = null;
    for (const id of ids) {
      const asset = mediaById.get(id); const raw = asset?.data();
      if (!asset || !raw || raw.propertyId !== data.propertyId) continue;
      const resolved = await resolvePublicImage(asset.id, raw, typeof raw.altText === "string" ? raw.altText : "");
      if (resolved) { imageUrl = resolved.imageUrl; break; }
    }
    return { ...serializeBooking(row.id, { ...data, propertyCoverImageUrl: imageUrl }), propertyCoverImageUrl: imageUrl ?? "/balmoral_hotel.png" };
  }));
}

/** Canonical lifecycle actions are checked again inside the transaction. */
export async function transitionBooking(bookingId: string, actorId: string, next: "checked_in" | "checked_out") {
  await adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection("bookings").doc(bookingId);
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!data) throw new Error("BOOKING_NOT_FOUND");
    const membership = await tx.get(adminDb.collection("propertyMemberships").doc(`${data.propertyId}_${actorId}`));
    if (membership.data()?.status !== "active") throw new Error("FORBIDDEN");
    assertTransition(data.bookingStatus, next);
    if (next === "checked_in" && ((data.startAt && Date.parse(data.startAt) > Date.now()) || (data.endAt && Date.parse(data.endAt) <= Date.now()))) throw new Error("INVALID_BOOKING_TRANSITION");
    tx.update(ref, { bookingStatus: next, [next === "checked_in" ? "actualCheckInAt" : "actualCheckOutAt"]: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: actorId });
    tx.create(ref.collection("events").doc(), { from: canonicalStatus(data.bookingStatus), to: next, actorId, createdAt: FieldValue.serverTimestamp() });
    enqueueBookingNotification(tx, bookingId, data.propertyId, data.guestId, next);
  });
}

export const manualReservationInput = bookingInput.omit({ propertySlug: true }).extend({
  propertyId: z.string().min(1), guestName: z.string().trim().min(2).max(120),
  guestEmail: z.string().email().optional().or(z.literal("")), guestPhone: z.string().max(25).optional(),
  negotiatedSubtotalPaise: z.number().int().nonnegative().max(1000000000).optional(), negotiatedPriceReason: z.string().trim().min(3).max(500).optional(),
  paymentMethod: z.enum(["paid", "pay_at_property"]).default("pay_at_property"), specialRequest: z.string().max(1000).default(""),
});
export async function createManualReservation(uid: string, raw: unknown, key: string) {
  const input = manualReservationInput.parse(raw);
  const membership = await adminDb.collection("propertyMemberships").doc(`${input.propertyId}_${uid}`).get();
  if (membership.data()?.status !== "active") throw new Error("FORBIDDEN");
  const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const id = createHash("sha256").update(`manual\0${uid}\0${key}`).digest("hex");
  const existing = await adminDb.collection("bookings").doc(id).get();
  if (existing.exists) {
    if (existing.data()?.requestFingerprint !== fingerprint) throw new Error("IDEMPOTENCY_CONFLICT");
    return { id, confirmationCode: String(existing.data()!.confirmationCode) };
  }
  const property = await adminDb.collection("properties").doc(input.propertyId).get();
  if (!property.exists) throw new Error("PROPERTY_NOT_AVAILABLE");
  const quoteData = await quote({ ...input, propertySlug: property.data()!.slug });
  if (input.negotiatedSubtotalPaise !== undefined && !input.negotiatedPriceReason) throw new Error("NEGOTIATED_PRICE_REASON_REQUIRED");
  const customerInput: CreateBookingInput = { ...input, propertySlug: property.data()!.slug, paymentMethod: "pay_at_property", leadEmail: input.guestEmail ?? "", leadPhone: input.guestPhone ?? "", adultGuestNames: Array.from({ length: input.adults }, () => input.guestName), billing: null, termsAccepted: true };
  const subtotalPaise = input.negotiatedSubtotalPaise ?? quoteData.subtotalPaise;
  const taxPaise = Number((BigInt(subtotalPaise) * BigInt(quoteData.taxBasisPoints) + BigInt(5000)) / BigInt(10000));
  const totalPaise = subtotalPaise + taxPaise + quoteData.customerFeePaise;
  return holdInventoryAndCreateBooking(uid, customerInput, quoteData, id, fingerprint, { totalPaise, subtotalPaise, taxPaise, customerFeePaise: quoteData.customerFeePaise, paid: input.paymentMethod === "paid", reason: input.negotiatedPriceReason ?? "Published rate" });
}
