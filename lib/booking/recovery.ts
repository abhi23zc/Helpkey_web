import { customerOwnsBooking } from "./customer-access";
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { reconcileBookingPayment } from "./processing";
import { providerFetch } from "@/lib/providers/http";

export function submissionBookingId(uid: string, key: string) {
  return createHash("sha256").update(`${uid}\0${key}`).digest("hex");
}

// Reading the booking and writing closure in one transaction conflicts with creation's closure read.
// Never expire these tombstones: an arbitrarily delayed original request must stay closed.
export async function recoverSubmission(uid: string, key: string) {
  if (!key || key.length > 200) throw new Error("INVALID_SUBMISSION_KEY");
  const id = submissionBookingId(uid, key);
  return adminDb.runTransaction(async tx => {
    const booking = (await tx.get(adminDb.collection("bookings").doc(id))).data();
    if (booking) {
      if (!customerOwnsBooking(booking, uid)) throw new Error("BOOKING_NOT_FOUND");
      return { state: "booking_exists" as const, bookingId: id, confirmationCode: String(booking.confirmationCode) };
    }
    tx.set(adminDb.collection("bookingSubmissionClosures").doc(id), { uid, closedAt: FieldValue.serverTimestamp() });
    return { state: "closed_without_booking" as const };
  });
}

type ProviderPayment = { id: string; status: string; order_id: string; amount: number; currency: string };
async function orderPayments(orderId: string, amount: number, currency: string) {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const response = await providerFetch("razorpay", `https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}/payments`, { headers: { Authorization: `Basic ${auth}` }, timeoutMs: 8000, idempotent: true });
  const result = await response.json();
  if (!response.ok || !Array.isArray(result.items) || result.count !== result.items.length) throw new Error("PAYMENT_ORDER_RECONCILIATION_REQUIRED");
  const items = result.items as ProviderPayment[];
  if (items.some(p => typeof p.id !== "string" || p.order_id !== orderId || p.amount !== amount || p.currency !== currency || !["created", "authorized", "captured", "refunded", "failed"].includes(p.status))) throw new Error("PAYMENT_ORDER_RECONCILIATION_REQUIRED");
  return items;
}

export function paymentEligibility(data: FirebaseFirestore.DocumentData, now: number, providerSafe: boolean) {
  return data.bookingStatus === "pending_payment" && data.paymentStatus === "pending" && data.inventoryReleased !== true &&
    data.expiresAt instanceof Timestamp && data.expiresAt.toMillis() > now && Boolean(data.razorpayOrderId) &&
    !data.checkoutAttempt && !data.checkoutReplacement && !data.paymentReplacementUnresolved && !data.checkoutNeedsReplacement && providerSafe;
}

