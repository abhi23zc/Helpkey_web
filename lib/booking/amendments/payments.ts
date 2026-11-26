import { ApiException } from "@/lib/api/errors";
import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { providerFetch } from "@/lib/providers/http";
import { todayTransaction } from "@/lib/partner/today/cache";
import {
  amendmentRef,
  bookingRef,
  owner,
  prepareApplication,
  publicAttempt,
  releaseAttempt,
} from "./service";
import { digest, fail } from "./engine";
import { editBlocker } from "./domain";
import type { RecordData } from "@/lib/partner/dashboard/domain";
export const orderRef = (orderId: string) =>
  adminDb.collection("bookingPaymentOrdersV1").doc(digest(orderId));
export async function provider(
  path: string,
  body?: unknown,
): Promise<RecordData> {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)
    fail("ONLINE_PAYMENT_NOT_CONFIGURED");
  const authorization = Buffer.from(
    `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`,
  ).toString("base64");
  const response = await providerFetch(
    "razorpay",
    `https://api.razorpay.com/v1/${path}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Basic ${authorization}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      timeoutMs: 8000,
      idempotent: !body,
    },
  );
  if (!response.ok) {
    if (body && [400, 401, 403, 422].includes(response.status))
      fail("PAYMENT_ORDER_REJECTED");
    fail("PAYMENT_UNRESOLVED");
  }
  return response.json();
}
export function registerOrder(
  tx: FirebaseFirestore.Transaction,
  orderId: string,
  b: RecordData,
  bookingId: string,
  extra: RecordData = {},
) {
  tx.create(orderRef(orderId), {
    bookingId,
    propertyId: b.propertyId,
    orderId,
    purpose: "checkout",
    checkoutRevision: b.checkoutRevision ?? 0,
    amountPaise: b.payableNowPaise,
    currency: b.currency,
    serviceAmountPaise: b.extrasTotalPaise ?? 0,
    ...extra,
    createdAt: FieldValue.serverTimestamp(),
  });
}
/** Durable creation intent prevents blind retries after an ambiguous provider response. */
export async function ensureOrder(id: string, aid: string) {
  const claim = await adminDb.runTransaction(async (tx) => {
    const b = (await tx.get(bookingRef(id))).data();
    const a = (await tx.get(amendmentRef(id, aid))).data();
    if (!b || !a) fail("NOT_FOUND");
    if (a.orderId) return { b, a, create: false };
    if (
      !["preparing", "awaiting_payment"].includes(a.status) ||
      a.expiresAt.toMillis() <= Date.now()
    )
      fail("AMENDMENT_EXPIRED");
    const blocker = editBlocker(b, Date.now());
    if (blocker) fail(blocker);
    if (b.activeAmendmentId !== aid) fail("REVISION_CONFLICT");
    if (a.orderCreationStartedAt) fail("PAYMENT_UNRESOLVED");
    const receipt = `hk_${aid.slice(0, 32)}`;
    tx.update(amendmentRef(id, aid), {
      orderCreationStartedAt: Timestamp.now(),
      orderReceipt: receipt,
      orderReconciliationRequired: true,
    });
    return { b, a: { ...a, orderReceipt: receipt }, create: true };
  });
  if (!claim.create) return claim.a.orderId as string;
  const amount =
    claim.a.kind === "replacement"
      ? claim.a.requiredAdvancePaise + (claim.b.extrasTotalPaise ?? 0)
      : claim.a.amountToCollectPaise;
  try {
    const order = await provider("orders", {
      amount,
      currency: claim.b.currency,
      receipt: claim.a.orderReceipt,
      notes: { bookingId: id, amendmentId: aid },
    });
    if (
      typeof order.id !== "string" ||
      (order.amount !== undefined && order.amount !== amount) ||
      (order.currency !== undefined && order.currency !== claim.b.currency)
    )
      fail("PAYMENT_UNRESOLVED");
    await adminDb.runTransaction(async (tx) => {
      const a = (await tx.get(amendmentRef(id, aid))).data();
      if (!a || a.orderId) return;
      registerOrder(tx, order.id, claim.b, id, {
        purpose: claim.a.kind === "replacement" ? "replacement" : "amendment",
        amendmentId: aid,
        checkoutRevision:
          claim.a.kind === "replacement"
            ? (claim.b.checkoutRevision ?? 0) + 1
            : null,
        amountPaise: amount,
        serviceAmountPaise:
          claim.a.kind === "replacement" ? (claim.b.extrasTotalPaise ?? 0) : 0,
      });
      tx.update(amendmentRef(id, aid), {
        orderId: order.id,
        orderReconciliationRequired: false,
      });
    });
    return order.id as string;
  } catch (error) {
    if (
      error instanceof ApiException &&
      ["PAYMENT_ORDER_REJECTED", "ONLINE_PAYMENT_NOT_CONFIGURED"].includes(
        error.code,
      )
    ) {
      await todayTransaction(async (tx, changed) => {
        const b = (await tx.get(bookingRef(id))).data();
        const a = (await tx.get(amendmentRef(id, aid))).data();
        if (!b || !a || a.orderId) return;
        changed(b.propertyId);
        releaseAttempt(tx, id, a, b, "failed", error.code);
        tx.update(amendmentRef(id, aid), {
          orderCreationStartedAt: null,
          orderReconciliationRequired: false,
        });
        tx.update(bookingRef(id), {
          amendmentRecoveryPending: false,
          paymentReconciliationPending: b.bookingStatus === "pending_payment",
        });
      });
      throw error;
    }
    await amendmentRef(id, aid).set(
      { orderReconciliationRequired: true },
      { merge: true },
    );
    throw error;
  }
}
export async function paymentSession(uid: string, id: string, aid: string) {
  const b = (await bookingRef(id).get()).data();
  owner(b, uid);
  const a = (await amendmentRef(id, aid).get()).data();
  if (!a) fail("NOT_FOUND");
  if (a.kind === "replacement") fail("USE_BOOKING_PAYMENT_SESSION");
  const orderId = await ensureOrder(id, aid);
  const current = (await amendmentRef(id, aid).get()).data()!;
  if (
    current.status !== "awaiting_payment" ||
    current.expiresAt.toMillis() <= Date.now()
  )
    fail("AMENDMENT_EXPIRED");
  return {
    razorpay: {
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId,
      amount: current.amountToCollectPaise,
      currency: current.currency,
      name: "HelpKey",
    },
    amendment: publicAttempt(current),
  };
}
export async function prepareReplacement(id: string, aid: string) {
  const before = (await amendmentRef(id, aid).get()).data();
  if (!before || before.status !== "preparing") return;
  const orderId = await ensureOrder(id, aid);
  await todayTransaction(async (tx, changed) => {
    const b = (await tx.get(bookingRef(id))).data();
    const a = (await tx.get(amendmentRef(id, aid))).data();
    if (!b || !a || a.status !== "preparing") return;
    changed(b.propertyId);
    if (
      b.bookingStatus !== "pending_payment" ||
      b.checkoutReplacement?.amendmentId !== aid ||
      b.checkoutAttempt ||
      editBlocker(b, Date.now()) ||
      a.expiresAt.toMillis() <= Date.now()
    ) {
      releaseAttempt(tx, id, a, b, "failed", "REPLACEMENT_ABORTED");
      return;
    }
    let apply: () => void;
    try {
      apply = await prepareApplication(tx, id, a, b, 0, true);
    } catch (error) {
      if (
        !(error instanceof ApiException) &&
        !(error instanceof Error && /^[A-Z_]+$/.test(error.message))
      )
        throw error;
      releaseAttempt(
        tx,
        id,
        a,
        b,
        "failed",
        error instanceof Error ? error.message : "REPLACEMENT_ABORTED",
      );
      return;
    }
    // Application and active-order replacement share the same atomic commit.
    apply();
    tx.update(adminDb.collection("inventoryHolds").doc(id), {
      expiresAt: Timestamp.fromMillis(
        Math.min(b.expiresAt.toMillis(), Date.parse(a.patch.startAt)),
      ),
    });
    tx.update(bookingRef(id), {
      razorpayOrderId: orderId,
      expiresAt: Timestamp.fromMillis(
        Math.min(b.expiresAt.toMillis(), Date.parse(a.patch.startAt)),
      ),
      checkoutRevision: (b.checkoutRevision ?? 0) + 1,
      checkoutReplacement: null,
      checkoutAttempt: null,
      checkoutNeedsReplacement: false,
      payableNowPaise: a.requiredAdvancePaise + (b.extrasTotalPaise ?? 0),
      paymentStatus: "pending",
      paymentReconciliationPending: true,
      nextReconcileAt: Timestamp.now(),
      orderCreationStartedAt: a.orderCreationStartedAt,
      orderReconciliationRequired: false,
    });
  });
}
function recordUnusable(
  tx: FirebaseFirestore.Transaction,
  id: string,
  b: RecordData,
  mapping: RecordData,
  payment: RecordData,
  reason: string,
) {
  tx.create(adminDb.collection("paymentAttempts").doc(payment.id), {
    bookingId: id,
    propertyId: b.propertyId,
    paymentId: payment.id,
    orderId: payment.order_id,
    amountPaise: payment.amount,
    currency: payment.currency,
    status: "captured",
    unusable: true,
    amendmentId: mapping.amendmentId ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
  tx.create(adminDb.collection("refunds").doc(`${id}_${payment.id}_unusable`), {
    bookingId: id,
    propertyId: b.propertyId,
    paymentId: payment.id,
    amountPaise: payment.amount,
    currency: payment.currency,
    amendmentId: mapping.amendmentId ?? null,
    unusableCapture: true,
    status: "pending",
    reason,
    nextAttemptAt: Timestamp.now(),
    createdAt: FieldValue.serverTimestamp(),
  });
  tx.update(bookingRef(id), {
    paidPaise: FieldValue.increment(payment.amount),
    refundDuePaise: FieldValue.increment(payment.amount),
    paymentReplacementUnresolved: true,
    updatedAt: FieldValue.serverTimestamp(),
  });
}
/** Returns null only for legacy/active initial checkout; callers retain their existing path. */
export async function routeMappedCapture(
  id: string,
  input: {
    orderId: string;
    paymentId: string;
    actorId: string;
    source: string;
  },
  payment: RecordData,
): Promise<boolean | null> {
  let mapping = (await orderRef(input.orderId).get()).data();
  const initial = (await bookingRef(id).get()).data();
  if (!initial?.editPolicy) return null;
  // A webhook can beat persistence of an order creation response.
  if (!mapping && typeof payment.notes?.amendmentId === "string") {
    const aid = payment.notes.amendmentId;
    const a = (await amendmentRef(id, aid).get()).data();
    if (a?.orderCreationStartedAt) {
      const order = await provider(
        `orders/${encodeURIComponent(input.orderId)}`,
      );
      const expected =
        a.kind === "replacement"
          ? a.requiredAdvancePaise + (initial.extrasTotalPaise ?? 0)
          : a.amountToCollectPaise;
      if (
        order.receipt === a.orderReceipt &&
        order.notes?.bookingId === id &&
        order.notes?.amendmentId === aid &&
        order.amount === expected &&
        order.currency === initial.currency
      ) {
        await adminDb.runTransaction(async (tx) => {
          const existing = await tx.get(orderRef(input.orderId));
          if (!existing.exists)
            registerOrder(tx, input.orderId, initial, id, {
              purpose: a.kind === "replacement" ? "replacement" : "amendment",
              amendmentId: aid,
              checkoutRevision:
                a.kind === "replacement"
                  ? (a.baseCheckoutRevision ?? 0) + 1
                  : null,
              amountPaise: expected,
              serviceAmountPaise:
                a.kind === "replacement" ? (initial.extrasTotalPaise ?? 0) : 0,
            });
          tx.update(amendmentRef(id, aid), {
            orderId: input.orderId,
            orderReconciliationRequired: false,
          });
        });
        mapping = (await orderRef(input.orderId).get()).data();
      }
    }
  }
  if (
    !mapping &&
    initial.razorpayOrderId === input.orderId &&
    (initial.checkoutRevision ?? 0) === 0
  ) {
    await adminDb.runTransaction(async (tx) => {
      const saved = await tx.get(orderRef(input.orderId));
      if (!saved.exists) registerOrder(tx, input.orderId, initial, id);
    });
    mapping = (await orderRef(input.orderId).get()).data();
  }
  if (
    !mapping ||
    mapping.bookingId !== id ||
    mapping.orderId !== payment.order_id ||
    mapping.amountPaise !== payment.amount ||
    mapping.currency !== payment.currency
  )
    fail("PAYMENT_MISMATCH");
  if (
    mapping.purpose !== "amendment" &&
    initial.razorpayOrderId === input.orderId &&
    (initial.checkoutRevision ?? 0) === mapping.checkoutRevision &&
    initial.bookingStatus === "pending_payment" &&
    !initial.paymentReplacementUnresolved &&
    !initial.checkoutNeedsReplacement
  )
    return null;
  return todayTransaction(async (tx, changed) => {
    const b = (await tx.get(bookingRef(id))).data();
    if (!b) fail("NOT_FOUND");
    if (input.source === "customer_verify") owner(b, input.actorId);
    changed(b.propertyId);
    const receipt = await tx.get(
      adminDb.collection("paymentAttempts").doc(payment.id),
    );
    if (receipt.exists) {
      if (
        receipt.get("bookingId") !== id ||
        receipt.get("orderId") !== input.orderId
      )
        fail("PAYMENT_MISMATCH");
      return !receipt.get("unusable");
    }
    if (mapping.purpose !== "amendment") {
      recordUnusable(tx, id, b, mapping, payment, "SUPERSEDED_ORDER_CAPTURE");
      return false;
    }
    const a = (await tx.get(amendmentRef(id, mapping.amendmentId))).data();
    if (!a) {
      recordUnusable(tx, id, b, mapping, payment, "AMENDMENT_NOT_FOUND");
      return false;
    }
    let apply: (() => void) | undefined;
    let reason = "AMENDMENT_NOT_APPLICABLE";
    if (
      a.status === "awaiting_payment" &&
      a.orderId === input.orderId &&
      b.activeAmendmentId === a.id &&
      a.expiresAt.toMillis() > Date.now() &&
      b.bookingStatus === "confirmed"
    ) {
      try {
        apply = await prepareApplication(tx, id, a, b, payment.amount);
      } catch (error) {
        if (
          !(error instanceof ApiException) &&
          !(error instanceof Error && /^[A-Z_]+$/.test(error.message))
        )
          throw error;
        reason = error instanceof Error ? error.message : reason;
      }
    }
    if (!apply) {
      recordUnusable(tx, id, b, mapping, payment, reason);
      if (b.activeAmendmentId === a.id)
        releaseAttempt(tx, id, a, b, "failed", reason);
      return false;
    }
    tx.create(adminDb.collection("paymentAttempts").doc(payment.id), {
      bookingId: id,
      propertyId: b.propertyId,
      paymentId: payment.id,
      orderId: payment.order_id,
      amendmentId: a.id,
      amountPaise: payment.amount,
      currency: payment.currency,
      status: "captured",
      createdAt: FieldValue.serverTimestamp(),
    });
    apply();
    return true;
  });
}
/** Recover lost creation responses, reconcile every known order, then release expired inventory. */
export async function reconcileAmendments(id: string) {
  let b = (await bookingRef(id).get()).data();
  if (!b?.editPolicy) return;
  // Cleanup never depends on provider availability; later money is refundable.
  if (b.activeAmendmentId) {
    const activeId = b.activeAmendmentId;
    await todayTransaction(async (tx, changed) => {
      const current = (await tx.get(bookingRef(id))).data();
      const a = (await tx.get(amendmentRef(id, activeId))).data();
      if (!current || !a || current.activeAmendmentId !== activeId) return;
      if (
        a.expiresAt.toMillis() <= Date.now() ||
        !["confirmed", "pending_payment"].includes(current.bookingStatus) ||
        current.actualCheckInAt
      ) {
        changed(current.propertyId);
        releaseAttempt(tx, id, a, current, "expired", "AMENDMENT_EXPIRED");
      }
    });
    b = (await bookingRef(id).get()).data()!;
  }
  // Recover abandoned creation responses even after the reservation was released.
  const unknownOrders = await bookingRef(id)
    .collection("amendments")
    .where("orderReconciliationRequired", "==", true)
    .get();
  for (const d of unknownOrders.docs) {
    const a = d.data();
    if (a.orderId) continue;
    const response = await provider(
      `orders?receipt=${encodeURIComponent(a.orderReceipt)}&count=100`,
    );
    if (
      !Array.isArray(response.items) ||
      response.count !== response.items.length
    )
      fail("PAYMENT_UNRESOLVED");
    const matches = response.items.filter(
      (o: RecordData) =>
        o.receipt === a.orderReceipt &&
        o.notes?.bookingId === id &&
        o.notes?.amendmentId === a.id,
    );
    if (matches.length !== 1) fail("PAYMENT_UNRESOLVED");
    const order = matches[0],
      expected =
        a.kind === "replacement"
          ? a.requiredAdvancePaise + (a.patch.extrasTotalPaise ?? 0)
          : a.amountToCollectPaise;
    if (order.amount !== expected || order.currency !== a.currency)
      fail("PAYMENT_MISMATCH");
    const currentBooking = b;
    await adminDb.runTransaction(async (tx) => {
      const existing = await tx.get(orderRef(order.id));
      const attempt = await tx.get(d.ref);
      if (attempt.get("orderId")) return;
      if (!existing.exists)
        registerOrder(tx, order.id, currentBooking!, id, {
          purpose: a.kind === "replacement" ? "replacement" : "amendment",
          amendmentId: a.id,
          checkoutRevision:
            a.kind === "replacement" ? (a.baseCheckoutRevision ?? 0) + 1 : null,
          amountPaise: expected,
          serviceAmountPaise:
            a.kind === "replacement" ? (a.patch.extrasTotalPaise ?? 0) : 0,
        });
      tx.update(d.ref, {
        orderId: order.id,
        orderReconciliationRequired: false,
      });
    });
  }
  if (b.activeAmendmentId) {
    const aid = b.activeAmendmentId;
    const a = (await amendmentRef(id, aid).get()).data();
    if (a?.orderCreationStartedAt && !a.orderId) {
      const result = await provider(
        `orders?receipt=${encodeURIComponent(a.orderReceipt)}&count=100`,
      );
      if (!Array.isArray(result.items) || result.count !== result.items.length)
        fail("PAYMENT_UNRESOLVED");
      const matches = result.items.filter(
        (o: RecordData) =>
          o.receipt === a.orderReceipt &&
          o.notes?.bookingId === id &&
          o.notes?.amendmentId === aid,
      );
      if (matches.length === 1) {
        const o = matches[0];
        const expected =
          a.kind === "replacement"
            ? a.requiredAdvancePaise + (b.extrasTotalPaise ?? 0)
            : a.amountToCollectPaise;
        if (o.amount !== expected || o.currency !== b.currency)
          fail("PAYMENT_MISMATCH");
        const snapshot = b;
        await adminDb.runTransaction(async (tx) => {
          const current = (await tx.get(amendmentRef(id, aid))).data();
          const mapped = await tx.get(orderRef(o.id));
          if (!current || current.orderId) return;
          if (!mapped.exists)
            registerOrder(tx, o.id, snapshot, id, {
              purpose: a.kind === "replacement" ? "replacement" : "amendment",
              amendmentId: aid,
              checkoutRevision:
                a.kind === "replacement"
                  ? (snapshot.checkoutRevision ?? 0) + 1
                  : null,
              amountPaise: expected,
              serviceAmountPaise:
                a.kind === "replacement" ? (snapshot.extrasTotalPaise ?? 0) : 0,
            });
          tx.update(amendmentRef(id, aid), {
            orderId: o.id,
            orderReconciliationRequired: false,
          });
        });
      } else if (matches.length > 1) fail("PAYMENT_UNRESOLVED");
    }
  }
  const orders = await adminDb
    .collection("bookingPaymentOrdersV1")
    .where("bookingId", "==", id)
    .get();
  for (const order of orders.docs) {
    const result = await provider(
      `orders/${encodeURIComponent(order.get("orderId"))}/payments`,
    );
    if (!Array.isArray(result.items) || result.count !== result.items.length)
      fail("PAYMENT_UNRESOLVED");
    for (const payment of result.items)
      if (payment.status === "captured") {
        const { confirmPaidBooking } = await import("@/lib/bookings");
        await confirmPaidBooking(id, {
          actorId: "system:amendments",
          orderId: order.get("orderId"),
          paymentId: payment.id,
          source: "reconciliation",
        });
      }
  }
  b = (await bookingRef(id).get()).data();
  if (!b?.activeAmendmentId) return;
  const aid = b.activeAmendmentId;
  const a = (await amendmentRef(id, aid).get()).data();
  if (
    a?.kind === "replacement" &&
    a.status === "preparing" &&
    a.orderId &&
    a.expiresAt.toMillis() > Date.now()
  )
    await prepareReplacement(id, aid);
  await todayTransaction(async (tx, changed) => {
    const current = (await tx.get(bookingRef(id))).data();
    const attempt = (await tx.get(amendmentRef(id, aid))).data();
    if (!current || !attempt || current.activeAmendmentId !== aid) return;
    changed(current.propertyId);
    if (
      attempt.expiresAt.toMillis() <= Date.now() ||
      !["confirmed", "pending_payment"].includes(current.bookingStatus) ||
      current.actualCheckInAt
    )
      releaseAttempt(tx, id, attempt, current, "expired", "AMENDMENT_EXPIRED");
  });
}
