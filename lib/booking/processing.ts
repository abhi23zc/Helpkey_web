import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { providerFetch } from "@/lib/providers/http";
import { confirmPaidBooking } from "@/lib/bookings";

import { retryDelay } from "@/lib/background/config";
import { renewRecordLease } from "@/lib/background/record-lease";

async function razorpay(path: string, body?: unknown, key?: string) {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) throw new Error("ONLINE_PAYMENT_NOT_CONFIGURED");
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const response = await providerFetch("razorpay", `https://api.razorpay.com/v1/${path}`, {
    method: body ? "POST" : "GET", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", ...(key ? { "X-Refund-Idempotency": key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), timeoutMs: 8000, idempotent: !body || Boolean(key),
  });
  const result = await response.json();
  if (!response.ok) {
    const detail = [result.error?.code, result.error?.description].filter((value): value is string => typeof value === "string").join(": ").slice(0, 400);
    throw new Error(`RAZORPAY_${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return result;
}

/** Provider idempotency makes a retry safe after a crash between the HTTP response and Firestore commit. */
export async function processRefund(refundId: string) {
  const ref = adminDb.collection("refunds").doc(refundId);
  const owner = randomUUID();
  const claim = await adminDb.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data();
    if (!data || data.backgroundAttention?.refunds || ["processed", "failed", "attention"].includes(data.status) || (data.leaseExpiresAt instanceof Timestamp && data.leaseExpiresAt.toMillis() > Date.now())) return null;
    const booking = (await tx.get(adminDb.collection("bookings").doc(data.bookingId))).data();
    const attempt = (await tx.get(adminDb.collection("paymentAttempts").doc(data.paymentId))).data();
    if (!booking || !Number.isSafeInteger(data.amountPaise) || data.amountPaise <= 0) throw new Error("INVALID_REFUND");
    if (attempt && attempt.bookingId !== data.bookingId) throw new Error("REFUND_PAYMENT_BOOKING_MISMATCH");
    const captured = attempt?.amountPaise ?? (booking.razorpayPaymentId === data.paymentId ? booking.paidPaise : 0);
    const refunds = await tx.get(adminDb.collection("refunds").where("paymentId", "==", data.paymentId));
    const committed = refunds.docs.filter((doc) => doc.data().status !== "failed").reduce((sum, doc) => sum + Number(doc.data().amountPaise), 0);
    if (committed > captured) throw new Error("REFUND_EXCEEDS_CAPTURED_FUNDS");
    if (data.requestAmountPaise !== undefined && (data.requestAmountPaise !== data.amountPaise || data.requestPaymentId !== data.paymentId)) throw new Error("REFUND_REQUEST_CHANGED");
    const leaseExpiresAt = Timestamp.fromMillis(Date.now() + 90_000);
    tx.update(ref, { status: "processing", leaseOwner: owner, leaseExpiresAt, nextAttemptAt: leaseExpiresAt, requestAmountPaise: data.amountPaise, requestPaymentId: data.paymentId, attempts: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    return { bookingId: String(data.bookingId), paymentId: String(data.paymentId), amountPaise: Number(data.amountPaise), providerRefundId: typeof data.providerRefundId === "string" ? data.providerRefundId : null, currency: String(booking.currency) };
  });
  if (!claim) return;
  const stopRenewing = renewRecordLease(ref, owner, "nextAttemptAt");
  try {
    const key = createHash("sha256").update(refundId).digest("hex");
    const result = claim.providerRefundId
      ? await razorpay(`refunds/${encodeURIComponent(claim.providerRefundId)}`)
      : await razorpay(`payments/${encodeURIComponent(claim.paymentId)}/refund`, { amount: claim.amountPaise, speed: "normal", notes: { refundId } }, key);
    if (!result.id || result.payment_id !== claim.paymentId || result.amount !== claim.amountPaise || (result.currency !== undefined && result.currency !== claim.currency) || !["pending", "processed", "failed"].includes(result.status)) throw new Error("REFUND_PROVIDER_MISMATCH");
    await adminDb.runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if (current?.leaseOwner === owner && current.leaseExpiresAt?.toMillis() > Date.now() && !["processed", "failed"].includes(current.status)) tx.update(ref, { providerRefundId: result.id });
    });
    await adminDb.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data();
      const bookingRef = adminDb.collection("bookings").doc(claim.bookingId);
      const booking = (await tx.get(bookingRef)).data();
      if (!current || current.leaseOwner !== owner || current.leaseExpiresAt?.toMillis() <= Date.now() || ["processed", "failed"].includes(current.status) || !booking) return;
      tx.update(ref, { providerRefundId: result.id, status: result.status, ...(result.status === "processed" ? { processedAt: FieldValue.serverTimestamp() } : {}), leaseOwner: null, leaseExpiresAt: null, nextAttemptAt: Timestamp.fromMillis(Date.now() + 60_000), updatedAt: FieldValue.serverTimestamp() });
      if (result.status === "processed") {
        const refundedPaise = (booking.refundedPaise ?? 0) + claim.amountPaise;
        const refundDuePaise = Math.max(0, (booking.refundDuePaise ?? 0) - claim.amountPaise);
        tx.update(bookingRef, { refundedAt: FieldValue.serverTimestamp(), refundedPaise, refundDuePaise, paymentStatus: refundDuePaise > 0 ? "refund_pending" : refundedPaise >= booking.paidPaise ? "refunded" : "partially_refunded", updatedAt: FieldValue.serverTimestamp() });
        tx.create(bookingRef.collection("events").doc(), { type: "refund_processed", refundId, amountPaise: claim.amountPaise, actorId: "system:refunds", createdAt: FieldValue.serverTimestamp() });
      }
    });
  } catch (error) {
    await adminDb.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data();
      if (current && current.leaseOwner === owner && !["processed", "failed"].includes(current.status)) tx.update(ref, { status: error instanceof Error && /MISMATCH|INVALID_REFUND|REQUEST_CHANGED|RAZORPAY_(400|401|403|404|422)/.test(error.message) ? "attention" : "retry", leaseOwner: null, leaseExpiresAt: null, nextAttemptAt: Timestamp.fromMillis(Date.now() + retryDelay(Number(current.attempts ?? 1), 60_000)), lastError: error instanceof Error ? error.message : "UNKNOWN", updatedAt: FieldValue.serverTimestamp() });
    });
    throw error;
  } finally { await stopRenewing(); }
}
export async function processRefundBatch() {
  const docs = await adminDb.collection("refunds").where("status", "in", ["pending", "retry", "processing"]).where("nextAttemptAt", "<=", Timestamp.now()).orderBy("nextAttemptAt", "asc").limit(5).get();
  const failures: string[] = [];
  const eligible = docs.docs.filter(doc => !doc.get("backgroundAttention.refunds"));
  for (const doc of eligible) {
    try { await processRefund(doc.id); }
    catch (error) {
      failures.push(doc.id);
      if (error instanceof Error && /INVALID_REFUND|MISMATCH|EXCEEDS_CAPTURED|REQUEST_CHANGED/.test(error.message)) await adminDb.runTransaction(async tx => {
        const current = (await tx.get(doc.ref)).data();
        if (current && !["processed", "failed"].includes(current.status) && !(current.leaseExpiresAt?.toMillis() > Date.now())) tx.update(doc.ref, { status: "attention", lastError: error.message, updatedAt: FieldValue.serverTimestamp() });
      });
    }
  }
  return { examined: eligible.length, failures, hasMore: eligible.length === 5 && failures.length === 0 };
}

/** Reconcile a known order, or recover an interrupted creation using its unique receipt. Never create a replacement order. */
export async function reconcileBookingPayment(bookingId: string) {
  const ref = adminDb.collection("bookings").doc(bookingId);
  const data = (await ref.get()).data();
  if (!data || data.paymentMethod !== "online") return;
  let orderId = data.razorpayOrderId;
  if (!orderId) {
    const result = await razorpay(`orders?receipt=${encodeURIComponent(data.confirmationCode)}&count=100`);
    const matches = result.items?.filter((order: { receipt: string; amount: number; currency: string; notes?: { bookingId?: string } }) => order.receipt === data.confirmationCode && order.notes?.bookingId === bookingId && order.amount === data.payableNowPaise && order.currency === data.currency) ?? [];
    if (matches.length !== 1) throw new Error("PAYMENT_ORDER_RECONCILIATION_REQUIRED");
    orderId = matches[0].id;
    await ref.update({ razorpayOrderId: orderId, orderReconciliationRequired: false, updatedAt: FieldValue.serverTimestamp() });
  }
  const result = await razorpay(`orders/${encodeURIComponent(orderId)}/payments`);
  for (const payment of result.items ?? []) {
    if (payment.status === "captured") await confirmPaidBooking(bookingId, { actorId: "system:payments", orderId, paymentId: payment.id, source: "reconciliation" });
  }
}

export async function reconcilePaymentBatch(bookingId?: string) {
  const docs = bookingId ? { docs: [await adminDb.collection("bookings").doc(bookingId).get()], size: 1 } : await adminDb.collection("bookings").where("paymentReconciliationPending", "==", true).where("nextReconcileAt", "<=", Timestamp.now()).orderBy("nextReconcileAt", "asc").limit(3).get();
  const failures: string[] = [];
  const eligible = docs.docs.filter(doc => !doc.get("backgroundAttention.payments"));
  for (const doc of eligible) {
    const owner = randomUUID();
    const claimed = await adminDb.runTransaction(async tx => {
      const data = (await tx.get(doc.ref)).data();
      if (!data?.paymentReconciliationPending || data.backgroundAttention?.payments || data.nextReconcileAt?.toMillis() > Date.now() || data.leaseExpiresAt?.toMillis() > Date.now()) return false;
      const leaseExpiresAt = Timestamp.fromMillis(Date.now() + 90_000);
      tx.update(doc.ref, { leaseOwner: owner, leaseExpiresAt, nextReconcileAt: leaseExpiresAt }); return true;
    });
    if (!claimed) continue;
    const stopRenewing = renewRecordLease(doc.ref, owner, "nextReconcileAt");
    let failure: unknown;
    try { await reconcileBookingPayment(doc.id); } catch (error) { failure = error; failures.push(doc.id); }
    finally { await stopRenewing(); }
    await adminDb.runTransaction(async tx => {
      const data = (await tx.get(doc.ref)).data();
      if (data?.leaseOwner !== owner || data.leaseExpiresAt?.toMillis() <= Date.now()) return;
      const attempts = failure ? Number(data.reconcileFailures ?? 0) + 1 : 0;
      tx.update(doc.ref, { leaseOwner: null, leaseExpiresAt: null, reconcileFailures: attempts, nextReconcileAt: Timestamp.fromMillis(Date.now() + (failure ? retryDelay(attempts, 60_000) : 300_000)), lastReconcileAt: FieldValue.serverTimestamp(), lastReconcileError: failure instanceof Error ? failure.message : null });
    });
  }
  return { examined: eligible.length, failures, hasMore: !bookingId && eligible.length === 3 && failures.length === 0 };
}
