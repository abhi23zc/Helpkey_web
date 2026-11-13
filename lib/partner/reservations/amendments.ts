import { operationalAccess } from "@/lib/partner/pms/access";
import { withDatePrices } from "@/lib/booking/date-prices";
import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";
import { invalidatePublic } from "@/lib/api/cache";
import {
  allocateIntervals,
  evaluateStay,
  validDate,
  type Allocation,
} from "@/lib/booking/domain";
import {
  calendarRef,
  hasCapacity,
  writeAllocation,
} from "@/lib/booking/inventory";
import { amenitySnapshotFor } from "@/lib/bookings";
import { assignPhysical } from "./physical";
import { requireFeature, safeData } from "./operations";
import type { RecordData } from "@/lib/partner/dashboard/domain";
const inputSchema = z
  .object({
    roomTypeId: z.string().min(1).max(180),
    ratePlanId: z.string().min(1).max(180),
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
  })
  .strict();
const secret = () =>
  process.env.CURSOR_SIGNING_SECRET ||
  process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
  (process.env.NODE_ENV !== "production"
    ? "development-amendment-signing-secret"
    : (() => {
        throw new Error("SIGNING_NOT_CONFIGURED");
      })());
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function sign(value: unknown) {
  const data = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${data}.${createHmac("sha256", secret()).update(data).digest("base64url")}`;
}
function verify(token: string) {
  if (token.length > 16000) throw new ApiException("INVALID_PREVIEW", 422);
  const [data, sig, extra] = token.split(".");
  const expected = createHmac("sha256", secret())
      .update(data || "")
      .digest(),
    supplied = Buffer.from(sig || "", "base64url");
  if (
    !data ||
    extra ||
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  )
    throw new ApiException("INVALID_PREVIEW", 422);
  return z
    .object({
      uid: z.string(),
      bookingId: z.string(),
      expiresAt: z.number(),
      fingerprint: z.string(),
      input: inputSchema,
    })
    .parse(JSON.parse(Buffer.from(data, "base64url").toString()));
}
async function readAmendment(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  bookingId: string,
  input: z.infer<typeof inputSchema>,
) {
  const ref = adminDb.collection("bookings").doc(bookingId),
    b = (await tx.get(ref)).data();
  if (!b) throw new ApiException("NOT_FOUND", 404);
  await operationalAccess(uid, b.propertyId, "reservation.amend", tx);
  if (
    b.bookingStatus !== "confirmed" ||
    b.inventoryReleased ||
    b.inventoryEngine !== "interval_v1" ||
    !b.startAt ||
    Date.parse(b.startAt) <= Date.now()
  )
    throw new ApiException(
      "AMENDMENT_NOT_ALLOWED",
      409,
      "Only future confirmed bookings on interval inventory can be changed.",
    );
  if (
    (b.customizations ?? []).length ||
    b.extrasTotalPaise ||
    b.customizationCreditPaise ||
    b.couponId ||
    b.couponDiscountPaise ||
    b.refundDuePaise
  )
    throw new ApiException(
      "RESOLVE_AGREEMENTS_FIRST",
      409,
      "Bookings with extras, discounts or pending refunds need those agreements resolved before dates or room type can change.",
    );
  const [propertyDoc, roomDoc, rateDoc, holdDoc] = await Promise.all([
    tx.get(adminDb.collection("properties").doc(b.propertyId)),
    tx.get(adminDb.collection("roomTypes").doc(input.roomTypeId)),
    tx.get(adminDb.collection("ratePlans").doc(input.ratePlanId)),
    tx.get(adminDb.collection("inventoryHolds").doc(bookingId)),
  ]);
  const p = propertyDoc.data() ?? {},
    room = roomDoc.data() ?? {},
    rate = rateDoc.data() ?? {},
    hold = holdDoc.data();
  if (
    p.inventoryEngine !== "interval_v1" ||
    room.propertyId !== b.propertyId ||
    room.status !== "active" ||
    rate.propertyId !== b.propertyId ||
    rate.roomTypeId !== input.roomTypeId ||
    rate.status !== "active" ||
    (p.currency || "INR") !== b.currency
  )
    throw new ApiException("RATE_NOT_AVAILABLE", 409);
  if (!hold || hold.status !== "committed" || !Array.isArray(hold.allocations))
    throw new ApiException("INVENTORY_ALLOCATION_MISSING", 409);
  const current = evaluateStay(
    {
      ...input,
      bookingMode: b.bookingMode || "overnight",
      adults: b.adults ?? 1,
      children: b.children ?? 0,
      infants: b.infants ?? 0,
    },
    p,
    room,
    await withDatePrices(b.propertyId, input.ratePlanId, rate, { ...input, bookingMode: b.bookingMode || "overnight" }, tx),
  );
  const policy = rate.cancellationPolicyId
    ? (
        await tx.get(
          adminDb
            .collection("cancellationPolicies")
            .doc(rate.cancellationPolicyId),
        )
      ).data()
    : null;
  if (
    rate.cancellationPolicyId &&
    (!policy ||
      policy.propertyId !== b.propertyId ||
      policy.status !== "active")
  )
    throw new ApiException("RATE_NOT_AVAILABLE", 409);
  const amenities = await amenitySnapshotFor(p, room, rate, (ref) =>
    tx.get(ref),
  );
  const oldAllocations = hold.allocations as Allocation[],
    newAllocations = allocateIntervals(
      current.startAt,
      current.inventoryEndAt,
      current.timezone,
    );
  const refs = [
    ...new Map(
      [
        ...oldAllocations.map((a) =>
          calendarRef(b.propertyId, hold.roomTypeId, a.date),
        ),
        ...newAllocations.map((a) =>
          calendarRef(b.propertyId, input.roomTypeId, a.date),
        ),
      ].map((r) => [r.path, r]),
    ).values(),
  ];
  const calendars = await tx.getAll(...refs),
    map = new Map(calendars.map((d) => [d.ref.path, d.data() ?? {}]));
  for (const a of oldAllocations) {
    const calendar = map.get(
      calendarRef(b.propertyId, hold.roomTypeId, a.date).path,
    )!;
    if (a.intervals.some((key) => (calendar.reserved?.[key] ?? 0) < 1))
      throw new ApiException("INVENTORY_DRIFT", 409);
  }
  const adjusted = newAllocations.map((a) => {
    const data = map.get(
      calendarRef(b.propertyId, input.roomTypeId, a.date).path,
    )!;
    const reserved = { ...data.reserved };
    if (hold.roomTypeId === input.roomTypeId)
      for (const old of oldAllocations)
        if (old.date === a.date)
          for (const key of old.intervals)
            reserved[key] = (reserved[key] ?? 0) - 1;
    return { ...data, reserved };
  });
  if (!hasCapacity(newAllocations, adjusted, room.totalInventory))
    throw new ApiException("SOLD_OUT_FOR_DATES", 409);
  const cancellationPolicy = policy
    ? {
        name: policy.name ?? "Cancellation policy",
        description: policy.description ?? "",
        refundableUntilHours: policy.refundableUntilHours ?? 0,
        cancellationFeePercent: policy.cancellationFeePercent ?? 0,
      }
    : null;
  const patch: RecordData = {
    ...current,
    roomType: { id: input.roomTypeId, name: room.name },
    ratePlan: {
      id: input.ratePlanId,
      name: rate.name,
      paymentMode: current.paymentMode,
      depositBasisPoints: current.depositBasisPoints,
    },
    cancellationPolicyId: rate.cancellationPolicyId ?? null,
    cancellationPolicy,
    amenitySnapshot: amenities,
    breakfastIncluded: rate.breakfastIncluded === true,
    dates: Array.from({ length: current.nights }, (_, i) =>
      new Date(Date.parse(`${current.checkIn}T12:00Z`) + i * 86400_000)
        .toISOString()
        .slice(0, 10),
    ),
    roomTotalPaise: current.totalPaise,
    payableNowPaise: 0,
    balanceDuePaise: Math.max(
      0,
      current.totalPaise - ((b.paidPaise ?? 0) - (b.refundedPaise ?? 0)),
    ),
  };
  // Match price/time/terms and booking revision, not the preview wall-clock timestamp.
  const fingerprint = hash({
    booking: safeData(b),
    patch,
    propertyUpdated: safeData(p),
    roomUpdated: safeData(room),
    rateUpdated: safeData(rate),
  });
  return {
    ref,
    b,
    patch,
    fingerprint,
    oldAllocations,
    newAllocations,
    hold,
    amountToCollectPaise: patch.balanceDuePaise,
    refundableExcessPaise: Math.max(
      0,
      (b.paidPaise ?? 0) - (b.refundedPaise ?? 0) - current.totalPaise,
    ),
  };
}
export async function previewAmendment(
  uid: string,
  bookingId: string,
  raw: unknown,
) {
  requireFeature("amendments");
  const input = inputSchema.parse(raw);
  const result = await adminDb.runTransaction((tx) =>
    readAmendment(tx, uid, bookingId, input),
  );
  return {
    token: sign({
      uid,
      bookingId,
      input,
      fingerprint: result.fingerprint,
      expiresAt: Date.now() + 300000,
    }),
    totalPaise: result.patch.totalPaise,
    previousTotalPaise: result.b.totalPaise,
    amountToCollectPaise: result.amountToCollectPaise,
    refundableExcessPaise: result.refundableExcessPaise,
    roomName: result.patch.roomType.name,
    startAt: result.patch.startAt,
    endAt: result.patch.endAt,
    assignmentCleared:
      !!result.b.physicalUnitId && result.b.roomType.id !== input.roomTypeId,
  };
}
export async function confirmAmendment(
  uid: string,
  bookingId: string,
  raw: unknown,
  key: string,
) {
  requireFeature("amendments");
  const { token } = z
      .object({ token: z.string().max(16000) })
      .strict()
      .parse(raw),
    preview = verify(token);
  if (preview.uid !== uid || preview.bookingId !== bookingId)
    throw new ApiException("INVALID_PREVIEW", 403);
  if (!key || key.length > 180)
    throw new ApiException("IDEMPOTENCY_KEY_REQUIRED", 422);
  const eventId = hash(`${uid}\0${bookingId}\0amend\0${key}`);
  await adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection("bookings").doc(bookingId),
      existing = await tx.get(ref.collection("events").doc(eventId));
    if (existing.exists) {
      const b = (await tx.get(ref)).data();
      if (!b) throw new ApiException("NOT_FOUND", 404);
      await operationalAccess(uid, b.propertyId, "reservation.amend", tx);
      if (existing.get("previewToken") !== token)
        throw new ApiException("IDEMPOTENCY_CONFLICT", 409);
      return;
    }
    if (preview.expiresAt < Date.now())
      throw new ApiException(
        "PREVIEW_EXPIRED",
        409,
        "Preview expired. Review the price again.",
      );
    const r = await readAmendment(tx, uid, bookingId, preview.input);
    if (r.fingerprint !== preview.fingerprint)
      throw new ApiException(
        "QUOTE_CHANGED",
        409,
        "Booking or rates changed. Review a fresh price before saving.",
      );
    const writePhysical = r.b.physicalUnitId
      ? await assignPhysical(
          tx,
          bookingId,
          { ...r.b, ...r.patch },
          r.b.roomType.id === preview.input.roomTypeId
            ? r.b.physicalUnitId
            : null,
        )
      : null;
    const unitPatch = writePhysical?.() ?? {};
    writeAllocation(
      tx,
      r.b.propertyId,
      r.hold.roomTypeId,
      r.oldAllocations,
      -1,
    );
    writeAllocation(
      tx,
      r.b.propertyId,
      preview.input.roomTypeId,
      r.newAllocations,
      1,
    );
    tx.update(adminDb.collection("inventoryHolds").doc(bookingId), {
      roomTypeId: preview.input.roomTypeId,
      allocations: r.newAllocations,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const quoteSnapshot = { ...r.b.quoteSnapshot, ...r.patch };
    tx.update(ref, {
      ...r.patch,
      ...unitPatch,
      originalQuoteSnapshot:
        r.b.originalQuoteSnapshot ?? r.b.quoteSnapshot ?? null,
      quoteSnapshot,
      reservationRevision: (r.b.reservationRevision ?? 0) + 1,
      stayRevision: (r.b.stayRevision ?? 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    });
    tx.create(ref.collection("events").doc(eventId), {
      type: "reservation_amended",
      actorId: uid,
      createdAt: FieldValue.serverTimestamp(),
      previous: safeData(r.b),
      revised: r.patch,
      previewToken: token,
    });
    // Distinct event ID permits multiple amendments while preserving retry idempotency.
    tx.create(
      adminDb
        .collection("bookingNotificationOutbox")
        .doc(`${bookingId}_${eventId}`),
      {
        bookingId,
        propertyId: r.b.propertyId,
        guestId: r.b.guestId || "",
        bookingStatus: "amended",
        status: "pending",
        attempts: 0,
        nextAttemptAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
    );
  });
  await invalidatePublic("search:*");
  return { ok: true };
}
