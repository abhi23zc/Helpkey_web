import { stayFinancials } from "@/lib/stay/domain";
import "server-only";
import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { customerOwnsBooking } from "../customer-access";
import { todayTransaction } from "@/lib/partner/today/cache";
import { invalidatePublic } from "@/lib/api/cache";
import { writeAllocation } from "../inventory";
import { assignPhysical } from "@/lib/partner/reservations/physical";
import {
  editBlocker,
  canInitializeEditPolicy,
  guestPatch,
  guestSearchTokens,
  guestSchema,
  proposalSchema,
  validateOccupants,
  type Proposal,
  type EditPolicy,
  snapshotPolicy,
} from "./domain";
import { prepareProposal, digest, fail } from "./engine";
import { prepareAmendmentAgreement } from "./finance";
import type { RecordData } from "@/lib/partner/dashboard/domain";

export const bookingRef = (id: string) => {
  if (!id || id.includes("/") || id.length > 200) fail("NOT_FOUND");
  return adminDb.collection("bookings").doc(id);
};
export const amendmentRef = (id: string, amendment: string) => {
  if (!/^[a-f0-9]{64}$/.test(amendment)) fail("NOT_FOUND");
  return bookingRef(id).collection("amendments").doc(amendment);
};
export function owner(
  b: RecordData | undefined,
  uid: string,
): asserts b is RecordData {
  if (!b || !customerOwnsBooking(b, uid)) fail("NOT_FOUND");
}
function assertOpen(b: RecordData, names = false) {
  const code = editBlocker(b, Date.now(), names);
  if (code) fail(code);
}
async function ensureEditPolicy(uid: string, id: string) {
  return adminDb.runTransaction(async (tx) => {
    const ref = bookingRef(id);
    const b = (await tx.get(ref)).data();
    owner(b, uid);
    if (b.editPolicy?.version === 1) return b;
    if (!canInitializeEditPolicy(b)) return b;
    const [propertySnap, rateSnap] = await Promise.all([
      tx.get(adminDb.collection("properties").doc(b.propertyId)),
      tx.get(adminDb.collection("ratePlans").doc(b.ratePlan.id)),
    ]);
    const rate = rateSnap.data();
    // A legacy record may refer to a deleted rate plan.  Do not invent a
    // replacement package; it can still be handled by hotel support.
    if (!rate || rate.propertyId !== b.propertyId) return b;
    const policy = snapshotPolicy(
      b,
      propertySnap.data() ?? {},
      rate,
      b.expiresAt?.toDate?.().toISOString?.() ?? null,
    );
    tx.update(ref, {
      editPolicy: policy,
      checkoutRevision: b.checkoutRevision ?? 0,
      reservationRevision: b.reservationRevision ?? 0,
      occupants: Array.isArray(b.occupants)
        ? b.occupants
        : (b.leadGuest?.adultGuestNames ?? [b.leadGuest?.name])
            .filter((name: unknown): name is string => typeof name === "string")
            .map((name: string) => ({ name, ageGroup: "adult" })),
      bookingContact: b.bookingContact ?? {
        name: b.leadGuest?.name ?? "Guest",
        email: b.leadGuest?.email ?? "",
        phone: b.leadGuest?.phone ?? "",
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ...b, editPolicy: policy };
  });
}
export function publicAttempt(a: RecordData) {
  return {
    id: a.id,
    status: a.status,
    expiresAt: a.expiresAt?.toDate?.().toISOString() ?? null,
    amountToCollectPaise: a.amountToCollectPaise,
    currency: a.currency,
    outcomeCode: a.outcomeCode ?? null,
    checkoutReplaced: a.checkoutReplaced ?? false,
  };
}
export async function readAttempt(uid: string, id: string, amendment: string) {
  const b = (await bookingRef(id).get()).data();
  owner(b, uid);
  const a = (await amendmentRef(id, amendment).get()).data();
  if (!a) fail("NOT_FOUND");
  const refunds = await adminDb
    .collection("refunds")
    .where("bookingId", "==", id)
    .get();
  return {
    amendment: publicAttempt(a),
    refunds: refunds.docs
      .filter((d) => d.get("amendmentId") === amendment)
      .map((d) => ({
        status: d.get("status"),
        amountPaise: d.get("amountPaise"),
      })),
  };
}
export async function editOptions(uid: string, id: string) {
  const b = await ensureEditPolicy(uid, id);
  owner(b, uid);
  const policy = b.editPolicy as EditPolicy | undefined;
  const property =
    (await adminDb.collection("properties").doc(b.propertyId).get()).data() ??
    {};
  const blocker = editBlocker(b, Date.now());
  const ids = policy
    ? [...new Set([policy.originalRatePlanId, ...policy.equivalentRatePlanIds])]
    : [];
  const rates = ids.length
    ? await adminDb.getAll(
        ...ids.map((r) => adminDb.collection("ratePlans").doc(r)),
      )
    : [];
  const roomIds = [
    ...new Set(
      rates
        .filter((r) => r.get("propertyId") === b.propertyId)
        .map((r) => r.get("roomTypeId")),
    ),
  ].filter(Boolean) as string[];
  const rooms = roomIds.length
    ? await adminDb.getAll(
        ...roomIds.map((r) => adminDb.collection("roomTypes").doc(r)),
      )
    : [];
  const attempt = b.activeAmendmentId
    ? (await amendmentRef(id, b.activeAmendmentId).get()).data()
    : null;
  const recent =
    b.lastAmendmentId && b.lastAmendmentId !== b.activeAmendmentId
      ? (await amendmentRef(id, b.lastAmendmentId).get()).data()
      : null;
  const refunds = await adminDb
    .collection("refunds")
    .where("bookingId", "==", id)
    .get();
  return {
    recent: recent ? publicAttempt(recent) : null,
    paymentReplacementRequired: b.checkoutNeedsReplacement === true,
    refunds: refunds.docs.map((d) => ({
      status: d.get("status"),
      amountPaise: d.get("amountPaise"),
    })),
    enabled: policy?.version === 1,
    canEditStay: !blocker && !attempt,
    canEditGuests:
      !editBlocker(b, Date.now(), true) &&
      !attempt,
    blocker:
      blocker ??
      (attempt ? "AMENDMENT_ACTIVE" : null),
    revision: b.reservationRevision ?? 0,
    stayRevision: b.stayRevision ?? 0,
    timezone: b.timezone ?? "Asia/Kolkata",
    stayDeadline: policy
      ? new Date(
          Date.parse(b.startAt) - policy.cutoffHours * 3600000,
        ).toISOString()
      : null,
    guestDeadline: b.startAt,
    cancellationDeadline: policy?.cancellationDeadline ?? null,
    hotelContact: {
      phone:
        property.customerEditing?.reservationsPhone ??
        property.publicPhone ??
        property.phone ??
        null,
      email: property.publicEmail ?? property.email ?? null,
    },
    packages: rates
      .filter(
        (r) =>
          r.get("propertyId") === b.propertyId &&
          r.get("status") === "active" &&
          (r.get("bookingMode") ?? "overnight") === b.bookingMode,
      )
      .flatMap((r) => {
        const room = rooms.find(
          (d) =>
            d.id === r.get("roomTypeId") &&
            d.get("status") === "active" &&
            d.get("propertyId") === b.propertyId,
        );
        return room
          ? [
              {
                ratePlanId: r.id,
                roomTypeId: room.id,
                name: r.get("name"),
                roomName: room.get("name"),
                maxAdults: room.get("maxAdults") ?? 1,
                maxChildren: room.get("maxChildren") ?? 0,
                maxInfants: room.get("maxInfants") ?? 10,
              },
            ]
          : [];
      }),
    current: {
      bookingMode: b.bookingMode,
      roomTypeId: b.roomType.id,
      ratePlanId: b.ratePlan.id,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      arrivalTime: b.arrivalTime,
      durationMinutes: b.durationMinutes,
      adults: b.adults,
      children: b.children,
      infants: b.infants ?? 0,
      occupants:
        b.occupants?.length === b.adults + (b.children ?? 0) + (b.infants ?? 0)
          ? b.occupants
          : [
              ...(b.leadGuest?.adultGuestNames ?? [b.leadGuest?.name]).map(
                (name: string) => ({ name, ageGroup: "adult" }),
              ),
              ...Array.from({ length: b.children ?? 0 }, () => ({
                name: "",
                ageGroup: "child",
              })),
              ...Array.from({ length: b.infants ?? 0 }, () => ({
                name: "",
                ageGroup: "infant",
              })),
            ],
      bookingContact: b.bookingContact ?? {
        name: b.leadGuest.name,
        email: b.leadGuest.email,
        phone: b.leadGuest.phone,
      },
      totalPaise: b.roomTotalPaise ?? b.totalPaise,
    },
    active: attempt ? publicAttempt(attempt) : null,
  };
}
export async function quoteAmendment(uid: string, id: string, raw: unknown) {
  const input = proposalSchema.parse(raw);
  return adminDb.runTransaction(async (tx) => {
    const b = (await tx.get(bookingRef(id))).data();
    owner(b, uid);
    assertOpen(b);
    if (b.activeAmendmentId) fail("AMENDMENT_ACTIVE");
    const result = await prepareProposal(tx, id, b, input);
    const quoteId = randomUUID();
    const expiresAt = Timestamp.fromMillis(Date.now() + 300000);
    tx.create(bookingRef(id).collection("editQuotes").doc(quoteId), {
      input,
      uid,
      revision: b.reservationRevision ?? 0,
      baseBookingStatus: b.bookingStatus,
      stayRevision: b.stayRevision ?? 0,
      expiresAt,
      ...result,
    });
    return {
      quoteId,
      expiresAt: expiresAt.toDate().toISOString(),
      proposalFingerprint: result.proposalFingerprint,
      published: result.published,
      accepted: result.accepted,
      retainedDifferencePaise: result.retainedDifferencePaise,
      creditPaise: result.creditPaise,
      amountToCollectPaise: result.amountToCollectPaise,
      hotelBalancePaise: result.hotelBalancePaise,
      serviceImpacts: result.serviceImpacts,
      serviceBalances: result.serviceBalances,
      currency: result.currency,
      changedInclusions: {
        previous: b.amenitySnapshot ?? null,
        proposed: result.patch.amenitySnapshot,
      },
      previous: {
        startAt: b.startAt,
        endAt: b.endAt,
        roomName: b.roomType.name,
        totalPaise: b.roomTotalPaise ?? b.totalPaise,
      },
      proposed: {
        startAt: result.patch.startAt,
        endAt: result.patch.endAt,
        roomName: result.patch.roomType.name,
      },
      cancellationDeadline: result.patch.editPolicy.cancellationDeadline,
    };
  });
}
export async function prepareApplication(
  tx: FirebaseFirestore.Transaction,
  id: string,
  a: RecordData,
  b: RecordData,
  extraPaid = 0,
  replacement = false,
) {
  if (
    (b.reservationRevision ?? 0) !== a.revision ||
    (b.stayRevision ?? 0) !== a.stayRevision
  )
    fail("REVISION_CONFLICT");
  assertOpen(b);
  const r = await prepareProposal(tx, id, b, a.input as Proposal, a, a);
  if (r.serviceImpacts.some((s) => !s.approved)) fail("SERVICE_CONFLICT");
  const physical = b.physicalUnitId
    ? await assignPhysical(
        tx,
        id,
        { ...b, ...r.patch },
        b.roomType.id === r.patch.roomType.id ? b.physicalUnitId : null,
      )
    : null;
  const revised = {
    ...b,
    ...r.patch,
    accommodationRevision: a.id,
    paidPaise: (b.paidPaise ?? 0) + extraPaid,
    balanceDuePaise: Math.max(
      0,
      r.accepted.totalPaise - r.creditPaise - extraPaid,
    ),
  };
  const finance = await prepareAmendmentAgreement(tx, id, a.id, b, revised);
  return () => {
    finance();
    // Original + additional are currently reserved. Release only original-only slots.
    const retainedKeys = new Set(
      r.proposedAllocations.flatMap((v) =>
        v.intervals.map((k) => `${v.date}:${k}`),
      ),
    );
    const release = r.originalAllocations
      .map((v: { date: string; intervals: string[] }) => ({
        date: v.date,
        intervals:
          b.roomType.id === r.patch.roomType.id
            ? v.intervals.filter((k) => !retainedKeys.has(`${v.date}:${k}`))
            : v.intervals,
      }))
      .filter((v: { intervals: string[] }) => v.intervals.length);
    writeAllocation(tx, b.propertyId, b.roomType.id, release, -1);
    if (!a.inventoryReserved)
      writeAllocation(
        tx,
        b.propertyId,
        r.patch.roomType.id,
        r.additionalAllocations,
        1,
      );
    tx.update(adminDb.collection("inventoryHolds").doc(id), {
      roomTypeId: r.patch.roomType.id,
      allocations: r.proposedAllocations,
      updatedAt: FieldValue.serverTimestamp(),
    });
    revised.balanceDuePaise = stayFinancials(revised).balanceDuePaise;
    const patch = {
      ...r.patch,
      ...(physical ? physical() : {}),
      searchTokens: guestSearchTokens(b, a.input, r.patch.roomType.name),
      accommodationRevision: a.id,
      originalQuoteSnapshot: b.originalQuoteSnapshot ?? b.quoteSnapshot ?? null,
      quoteSnapshot: { ...b.quoteSnapshot, ...r.patch },
      reservationRevision: (b.reservationRevision ?? 0) + 1,
      stayRevision: (b.stayRevision ?? 0) + 1,
      activeAmendmentId: null,
      amendmentPending: false,
      lastAmendmentId: a.id,
      paidPaise: revised.paidPaise,
      balanceDuePaise: revised.balanceDuePaise,
      ...(replacement
        ? {}
        : {
            paymentStatus:
              revised.paidPaise >= revised.totalPaise
                ? "paid"
                : revised.paidPaise > 0
                  ? "partially_paid"
                  : "pay_at_property",
          }),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: a.uid,
    };
    tx.update(bookingRef(id), patch);
    tx.update(amendmentRef(id, a.id), {
      status: "applied",
      inventoryReserved: false,
      appliedAt: FieldValue.serverTimestamp(),
      checkoutReplaced: replacement,
    });
    tx.create(bookingRef(id).collection("events").doc(`amendment_${a.id}`), {
      type: "customer_amendment_applied",
      amendmentId: a.id,
      agreementRevision: a.id,
      actorId: a.uid,
      previous: {
        startAt: b.startAt,
        endAt: b.endAt,
        roomType: b.roomType,
        totalPaise: b.totalPaise,
      },
      createdAt: FieldValue.serverTimestamp(),
    });
    const message = `HelpKey booking ${b.confirmationCode} updated: ${r.patch.roomType.name}, ${r.patch.checkIn} ${r.patch.arrivalTime} to ${r.patch.checkOut} ${r.patch.departureTime}. Accommodation total ${(r.accepted.totalPaise / 100).toFixed(2)} ${b.currency}.`;
    tx.create(
      adminDb.collection("bookingNotificationOutbox").doc(`${id}_${a.id}`),
      {
        bookingId: id,
        propertyId: b.propertyId,
        guestId: b.guestId,
        bookingStatus: "amended",
        amendmentId: a.id,
        message,
        customerPhone: a.input.bookingContact.phone,
        hotelPhone: r.hotelReservationsPhone,
        status: "pending",
        attempts: 0,
        nextAttemptAt: Timestamp.now(),
        createdAt: FieldValue.serverTimestamp(),
      },
    );
  };
}
export async function createAmendment(
  uid: string,
  id: string,
  raw: unknown,
  key: string,
) {
  const { quoteId } = z
    .object({ quoteId: z.string().uuid() })
    .strict()
    .parse(raw);
  if (!key || key.length > 180) fail("IDEMPOTENCY_KEY_REQUIRED");
  const aid = digest([uid, id, key]);
  // Reconciliation is deliberately outside the Firestore transaction.
  const first = (await bookingRef(id).get()).data();
  owner(first, uid);
  const replay = await amendmentRef(id, aid).get();
  if (replay.exists) {
    if (replay.get("quoteId") !== quoteId) fail("IDEMPOTENCY_CONFLICT");
    return publicAttempt(replay.data()!);
  }
  if (first.bookingStatus === "pending_payment") {
    const { reconcilePaymentForGuest } = await import("../recovery");
    const check = await reconcilePaymentForGuest(uid, id);
    if (check.bookingStatus === "confirmed")
      fail("BOOKING_CONFIRMED_REVIEW_REQUIRED");
    if (!check.paymentEligible && !check.replacementEligible)
      fail("PAYMENT_UNRESOLVED", "Payment verification in progress.");
  }
  const result = await todayTransaction(async (tx, changed) => {
    const b = (await tx.get(bookingRef(id))).data();
    owner(b, uid);
    changed(b.propertyId);
    const previous = await tx.get(amendmentRef(id, aid));
    if (previous.exists) {
      if (previous.get("quoteId") !== quoteId) fail("IDEMPOTENCY_CONFLICT");
      return publicAttempt(previous.data()!);
    }
    assertOpen(b);
    if (b.activeAmendmentId) fail("AMENDMENT_ACTIVE");
    const q = (
      await tx.get(bookingRef(id).collection("editQuotes").doc(quoteId))
    ).data();
    if (!q || q.uid !== uid || q.expiresAt.toMillis() <= Date.now())
      fail("PREVIEW_EXPIRED");
    if (q.baseBookingStatus !== b.bookingStatus)
      fail(
        q.baseBookingStatus === "pending_payment" &&
          b.bookingStatus === "confirmed"
          ? "BOOKING_CONFIRMED_REVIEW_REQUIRED"
          : "REVISION_CONFLICT",
      );
    if (
      (b.reservationRevision ?? 0) !== q.revision ||
      (b.stayRevision ?? 0) !== q.stayRevision
    )
      fail("REVISION_CONFLICT");
    const r = await prepareProposal(tx, id, b, q.input);
    if (
      r.priceFingerprint !== q.priceFingerprint ||
      digest(r.accepted) !== digest(q.accepted) ||
      r.creditPaise !== q.creditPaise ||
      r.amountToCollectPaise !== q.amountToCollectPaise
    )
      fail("QUOTE_CHANGED");
    if (r.serviceImpacts.some((s) => !s.approved)) fail("SERVICE_CONFLICT");
    const pending = b.bookingStatus === "pending_payment";
    if (
      pending &&
      (b.checkoutAttempt || b.checkoutReplacement)
    )
      fail("PAYMENT_UNRESOLVED");
    const deadline = Date.parse(b.startAt) - b.editPolicy.cutoffHours * 3600000;
    const expiresAt = Timestamp.fromMillis(
      Math.min(
        Date.now() + 600000,
        Date.parse(r.patch.startAt),
        deadline,
        pending ? b.expiresAt.toMillis() : Infinity,
      ),
    );
    const a = {
      ...r,
      id: aid,
      bookingId: id,
      propertyId: b.propertyId,
      uid,
      quoteId,
      input: q.input,
      revision: q.revision,
      stayRevision: q.stayRevision,
      status: pending
        ? "preparing"
        : r.amountToCollectPaise > 0
          ? "awaiting_payment"
          : "applied",
      kind: pending ? "replacement" : "confirmed",
      baseCheckoutRevision: b.checkoutRevision ?? 0,
      expiresAt,
      inventoryReserved: pending || r.amountToCollectPaise > 0,
      createdAt: Timestamp.now(),
    };
    const apply =
      !pending && !r.amountToCollectPaise
        ? await prepareApplication(
            tx,
            id,
            { ...a, inventoryReserved: false },
            b,
          )
        : null;
    tx.create(amendmentRef(id, aid), a);
    tx.create(amendmentRef(id, aid).collection("events").doc("created"), {
      type: "created",
      actorId: uid,
      revision: a.revision,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (apply) apply();
    else {
      writeAllocation(
        tx,
        b.propertyId,
        q.input.roomTypeId,
        r.additionalAllocations,
        1,
      );
      tx.update(bookingRef(id), {
        activeAmendmentId: aid,
        amendmentPending: true,
        amendmentExpiresAt: expiresAt,
        lastAmendmentId: aid,
        ...(pending
          ? {
              checkoutReplacement: {
                amendmentId: aid,
                baseCheckoutRevision: b.checkoutRevision ?? 0,
              },
            }
          : {}),
        paymentReconciliationPending: true,
        nextReconcileAt: Timestamp.now(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return publicAttempt(a);
  });
  await invalidatePublic("search:*");
  if (result.status === "preparing") {
    const { prepareReplacement } = await import("./payments");
    await prepareReplacement(id, aid);
    return (await readAttempt(uid, id, aid)).amendment;
  }
  return result;
}
export function releaseAttempt(
  tx: FirebaseFirestore.Transaction,
  id: string,
  a: RecordData,
  b: RecordData,
  status: string,
  outcomeCode: string,
) {
  if (
    a.inventoryReserved &&
    !["applied", "cancelled", "expired", "failed"].includes(a.status)
  )
    writeAllocation(
      tx,
      b.propertyId,
      a.input.roomTypeId,
      a.additionalAllocations,
      -1,
    );
  tx.create(amendmentRef(id, a.id).collection("events").doc("closed"), {
    type: status,
    outcomeCode,
    createdAt: FieldValue.serverTimestamp(),
  });
  tx.update(amendmentRef(id, a.id), {
    status,
    outcomeCode,
    inventoryReserved: false,
    finishedAt: FieldValue.serverTimestamp(),
  });
  if (b.activeAmendmentId === a.id)
    tx.update(bookingRef(id), {
      activeAmendmentId: null,
      checkoutReplacement: null,
      amendmentPending: false,
      paymentReconciliationPending:
        b.bookingStatus === "pending_payment" || !!a.orderCreationStartedAt,
      amendmentRecoveryPending: !!a.orderCreationStartedAt,
      updatedAt: FieldValue.serverTimestamp(),
    });
}
export async function cancelAttempt(uid: string, id: string, aid: string) {
  return todayTransaction(async (tx, changed) => {
    const b = (await tx.get(bookingRef(id))).data();
    owner(b, uid);
    changed(b.propertyId);
    const a = (await tx.get(amendmentRef(id, aid))).data();
    if (!a) fail("NOT_FOUND");
    if (["applied", "cancelled", "expired", "failed"].includes(a.status))
      return { amendment: publicAttempt(a) };
    if (a.orderCreationStartedAt && !a.orderId) fail("PAYMENT_UNRESOLVED");
    releaseAttempt(tx, id, a, b, "cancelled", "CUSTOMER_CANCELLED");
    return { amendment: publicAttempt({ ...a, status: "cancelled" }) };
  });
}
export async function patchGuests(uid: string, id: string, raw: unknown) {
  const input = guestSchema
    .extend({
      revision: z.number().int().nonnegative(),
      stayRevision: z.number().int().nonnegative(),
    })
    .strict()
    .parse(raw);
  await todayTransaction(async (tx, changed) => {
    const b = (await tx.get(bookingRef(id))).data();
    owner(b, uid);
    assertOpen(b, true);
    changed(b.propertyId);
    if (b.activeAmendmentId) fail("AMENDMENT_ACTIVE");
    if (
      (b.reservationRevision ?? 0) !== input.revision ||
      (b.stayRevision ?? 0) !== input.stayRevision
    )
      fail("REVISION_CONFLICT");
    validateOccupants({
      ...input,
      adults: b.adults,
      children: b.children,
      infants: b.infants ?? 0,
    });
    const property = (
      await tx.get(adminDb.collection("properties").doc(b.propertyId))
    ).data();
    tx.update(bookingRef(id), {
      ...guestPatch(b, input),
      searchTokens: guestSearchTokens(b, input, b.roomType.name),
      reservationRevision: input.revision + 1,
      stayRevision: input.stayRevision + 1,
      "preCheckin.guestsConfirmedAt": null,
      "preCheckin.status": "incomplete",
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(bookingRef(id).collection("events").doc(), {
      type: "customer_guest_details_updated",
      actorId: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.create(
      adminDb
        .collection("bookingNotificationOutbox")
        .doc(`${id}_guests_${input.revision + 1}`),
      {
        bookingId: id,
        propertyId: b.propertyId,
        guestId: b.guestId,
        bookingStatus: "guest_details_updated",
        message: `HelpKey booking ${b.confirmationCode}: guest and reservation contact details updated.`,
        customerPhone: input.bookingContact.phone,
        hotelPhone: property?.customerEditing?.reservationsPhone ?? null,
        status: "pending",
        attempts: 0,
        nextAttemptAt: Timestamp.now(),
        createdAt: FieldValue.serverTimestamp(),
      },
    );
  });
  return { ok: true };
}

/** Independent inventory cleanup: never waits on payments, providers, or feature flags. */
export async function expireAmendments(bookingId?: string) {
  const docs = bookingId
    ? [await bookingRef(bookingId).get()]
    : (
        await adminDb
          .collection("bookings")
          .where("amendmentPending", "==", true)
          .where("amendmentExpiresAt", "<=", Timestamp.now())
          .limit(25)
          .get()
      ).docs;
  const failures: string[] = [];
  for (const doc of docs) {
    try {
      await todayTransaction(async (tx, changed) => {
        const b = (await tx.get(doc.ref)).data();
        if (!b?.activeAmendmentId) return;
        const a = (
          await tx.get(amendmentRef(doc.id, b.activeAmendmentId))
        ).data();
        if (!a) fail("AMENDMENT_RECORD_MISSING");
        if (
          a.expiresAt.toMillis() <= Date.now() ||
          !["confirmed", "pending_payment"].includes(b.bookingStatus) ||
          b.actualCheckInAt
        ) {
          changed(b.propertyId);
          releaseAttempt(tx, doc.id, a, b, "expired", "AMENDMENT_EXPIRED");
        }
      });
    } catch {
      failures.push(doc.id);
    }
  }
  return {
    examined: docs.length,
    failures,
    hasMore: !bookingId && docs.length === 25,
  };
}
