import { mergeVariantPrices, variantPrice } from "./pricing";
import "server-only";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import {
  offeringSchema,
  selectionsSchema,
  travelerPreferencesSchema,
  type StayRequest,
} from "./contracts";
import { readOffering, offeringsFor } from "./catalog";
import {
  assertRequestTransition,
  canEditRequest,
  eligibleOffering,
  selectedRequests,
} from "./domain";
import { localParts, resolveLocal } from "@/lib/booking/domain";
import { propertyOwner, requireRole } from "@/lib/partner/service";
import { enqueueStayNotification } from "./notifications";

export async function saveOffering(
  uid: string,
  propertyId: string,
  raw: unknown,
) {
  await propertyOwner(uid, propertyId);
  const { id, version, offering } = z
    .object({
      id: z
        .string()
        .regex(/^[^/]{1,180}$/)
        .optional(),
      version: z.number().int().nonnegative().optional(),
      offering: offeringSchema,
    })
    .strict()
    .parse(raw);
  const ref = adminDb
    .collection("properties")
    .doc(propertyId)
    .collection("stayCustomizations")
    .doc(id ?? crypto.randomUUID());
  await adminDb.runTransaction(async (tx) => {
    const old = await tx.get(ref);
    const membership = await tx.get(
      adminDb.collection("propertyMemberships").doc(`${propertyId}_${uid}`),
    );
    if (
      membership.get("status") !== "active" ||
      membership.get("role") !== "owner"
    )
      throw new Error("FORBIDDEN");
    const rooms = await Promise.all(
      offering.roomTypeIds.map((id) =>
        tx.get(adminDb.collection("roomTypes").doc(id)),
      ),
    );
    if (rooms.some((r) => !r.exists || r.get("propertyId") !== propertyId))
      throw new Error("Choose room types belonging to this hotel.");
    if (id && (!old.exists || old.get("version") !== version))
      throw new Error("CONFLICT");
    const previous = old.exists
      ? (readOffering(old.id, old.data()!) ?? undefined)
      : undefined;
    const saved = offeringSchema.parse(mergeVariantPrices(offering, previous));
    tx.set(ref, {
      ...saved,
      category:
        saved.category ??
        previous?.category ??
        (saved.kind === "preference" ? "room_preferences" : "other"),
      propertyId,
      version: (old.get("version") ?? 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
      ...(!old.exists
        ? { createdAt: FieldValue.serverTimestamp(), createdBy: uid }
        : {}),
    });
  });
  return ref.id;
}
// Older reservations may predate explicit UTC stay bounds.
function bookingBounds(b: FirebaseFirestore.DocumentData) {
  const timezone = b.timezone ?? "Asia/Kolkata";
  try {
    return {
      startAt:
        b.startAt ??
        new Date(
          resolveLocal(
            b.checkIn,
            b.arrivalTime ?? b.checkInTime ?? "14:00",
            timezone,
          ),
        ).toISOString(),
      endAt:
        b.endAt ??
        new Date(
          resolveLocal(
            b.checkOut,
            b.departureTime ?? b.checkOutTime ?? "11:00",
            timezone,
          ),
        ).toISOString(),
    };
  } catch {
    return null;
  }
}
export async function guestStayOptions(uid: string, bookingId: string) {
  const doc = await adminDb.collection("bookings").doc(bookingId).get();
  const b = doc.data();
  if (!b || b.guestId !== uid) throw new Error("NOT_FOUND");
  const bounds = bookingBounds(b);
  const open =
    b.bookingStatus === "confirmed" &&
    Boolean(bounds && Date.now() < Date.parse(bounds.endAt));
  const property = await adminDb
    .collection("properties")
    .doc(b.propertyId)
    .get();
  const available =
    open && property.get("status") === "active"
      ? (await offeringsFor(b.propertyId)).filter(
          (o) =>
            (o.variants.length
              ? o.variants.some((v) => variantPrice(o, v.id) === 0)
              : o.unitPricePaise === 0) &&
            eligibleOffering(
              o,
              b.roomType.id,
              b.bookingMode ?? "overnight",
              bounds!.startAt,
            ),
        )
      : [];
  return {
    offerings: available,
    startAt: bounds?.startAt ?? null,
    editable: open,
    serverNow: new Date().toISOString(),
  };
}
const preCheckinInput = z
  .object({
    revision: z.number().int().nonnegative(),
    expectedArrivalLocal: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      .nullable(),
    notes: z.string().trim().max(1000),
    travelerPreferences: travelerPreferencesSchema,
    selections: selectionsSchema,
    submit: z.boolean(),
    guestsReviewed: z.boolean(),
  })
  .strict();

export async function savePreCheckin(
  uid: string,
  bookingId: string,
  raw: unknown,
) {
  const input = preCheckinInput.parse(raw);
  const ref = adminDb.collection("bookings").doc(bookingId);
  await adminDb.runTransaction(async (tx) => {
    const b = (await tx.get(ref)).data();
    if (!b || b.guestId !== uid) throw new Error("NOT_FOUND");
    if ((b.stayRevision ?? 0) !== input.revision) throw new Error("CONFLICT");
    const now = Date.now();
    const bounds = bookingBounds(b);
    if (
      b.bookingStatus !== "confirmed" ||
      !bounds ||
      now >= Date.parse(bounds.endAt)
    )
      throw new Error(
        "Pre check-in is closed. Contact the hotel for assistance.",
      );
    let expectedArrivalAt: string | null = null;
    if (input.expectedArrivalLocal) {
      const [date, time] = input.expectedArrivalLocal.split("T");
      const arrival = resolveLocal(date, time, b.timezone ?? "Asia/Kolkata");
      if (
        !Number.isFinite(arrival) ||
        localParts(arrival, b.timezone ?? "Asia/Kolkata").date !== date ||
        arrival >= Date.parse(bounds.endAt) ||
        date < b.checkIn ||
        arrival < now
      )
        throw new Error(
          "Choose an upcoming arrival time before your booked departure.",
        );
      expectedArrivalAt = new Date(arrival).toISOString();
    }
    if (input.submit && (!expectedArrivalAt || !input.guestsReviewed))
      throw new Error(
        "Review your guest information and provide your expected arrival time.",
      );
    const old = (b.customizations ?? []) as StayRequest[];
    const propertyRef = adminDb.collection("properties").doc(b.propertyId);
    const property = await tx.get(propertyRef);
    const catalog = await tx.get(propertyRef.collection("stayCustomizations"));
    const offerings = catalog.docs.flatMap((d) => {
      const o = readOffering(d.id, d.data());
      return o ? [o] : [];
    });
    const desired = [...input.selections];
    const next: StayRequest[] = [];
    for (const r of old) {
      if (
        r.unitPricePaise > 0 ||
        ["cancelled", "declined", "fulfilled"].includes(r.status)
      ) {
        next.push(r);
        continue;
      }
      const index = desired.findIndex(
        (s) => s.offeringId === r.offeringId && s.variantId === r.variantId,
      );
      const selected = index >= 0 ? desired.splice(index, 1)[0] : null;
      if (selected?.quantity === r.quantity) {
        next.push(r);
        continue;
      }
      if (!canEditRequest(r, now))
        throw new Error(
          `${r.name} can no longer be changed here. Contact the hotel for assistance.`,
        );
      if (!selected) {
        next.push({
          ...r,
          status: "cancelled",
          updatedAt: new Date(now).toISOString(),
        });
        continue;
      }
      if (selected.quantity > r.maxQuantity)
        throw new Error(`Choose at most ${r.maxQuantity} for ${r.name}.`);
      if (selected.quantity > r.quantity) {
        const o = offerings.find((o) => o.id === r.offeringId);
        if (
          !o ||
          property.get("status") !== "active" ||
          variantPrice(o, r.variantId) !== 0 ||
          (r.variantId !== null &&
            !o.variants.some((v) => v.id === r.variantId)) ||
          (r.variantId === null && o.variants.length > 0) ||
          !eligibleOffering(
            o,
            b.roomType.id,
            b.bookingMode ?? "overnight",
            bounds.startAt,
            now,
          ) ||
          selected.quantity > o.maxQuantity
        )
          throw new Error(
            "This offering is no longer available for an increase.",
          );
      }
      next.push({
        ...r,
        quantity: selected.quantity,
        status: r.confirmation === "approval" ? "requested" : "confirmed",
        response: null,
        updatedAt: new Date(now).toISOString(),
      });
    }
    if (
      desired.some((s) =>
        old.some(
          (r) =>
            r.offeringId === s.offeringId &&
            (r.preparationStarted ||
              (r.unitPricePaise > 0 && r.variantId === s.variantId) ||
              r.status === "declined"),
        ),
      )
    )
      throw new Error("Contact the hotel to change this request.");
    if (desired.length && property.get("status") !== "active")
      throw new Error(
        "The hotel is not accepting new requests. Contact the hotel for assistance.",
      );
    const added = selectedRequests(
      offerings,
      desired,
      b.roomType.id,
      b.bookingMode ?? "overnight",
      bounds.startAt,
      b.cancellationPolicy ?? null,
      now,
    );
    if (added.some((r) => r.unitPricePaise > 0))
      throw new Error("Paid extras cannot be added after booking.");
    next.push(
      ...added.map((r) => ({ ...r, id: `${r.id}:${input.revision + 1}` })),
    );
    if (next.length > 100)
      throw new Error("Contact the hotel for further request changes.");
    // Limit across variants, including retained commitments.
    for (const r of next.filter(
      (r) => !["declined", "cancelled"].includes(r.status),
    )) {
      const count = next
        .filter(
          (n) =>
            n.offeringId === r.offeringId &&
            !["declined", "cancelled"].includes(n.status),
        )
        .reduce((sum, n) => sum + n.quantity, 0);
      if (count > r.maxQuantity)
        throw new Error(`Choose at most ${r.maxQuantity} for ${r.name}.`);
    }
    const revision = input.revision + 1;
    tx.update(ref, {
      customizations: next,
      travelerPreferences: input.travelerPreferences,
      stayRevision: revision,
      preCheckin: {
        status: input.submit ? "submitted" : "incomplete",
        expectedArrivalAt,
        notes: input.notes,
        submittedAt: input.submit ? new Date(now).toISOString() : null,
      },
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    });
    tx.create(ref.collection("events").doc(), {
      type: input.submit ? "precheckin_submitted" : "arrival_details_updated",
      actorId: uid,
      revision,
      createdAt: FieldValue.serverTimestamp(),
    });
    enqueueStayNotification(
      tx,
      bookingId,
      b.propertyId,
      uid,
      revision,
      input.submit ? "precheckin_submitted" : "arrival_details_updated",
    );
  });
}
const transitionInput = z
  .object({
    revision: z.number().int().nonnegative(),
    requestId: z.string().min(1).max(1800),
    status: z.enum([
      "confirmed",
      "declined",
      "preparing",
      "ready",
      "fulfilled",
    ]),
    response: z.string().trim().max(1000).default(""),
  })
  .strict();
export async function updateStayRequest(
  uid: string,
  bookingId: string,
  raw: unknown,
) {
  await requireRole(uid, "partner");
  const input = transitionInput.parse(raw);
  const ref = adminDb.collection("bookings").doc(bookingId);
  await adminDb.runTransaction(async (tx) => {
    const b = (await tx.get(ref)).data();
    if (!b) throw new Error("NOT_FOUND");
    const member = await tx.get(
      adminDb.collection("propertyMemberships").doc(`${b.propertyId}_${uid}`),
    );
    if (member.get("status") !== "active") throw new Error("FORBIDDEN");
    if ((b.stayRevision ?? 0) !== input.revision) throw new Error("CONFLICT");
    if (!["confirmed", "checked_in"].includes(b.bookingStatus))
      throw new Error(
        "Requests can only be managed for confirmed or checked-in reservations.",
      );
    const requests = (b.customizations ?? []) as StayRequest[];
    const target = requests.find((r) => r.id === input.requestId);
    if (!target) throw new Error("NOT_FOUND");
    assertRequestTransition(target.status, input.status);
    if (input.status === "declined" && !input.response)
      throw new Error("Explain why this request is declined.");
    const credit = input.status === "declined" ? target.totalPaise : 0;
    const refund = credit > 0 && b.paymentMethod === "online" ? credit : 0;
    if (
      refund > 0 &&
      (!b.razorpayPaymentId ||
        refund >
          (b.paidPaise ?? 0) - (b.refundedPaise ?? 0) - (b.refundDuePaise ?? 0))
    )
      throw new Error(
        "Payment reconciliation is required before declining this paid request.",
      );
    const revision = input.revision + 1;
    if (refund)
      tx.create(
        adminDb
          .collection("refunds")
          .doc(
            `${bookingId}_stay_${createHash("sha256").update(target.id).digest("hex")}`,
          ),
        {
          bookingId,
          propertyId: b.propertyId,
          paymentId: b.razorpayPaymentId,
          amountPaise: refund,
          status: "pending",
          nextAttemptAt: FieldValue.serverTimestamp(),
          reason: "CUSTOMIZATION_DECLINED",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
      );
    tx.update(ref, {
      customizations: requests.map((r) =>
        r.id === target.id
          ? {
              ...r,
              status: input.status,
              preparationStarted:
                r.preparationStarted || input.status === "preparing",
              response: input.response || r.response,
              updatedAt: new Date().toISOString(),
            }
          : r,
      ),
      customizationCreditPaise: (b.customizationCreditPaise ?? 0) + credit,
      refundDuePaise: (b.refundDuePaise ?? 0) + refund,
      ...(refund ? { paymentStatus: "refund_pending" } : {}),
      stayRevision: revision,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    });
    tx.create(ref.collection("events").doc(), {
      type: "customization_updated",
      requestId: target.id,
      from: target.status,
      to: input.status,
      response: input.response,
      actorId: uid,
      revision,
      createdAt: FieldValue.serverTimestamp(),
    });
    enqueueStayNotification(
      tx,
      bookingId,
      b.propertyId,
      b.guestId,
      revision,
      "customization_updated",
    );
  });
}
