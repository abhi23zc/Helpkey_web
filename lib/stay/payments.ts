import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { providerFetch } from "@/lib/providers/http";
import { paymentVerificationInput } from "@/lib/booking/contracts";
import type { ExtrasOffer } from "./offer-domain";
import type { StayRequest } from "./contracts";
import { assertLiveQuote } from "./agreements";
import { queueQuoteRefund } from "./requests";
import { enqueueStayNotification } from "./notifications";

async function provider(path: string, body?: unknown) {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)
    throw new Error("Online payment is not configured. Contact the hotel.");
  const auth = Buffer.from(
    `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`,
  ).toString("base64");
  const response = await providerFetch(
    "razorpay",
    `https://api.razorpay.com/v1/${path}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      timeoutMs: 8000,
      idempotent: !body,
    },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      "Payment provider could not complete the request. Please retry.",
    );
  return result;
}
export async function quotePaymentSession(
  uid: string,
  bookingId: string,
  requestId: string,
  version: number,
) {
  const id = createHash("sha256")
    .update(JSON.stringify([bookingId, requestId, version]))
    .digest("hex");
  const ref = adminDb.collection("stayQuoteOrders").doc(id);
  const order = await adminDb.runTransaction(async (tx) => {
    const bookingRef = adminDb.collection("bookings").doc(bookingId);
    const b = (await tx.get(bookingRef)).data();
    const saved = (await tx.get(ref)).data();
    if (!b || b.guestId !== uid) throw new Error("NOT_FOUND");
    if (!["confirmed", "checked_in"].includes(b.bookingStatus))
      throw new Error("This booking is closed for payments.");
    const offer = (b.extrasOffers as ExtrasOffer[] | undefined)?.find(o => o.id === requestId);
    if (offer && (offer.status !== "accepted" || offer.version !== version || Date.parse(offer.expiresAt) <= Date.now())) throw new Error("Review the current offer before paying.");
    const selectedIds = offer?.selectedRequestIds ?? [requestId];
    const selected = (b.customizations as StayRequest[]).filter(r => selectedIds.includes(r.id));
    if (offer && selected.length !== selectedIds.length) throw new Error("Offer items changed.");
    for (const item of selected) {
      if (item.offerDraft || (item.offerId && item.offerId !== offer?.id)) throw new Error("Pay through the combined offer.");
      if (offer) {
        const allocation = offer.items.find(i => i.requestId === item.id)!;
        const quote = assertLiveQuote(item, allocation.quoteVersion);
        if (item.settlement !== "awaiting_payment" || quote.status !== "accepted" || quote.amountPaise !== allocation.amountPaise) throw new Error("Offer changed.");
      }
    }
    const r = (b.customizations as StayRequest[]).find(
      (r) => r.id === selectedIds[0],
    );
    if (!r || r.settlement !== "awaiting_payment")
      throw new Error("Accept the current hotel quote before payment.");
    const q = assertLiveQuote(r, offer ? offer.items.find(i => i.requestId === r.id)!.quoteVersion : version);
    if (q.status !== "accepted" || q.amountPaise <= 0)
      throw new Error("Payment is not required for this quote.");
    if (saved) {
      if (!saved.orderId)
        throw new Error(
          "The payment session is being reconciled. Refresh shortly; do not pay again.",
        );
      return saved;
    }
    const data = {
      propertyId: b.propertyId,
      bookingId,
      requestId,
      version,
      ...(offer ? { offerId: offer.id, allocations: offer.items.filter(i => selectedIds.includes(i.requestId)) } : {}),
      amountPaise: offer ? offer.items.filter(i => selectedIds.includes(i.requestId)).reduce((n,i) => n + i.amountPaise, 0) : q.amountPaise,
      currency: b.currency ?? "INR",
      guestId: uid,
    };
    tx.update(bookingRef, {
      stayQuoteReconciliationPending: true,
      paymentReconciliationPending: true,
      nextReconcileAt: Timestamp.fromMillis(Date.now() + 60000),
    });
    tx.create(ref, {
      ...data,
      state: "creating",
      createdAt: FieldValue.serverTimestamp(),
    });
    return data;
  });
  let orderId = "orderId" in order ? (order.orderId as string) : "";
  if (!orderId) {
    // Reserve one identity before the network call; ambiguous failures never create a second order.
    const created = await provider("orders", {
      amount: order.amountPaise,
      currency: order.currency,
      receipt: `sq_${id.slice(0, 32)}`,
      notes: { bookingId, stayQuoteOrderId: id },
    });
    if (!created.id)
      throw new Error(
        "Payment session creation failed. Contact support before retrying.",
      );
    orderId = created.id;
    await ref.update({
      orderId,
      state: "ready",
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  return {
    keyId: process.env.RAZORPAY_KEY_ID!,
    orderId,
    amount: order.amountPaise as number,
    currency: order.currency as string,
    name: "Helpkey",
    stayQuoteOrderId: id,
  };
}
export async function verifyQuotePayment(
  uid: string,
  bookingId: string,
  raw: unknown,
) {
  const input = paymentVerificationInput.parse(raw);
  const expected = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET ?? "")
    .update(`${input.razorpay_order_id}|${input.razorpay_payment_id}`)
    .digest("hex");
  const actual = Buffer.from(input.razorpay_signature),
    wanted = Buffer.from(expected);
  if (
    !process.env.RAZORPAY_KEY_SECRET ||
    actual.length !== wanted.length ||
    !timingSafeEqual(actual, wanted)
  )
    throw new Error("Payment signature is invalid.");
  const b = (await adminDb.collection("bookings").doc(bookingId).get()).data();
  if (!b || b.guestId !== uid) throw new Error("NOT_FOUND");
  const orders = await adminDb
    .collection("stayQuoteOrders")
    .where("orderId", "==", input.razorpay_order_id)
    .limit(1)
    .get();
  const order = orders.docs[0];
  if (!order || order.get("bookingId") !== bookingId)
    throw new Error("Payment does not match this booking.");
  return captureQuotePayment(
    order.id,
    input.razorpay_order_id,
    input.razorpay_payment_id,
  );
}
export async function captureQuotePayment(
  orderRecordId: string,
  orderId: string,
  paymentId: string,
) {
  const orderRef = adminDb.collection("stayQuoteOrders").doc(orderRecordId);
  const payment = await provider(`payments/${encodeURIComponent(paymentId)}`);
  if (
    payment.id !== paymentId ||
    payment.order_id !== orderId ||
    payment.status !== "captured" ||
    payment.captured !== true
  )
    throw new Error("Payment has not completed. Refresh to check its status.");
  return adminDb.runTransaction(async (tx) => {
    const order = (await tx.get(orderRef)).data();
    if (
      !order ||
      order.orderId !== orderId ||
      payment.amount !== order.amountPaise ||
      payment.currency !== order.currency
    )
      throw new Error("Payment does not match the agreed quote.");
    const ref = adminDb.collection("bookings").doc(order.bookingId);
    const b = (await tx.get(ref)).data();
    const receipt = adminDb.collection("paymentAttempts").doc(paymentId);
    const existing = await tx.get(receipt);
    if (!b) throw new Error("NOT_FOUND");
    if (existing.exists) {
      if (
        existing.get("bookingId") !== order.bookingId ||
        existing.get("orderId") !== orderId
      )
        throw new Error("Payment identity mismatch.");
      return { refunded: existing.get("status") === "refund_pending" };
    }
    const requests = (b.customizations ?? []) as StayRequest[];
    const allocations: { requestId: string; quoteVersion: number; amountPaise: number; scope: string }[] = order.allocations ?? [{ requestId: order.requestId, quoteVersion: order.version, amountPaise: order.amountPaise, scope: requests.find(r => r.id === order.requestId)?.quote?.scope ?? "Extra" }];
    const offer = (b.extrasOffers as ExtrasOffer[] | undefined)?.find(o => o.id === order.offerId);
    const live = (!order.offerId || (offer?.status === "accepted" && offer.version === order.version && Date.parse(offer.expiresAt) > Date.now())) &&
      allocations.every(a => {
        const r = requests.find(r => r.id === a.requestId);
        return r && r.status === "requested" && r.settlement === "awaiting_payment" && r.quote?.version === a.quoteVersion && r.quote.status === "accepted" && r.quote.amountPaise === a.amountPaise && !r.quote.paymentId && Date.parse(r.quote.expiresAt) > Date.now();
      }) && ["confirmed", "checked_in"].includes(b.bookingStatus) && Date.parse(b.endAt) > Date.now() && !order.paymentId;
    tx.create(receipt, {
      bookingId: order.bookingId,
      propertyId: b.propertyId,
      orderId,
      paymentId,
      amountPaise: payment.amount,
      currency: payment.currency,
      stayQuote: true,
      status: live ? "captured" : "refund_pending",
      createdAt: FieldValue.serverTimestamp(),
    });
    if (!live)
      queueQuoteRefund(
        tx,
        order.bookingId,
        b.propertyId,
        order.requestId,
        paymentId,
        payment.amount,
      );
    else
      tx.update(ref, {
        customizations: requests.map((item) =>
          allocations.some(a => a.requestId === item.id)
            ? {
                ...item,
                status: "confirmed",
                settlement: "paid",
                quote: {
                  ...item.quote!,
                  paymentId,
                  orderId,
                  paymentStatus: "paid",
                },
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
        stayRevision: (b.stayRevision ?? 0) + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
    if (live && offer) tx.update(ref, { extrasOffers: (b.extrasOffers as ExtrasOffer[]).map(o => o.id === offer.id ? { ...o, status: "paid" } : o) });
    tx.update(ref, {
      stayPaymentReceipts: [
        ...(b.stayPaymentReceipts ?? []),
        ...allocations.map(a => ({ requestId: a.requestId, quoteVersion: a.quoteVersion, paymentId, orderId,
          amountPaise: a.amountPaise, status: live ? "paid" : "refund_pending", scope: a.scope,
          ...(order.offerId ? { offerId: order.offerId } : {}) })),
      ],
      stayRevision: (b.stayRevision ?? 0) + 1,
    });
    // A second capture on the same order is refunded, never applied twice.
    tx.update(orderRef, {
      paymentId: order.paymentId ?? paymentId,
      state: live ? "paid" : "refund_pending",
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(ref.collection("events").doc(), {
      type: live ? "stay_quote_paid" : "stay_quote_late_payment_refund",
      requestId: order.requestId,
      paymentId,
      amountPaise: payment.amount,
      actorId: "razorpay",
      createdAt: FieldValue.serverTimestamp(),
    });
    enqueueStayNotification(
      tx,
      order.bookingId,
      b.propertyId,
      b.guestId,
      (b.stayRevision ?? 0) + 1,
      live ? "quote_paid" : "quote_payment_refund",
    );
    return { refunded: !live };
  });
}

/** Uses the existing booking payment worker and stable receipt to recover interrupted orders/callbacks. */
export async function reconcileStayQuotePayments(bookingId: string) {
  const bookingRef = adminDb.collection("bookings").doc(bookingId);
  const initial = (await bookingRef.get()).data();
  if (!initial?.stayQuoteReconciliationPending) return;
  const orders = await adminDb
    .collection("stayQuoteOrders")
    .where("bookingId", "==", bookingId)
    .get();
  let pending = false;
  for (const doc of orders.docs) {
    const order = doc.data();
    if (["paid", "refund_pending"].includes(order.state)) continue;
    let orderId = order.orderId;
    if (!orderId) {
      const result = await provider(
        `orders?receipt=${encodeURIComponent(`sq_${doc.id.slice(0, 32)}`)}&count=100`,
      );
      const matches = (result.items ?? []).filter(
        (o: {
          id: string;
          receipt: string;
          amount: number;
          currency: string;
          notes?: { stayQuoteOrderId?: string };
        }) =>
          o.receipt === `sq_${doc.id.slice(0, 32)}` &&
          o.amount === order.amountPaise &&
          o.currency === order.currency &&
          o.notes?.stayQuoteOrderId === doc.id,
      );
      if (matches.length !== 1)
        throw new Error("STAY_PAYMENT_ORDER_RECONCILIATION_REQUIRED");
      orderId = matches[0].id;
      await doc.ref.update({ orderId, state: "ready" });
    }
    const result = await provider(
      `orders/${encodeURIComponent(orderId)}/payments`,
    );
    const captured = (result.items ?? []).filter(
      (p: { id: string; status: string }) => p.status === "captured",
    );
    for (const payment of captured)
      await captureQuotePayment(doc.id, orderId, payment.id);
    if (!captured.length && Date.now() < Date.parse(initial.endAt) + 86400000)
      pending = true;
  }
  if (!pending)
    await adminDb.runTransaction(async (tx) => {
      const b = (await tx.get(bookingRef)).data();
      // A newly created session changes nextReconcileAt. Avoid clearing its worker schedule.
      if (
        b &&
        b.nextReconcileAt?.toMillis() === initial.nextReconcileAt?.toMillis()
      )
        tx.update(bookingRef, {
          stayQuoteReconciliationPending: false,
          paymentReconciliationPending: b.bookingStatus === "pending_payment",
        });
    });
}
