import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";
import { authorize, features } from "./access";
import { assignPhysical } from "./physical";
import { netBalance, operationInput, receiptRemaining } from "./domain";
import type { RecordData } from "@/lib/partner/dashboard/domain";

export function requireFeature(feature: keyof ReturnType<typeof features>) {
  if (!features()[feature])
    throw new ApiException(
      "FEATURE_UNAVAILABLE",
      409,
      "This feature has not been enabled for this environment.",
    );
}
export function safeData(data: RecordData): RecordData {
  const convert = (value: unknown): unknown => {
    if (
      value &&
      typeof value === "object" &&
      "toDate" in value &&
      typeof value.toDate === "function"
    )
      return value.toDate().toISOString();
    if (Array.isArray(value)) return value.map(convert);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, convert(v)]),
      );
    return value;
  };
  return convert(data) as RecordData;
}
export async function bookingOperations(
  uid: string,
  bookingId: string,
  before?: string,
) {
  const ref = adminDb.collection("bookings").doc(bookingId),
    b = (await ref.get()).data();
  if (!b) throw new ApiException("NOT_FOUND", 404, "Reservation not found.");
  await authorize(uid, b.propertyId);
  let query = ref.collection("events").orderBy("createdAt", "desc").limit(51);
  if (before) {
    const cursor = await ref.collection("events").doc(before).get();
    if (!cursor.exists) throw new ApiException("INVALID_CURSOR", 422);
    query = query.startAfter(cursor);
  }
  const [events, payments, online, refunds, units] = await Promise.all([
    query.get(),
    adminDb
      .collection("propertyPayments")
      .where("bookingId", "==", bookingId)
      .get(),
    adminDb
      .collection("paymentAttempts")
      .where("bookingId", "==", bookingId)
      .get(),
    adminDb.collection("refunds").where("bookingId", "==", bookingId).get(),
    adminDb
      .collection("physicalUnits")
      .where("propertyId", "==", b.propertyId)
      .get(),
  ]);
  const rows = (snap: FirebaseFirestore.QuerySnapshot) =>
    snap.docs.map(
      (d) =>
        ({ id: d.id, ...safeData(d.data()) }) as {
          id: string;
          stayQuote?: boolean;
        } & RecordData,
    );
  return {
    events: rows(events)
      .slice(0, 50)
      .map((event) => ({
        id: event.id,
        type: event.type ?? null,
        from: event.from ?? null,
        to: event.to ?? null,
        text: event.text ?? null,
        reason: event.reason ?? null,
        actorId: event.actorId ?? null,
        createdAt: event.createdAt ?? null,
        label: event.label ?? null,
        amountPaise:
          event.amountPaise ?? event.agreed?.quote?.amountPaise ?? null,
        response: event.response ?? event.agreed?.response ?? null,
        scope: event.agreed?.quote?.scope ?? null,
        requestTitle: event.agreed?.title ?? null,
        revised:
          event.type === "reservation_amended"
            ? {
                roomName: event.revised?.roomType?.name ?? null,
                startAt: event.revised?.startAt ?? null,
                endAt: event.revised?.endAt ?? null,
                totalPaise: event.revised?.totalPaise ?? null,
              }
            : null,
      })),
    nextEventCursor: events.size > 50 ? events.docs[49].id : null,
    payments: rows(payments),
    onlinePayments: rows(online).filter((p) => !p.stayQuote),
    refunds: rows(refunds).filter((p) => !p.stayQuote),
    units: rows(units),
    features: {
      ...features(),
      amendments: features().amendments && b.inventoryEngine === "interval_v1",
    },
    revision: b.reservationRevision ?? 0,
    assignedUnitId: b.physicalUnitId ?? null,
    assignedUnitLabel: b.physicalUnitLabel ?? null,
    refundExcessPaise: Math.max(
      0,
      (b.paidPaise ?? 0) -
        (b.refundedPaise ?? 0) -
        (b.refundDuePaise ?? 0) -
        (["cancelled", "no_show"].includes(b.bookingStatus)
          ? 0
          : Math.max(
              0,
              (b.totalPaise ?? 0) - (b.customizationCreditPaise ?? 0),
            )),
    ),
  };
}
export async function performOperation(
  uid: string,
  bookingId: string,
  raw: unknown,
  key: string,
) {
  const input = operationInput.parse(raw);
  if (!key || key.length > 180)
    throw new ApiException(
      "IDEMPOTENCY_KEY_REQUIRED",
      422,
      "A valid request key is required.",
    );
  if (input.action === "assign") requireFeature("allocation");
  if (["collect", "reverse", "refund"].includes(input.action))
    requireFeature("payments");
  const id = createHash("sha256")
    .update(`${uid}\0${bookingId}\0${key}`)
    .digest("hex");
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  return adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection("bookings").doc(bookingId),
      b = (await tx.get(ref)).data();
    if (!b) throw new ApiException("NOT_FOUND", 404);
    await authorize(uid, b.propertyId, tx);
    const eventRef = ref.collection("events").doc(id),
      previous = await tx.get(eventRef);
    if (previous.exists) {
      if (previous.get("fingerprint") !== fingerprint)
        throw new ApiException("IDEMPOTENCY_CONFLICT", 409);
      return { ok: true, id };
    }
    const event = {
      actorId: uid,
      createdAt: FieldValue.serverTimestamp(),
      fingerprint,
    };
    const patch: RecordData = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
      reservationRevision: (b.reservationRevision ?? 0) + 1,
    };
    if (input.action === "note") {
      tx.create(eventRef, { ...event, type: "staff_note", text: input.text });
    } else if (input.action === "assign") {
      if ((b.reservationRevision ?? 0) !== input.revision)
        throw new ApiException(
          "RESERVATION_CHANGED",
          409,
          "Reservation changed. Refresh and try again.",
        );
      if (!["confirmed", "checked_in"].includes(b.bookingStatus) || !b.startAt)
        throw new ApiException("ASSIGNMENT_NOT_ALLOWED", 409);
      const write = await assignPhysical(tx, bookingId, b, input.unitId);
      Object.assign(patch, write());
      tx.create(eventRef, {
        ...event,
        type: "room_assigned",
        unitId: patch.physicalUnitId,
        label: patch.physicalUnitLabel,
      });
    } else {
      const payments = await tx.get(
        adminDb
          .collection("propertyPayments")
          .where("bookingId", "==", bookingId),
      );
      const receipts = payments.docs.map(
        (d) => ({ ...d.data(), id: d.id }) as RecordData,
      );
      if (input.action === "collect") {
        if (
          !["confirmed", "checked_in", "checked_out", "completed"].includes(
            b.bookingStatus,
          ) ||
          (b.refundDuePaise ?? 0) > 0
        )
          throw new ApiException(
            "COLLECTION_NOT_ALLOWED",
            409,
            "Resolve pending refunds before collecting more money.",
          );
        if (input.amountPaise > netBalance(b))
          throw new ApiException(
            "OVERPAYMENT",
            422,
            "Amount exceeds the outstanding balance.",
          );
        if (input.method !== "cash" && !input.reference)
          throw new ApiException(
            "REFERENCE_REQUIRED",
            422,
            "Enter the UPI or terminal reference.",
          );
        tx.create(adminDb.collection("propertyPayments").doc(id), {
          type: "collection",
          amountPaise: input.amountPaise,
          method: input.method,
          reference: input.reference,
          reason: input.reason,
          propertyId: b.propertyId,
          bookingId,
          receiptId: null,
          actorId: uid,
          createdAt: FieldValue.serverTimestamp(),
        });
        patch.paidPaise = (b.paidPaise ?? 0) + input.amountPaise;
        patch.propertyLedgerPaise =
          (b.propertyLedgerPaise ?? 0) + input.amountPaise;
        patch.paidAt = FieldValue.serverTimestamp();
        tx.create(eventRef, {
          ...event,
          type: "property_collection",
          amountPaise: input.amountPaise,
          method: input.method,
          receiptId: id,
        });
      } else {
        const receipt = receipts.find(
          (r) => r.id === input.receiptId && r.type === "collection",
        );
        const refunds = await tx.get(
          adminDb.collection("refunds").where("bookingId", "==", bookingId),
        );
        const online = receipt
          ? null
          : (
              await tx.get(
                adminDb.collection("paymentAttempts").doc(input.receiptId),
              )
            ).data();
        if (
          !receipt &&
          (!online ||
            online.bookingId !== bookingId ||
            online.stayQuote ||
            !["captured", "refund_pending", "refunded"].includes(online.status))
        )
          throw new ApiException(
            "RECEIPT_NOT_FOUND",
            422,
            "Choose a recorded booking receipt.",
          );
        const related = receipts.filter((r) => r.receiptId === input.receiptId);
        const propertySpent = related.reduce((s, r) => s + r.amountPaise, 0);
        const providerSpent = refunds.docs
          .filter(
            (d) =>
              d.get("paymentId") === input.receiptId &&
              d.get("status") !== "failed",
          )
          .reduce((s, d) => s + d.get("amountPaise"), 0);
        const remaining = receiptRemaining(
          receipt?.amountPaise ?? online!.amountPaise,
          propertySpent,
          providerSpent,
        );
        if (input.action === "reverse") {
          if (
            !receipt ||
            remaining !== receipt.amountPaise ||
            (b.refundDuePaise ?? 0) > 0
          )
            throw new ApiException(
              "REVERSAL_NOT_ALLOWED",
              422,
              "Only an unused property collection can be reversed.",
            );
          patch.paidPaise = (b.paidPaise ?? 0) - receipt.amountPaise;
          patch.propertyLedgerPaise =
            (b.propertyLedgerPaise ?? 0) - receipt.amountPaise;
          tx.create(adminDb.collection("propertyPayments").doc(id), {
            type: "reversal",
            propertyId: b.propertyId,
            bookingId,
            receiptId: receipt.id,
            amountPaise: receipt.amountPaise,
            method: receipt.method,
            reference: receipt.reference,
            reason: input.reason,
            actorId: uid,
            createdAt: FieldValue.serverTimestamp(),
          });
          tx.create(eventRef, {
            ...event,
            type: "collection_reversed",
            receiptId: receipt.id,
            amountPaise: receipt.amountPaise,
            reason: input.reason,
          });
        } else {
          if (input.amountPaise > remaining)
            throw new ApiException(
              "REFUND_EXCEEDS_RECEIPT",
              422,
              "Amount exceeds the unrefunded receipt balance.",
            );
          if (receipt) {
            if (!input.reference)
              throw new ApiException(
                "REFERENCE_REQUIRED",
                422,
                "Enter confirmation of the money returned to the guest.",
              );
            tx.create(adminDb.collection("propertyPayments").doc(id), {
              type: "refund",
              propertyId: b.propertyId,
              bookingId,
              receiptId: receipt.id,
              amountPaise: input.amountPaise,
              method: receipt.method,
              reference: input.reference,
              reason: input.reason,
              actorId: uid,
              createdAt: FieldValue.serverTimestamp(),
            });
            patch.refundedPaise = (b.refundedPaise ?? 0) + input.amountPaise;
            patch.propertyRefundedPaise =
              (b.propertyRefundedPaise ?? 0) + input.amountPaise;
          } else {
            tx.create(adminDb.collection("refunds").doc(id), {
              bookingId,
              propertyId: b.propertyId,
              paymentId: input.receiptId,
              amountPaise: input.amountPaise,
              status: "pending",
              nextAttemptAt: Timestamp.now(),
              reason: input.reason,
              createdBy: uid,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            patch.refundDuePaise = (b.refundDuePaise ?? 0) + input.amountPaise;
          }
          tx.create(eventRef, {
            ...event,
            type: receipt ? "property_refund_returned" : "refund_requested",
            receiptId: input.receiptId,
            amountPaise: input.amountPaise,
            reason: input.reason,
          });
        }
      }
      if (!("originalPropertyPaidAt" in b))
        patch.originalPropertyPaidAt = b.paidAt ?? null;
      const updated = { ...b, ...patch };
      patch.balanceDuePaise = netBalance(updated);
      patch.paymentStatus =
        updated.refundDuePaise > 0
          ? "refund_pending"
          : updated.refundedPaise > 0
            ? updated.refundedPaise >= updated.paidPaise
              ? "refunded"
              : "partially_refunded"
            : netBalance(updated) === 0
              ? "paid_at_property"
              : updated.paidPaise > 0
                ? "partially_paid"
                : "pay_at_property";
    }
    tx.update(ref, patch);
    return { ok: true, id };
  });
}
const unitInput = z
  .object({
    propertyId: z.string().min(1).max(180),
    roomTypeId: z.string().min(1).max(180),
    label: z.string().trim().min(1).max(40),
    status: z.enum(["active", "inactive"]).default("active"),
    id: z.string().max(180).optional(),
  })
  .strict();