export async function reconcilePaymentForGuest(uid: string, bookingId: string, report?: { attemptId?: string; nativeResult?: string }) {
  const ref = adminDb.collection("bookings").doc(bookingId);
  const initial = (await ref.get()).data();
  if (!initial || !customerOwnsBooking(initial, uid)) throw new Error("BOOKING_NOT_FOUND");
  let providerSafe = initial.paymentMethod !== "online";
  let paymentIds: string[] = [];
  let reconciled = true, refundedOrder = false;
  if (initial.paymentMethod === "online") {
    try {
      await reconcileBookingPayment(bookingId);
      const current = (await ref.get()).data()!;
      if (current.razorpayOrderId) {
        const payments = await orderPayments(current.razorpayOrderId, current.payableNowPaise, current.currency);
        providerSafe = payments.every(p => p.status === "failed");
        paymentIds = payments.map(p => p.id);
        if (current.editPolicy?.version === 1 && current.bookingStatus === "pending_payment" && payments.length > 0 && payments.every(p => ["failed", "refunded"].includes(p.status)) && payments.some(p => p.status === "refunded") && !current.refundDuePaise && !current.paymentReplacementUnresolved) {
          refundedOrder = await adminDb.runTransaction(async tx => {
            const b = (await tx.get(ref)).data()!;
            if (b.razorpayOrderId !== current.razorpayOrderId || b.checkoutReplacement || b.refundDuePaise || b.paymentReplacementUnresolved) return false;
            const refunds = await tx.get(adminDb.collection("refunds").where("bookingId", "==", bookingId));
            for (const p of payments.filter(p => p.status === "refunded")) {
              const receipt = await tx.get(adminDb.collection("paymentAttempts").doc(p.id));
              if (!receipt.get("unusable") || receipt.get("amountPaise") !== p.amount || refunds.docs.filter(d => d.get("paymentId") === p.id && d.get("status") === "processed").reduce((n, d) => n + d.get("amountPaise"), 0) !== p.amount) return false;
            }
            tx.update(ref, { checkoutAttempt: null, checkoutNeedsReplacement: true, updatedAt: FieldValue.serverTimestamp() });
            return true;
          });
        }

        // Absence of a payment is never evidence that an opened sheet cannot still authorize.
        if (providerSafe && report?.attemptId && ["cancelled", "failed"].includes(report.nativeResult ?? "")) {
          await adminDb.runTransaction(async tx => {
            const data = (await tx.get(ref)).data()!;
            const attempt = data.checkoutAttempt;
            if (attempt?.id === report.attemptId && payments.some(p => !(attempt.baselinePaymentIds ?? []).includes(p.id)))
              tx.update(ref, { checkoutAttempt: null, updatedAt: FieldValue.serverTimestamp() });
          });
        }
      }
    } catch { reconciled = false; providerSafe = false; }
  }
  const data = (await ref.get()).data()!;
  const now = Date.now();
  const terminal = ["paid", "partially_paid", "pay_at_property", "paid_at_property", "refund_pending", "refunded", "partially_refunded"].includes(data.paymentStatus);
  const eligible = reconciled && paymentEligibility(data, now, providerSafe);
  const closed = data.bookingStatus !== "pending_payment" || !(data.expiresAt instanceof Timestamp) || data.expiresAt.toMillis() <= now;
  const replacementEligible = !closed && !terminal && reconciled && refundedOrder && !data.checkoutAttempt && !data.checkoutReplacement && !data.paymentReplacementUnresolved;
  return {
    paymentAction: terminal || closed ? "none" : eligible ? "pay" : "check_status",
    reasonCode: terminal ? "PAYMENT_SETTLED" : closed ? "BOOKING_CLOSED" : !reconciled ? "PROVIDER_UNAVAILABLE" : replacementEligible ? "CHECKOUT_REPLACEMENT_REQUIRED" : data.checkoutAttempt ? "PAYMENT_ATTEMPT_UNRESOLVED" : eligible ? "PAYMENT_ELIGIBLE" : "PAYMENT_PROCESSING",
    nextCheckAfterMs: terminal || closed ? 0 : 5000,
    bookingId, confirmationCode: String(data.confirmationCode), bookingStatus: String(data.bookingStatus), paymentStatus: String(data.paymentStatus),
    reconciliationState: terminal ? "settled" : replacementEligible ? "checked" : reconciled && !data.checkoutAttempt && !data.checkoutReplacement && !data.paymentReplacementUnresolved && providerSafe ? "checked" : "awaiting_verification",
    paymentEligible: eligible,
    replacementEligible,
    holdExpiresAt: data.expiresAt instanceof Timestamp ? data.expiresAt.toDate().toISOString() : null,
    serverTime: new Date(now).toISOString(), attemptId: data.checkoutAttempt?.id ?? null,
    // Internal only; routes strip these fields.
    paymentIds, orderId: data.razorpayOrderId as string | undefined,
  };
}

export async function claimCheckoutAttempt(uid: string, bookingId: string) {
  const checked = await reconcilePaymentForGuest(uid, bookingId);
  if (!checked.paymentEligible) throw new Error("PAYMENT_ATTEMPT_ACTIVE");
  const ref = adminDb.collection("bookings").doc(bookingId);
  return adminDb.runTransaction(async tx => {
    const data = (await tx.get(ref)).data();
    if (!data || !customerOwnsBooking(data, uid)) throw new Error("BOOKING_NOT_FOUND");
    if (!paymentEligibility(data, Date.now(), true) || data.razorpayOrderId !== checked.orderId) throw new Error("PAYMENT_ATTEMPT_ACTIVE");
    const attemptId = randomUUID();
    tx.update(ref, { checkoutAttempt: { id: attemptId, orderId: data.razorpayOrderId, baselinePaymentIds: checked.paymentIds, startedAt: Timestamp.now() }, updatedAt: FieldValue.serverTimestamp() });
    return { bookingId, confirmationCode: data.confirmationCode, razorpay: { keyId: process.env.RAZORPAY_KEY_ID, orderId: data.razorpayOrderId, amount: data.payableNowPaise, currency: data.currency, name: "Helpkey", attemptId, holdExpiresAt: data.expiresAt.toDate().toISOString(), serverTime: new Date().toISOString(), recoveryVersion: 1 } };
  });
}