export async function saveUnit(uid: string, raw: unknown) {
  requireFeature("allocation");
  const input = unitInput.parse(raw);
  const id = input.id ?? randomUUID();
  await adminDb.runTransaction(async (tx) => {
    await authorize(uid, input.propertyId, tx);
    const ref = adminDb.collection("physicalUnits").doc(id),
      old = (await tx.get(ref)).data();
    const room = (
      await tx.get(adminDb.collection("roomTypes").doc(input.roomTypeId))
    ).data();
    if (
      !room ||
      room.propertyId !== input.propertyId ||
      room.status !== "active"
    )
      throw new ApiException("INVALID_ROOM_TYPE", 422);
    if (
      old &&
      (old.propertyId !== input.propertyId ||
        old.roomTypeId !== input.roomTypeId)
    )
      throw new ApiException("ROOM_TYPE_IMMUTABLE", 422);
    const labelKey = (label: string) =>
      createHash("sha256")
        .update(`${input.propertyId}\0${label.toLowerCase()}`)
        .digest("hex");
    const labelRef = adminDb
      .collection("physicalUnitLabels")
      .doc(labelKey(input.label));
    const claim = await tx.get(labelRef);
    if (claim.exists && claim.get("unitId") !== id)
      throw new ApiException("DUPLICATE_ROOM_LABEL", 409);
    const oldLabelRef = old
      ? adminDb.collection("physicalUnitLabels").doc(labelKey(old.label))
      : null;
    const oldLabel =
      oldLabelRef && oldLabelRef.path !== labelRef.path
        ? await tx.get(oldLabelRef)
        : null;
    const units = await tx.get(
      adminDb
        .collection("physicalUnits")
        .where("propertyId", "==", input.propertyId),
    );
    if (
      units.docs.some(
        (d) =>
          d.id !== id &&
          String(d.get("label")).toLowerCase() === input.label.toLowerCase(),
      )
    )
      throw new ApiException("DUPLICATE_ROOM_LABEL", 409);
    if (input.status === "active" && (!old || old.status !== "active") && units.docs.filter(d => d.id !== id && d.get("roomTypeId") === input.roomTypeId && d.get("status") === "active").length >= room.totalInventory) throw new ApiException("ROOM_REGISTER_EXCEEDS_CAPACITY", 409);
    if (input.status === "inactive") {
      const blocks = await tx.get(adminDb.collection("inventoryBlocks").where("propertyId", "==", input.propertyId).where("unitId", "==", id));
      if (blocks.docs.some(d => d.get("status") === "active")) throw new ApiException("RELEASE_MAINTENANCE_FIRST", 409);
      const bookings = await tx.get(
        adminDb
          .collection("bookings")
          .where("propertyId", "==", input.propertyId)
          .where("physicalUnitId", "==", id)
          .where("bookingStatus", "in", ["confirmed", "checked_in"]),
      );
      if (!bookings.empty)
        throw new ApiException(
          "ROOM_HAS_ASSIGNMENTS",
          409,
          "Remove active room assignments before deactivating this room.",
        );
    }
    if (oldLabel?.get("unitId") === id) tx.delete(oldLabel.ref);
    tx.set(labelRef, { propertyId: input.propertyId, unitId: id });
    const { id: _id, ...fields } = input;
    void _id;
    tx.set(ref, {
      ...old,
      ...fields,
      updatedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
      ...(!old
        ? { createdBy: uid, createdAt: FieldValue.serverTimestamp() }
        : {}),
    });
  });
  return { id };
}
