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
      if (booking.guestId !== uid) throw new Error("BOOKING_NOT_FOUND");
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
    !data.checkoutAttempt && providerSafe;
}

export async function reconcilePaymentForGuest(uid: string, bookingId: string, report?: { attemptId?: string; nativeResult?: string }) {
  const ref = adminDb.collection("bookings").doc(bookingId);
  const initial = (await ref.get()).data();
  if (!initial || initial.guestId !== uid) throw new Error("BOOKING_NOT_FOUND");
  let providerSafe = initial.paymentMethod !== "online";
  let paymentIds: string[] = [];
  let reconciled = true;
  if (initial.paymentMethod === "online") {
    try {
      await reconcileBookingPayment(bookingId);
      const current = (await ref.get()).data()!;
      if (current.razorpayOrderId) {
        const payments = await orderPayments(current.razorpayOrderId, current.payableNowPaise, current.currency);
        providerSafe = payments.every(p => p.status === "failed");
        paymentIds = payments.map(p => p.id);
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
  const terminal = ["paid", "partially_paid", "pay_at_property", "paid_at_property", "refund_pending", "refunded", "partially_refunded"].includes(data.paymentStatus);
  return {
    bookingId, confirmationCode: String(data.confirmationCode), bookingStatus: String(data.bookingStatus), paymentStatus: String(data.paymentStatus),
    reconciliationState: terminal ? "settled" : reconciled && !data.checkoutAttempt && providerSafe ? "checked" : "awaiting_verification",
    paymentEligible: reconciled && paymentEligibility(data, Date.now(), providerSafe),
    holdExpiresAt: data.expiresAt instanceof Timestamp ? data.expiresAt.toDate().toISOString() : null,
    serverTime: new Date().toISOString(), attemptId: data.checkoutAttempt?.id ?? null,
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
    if (!data || data.guestId !== uid) throw new Error("BOOKING_NOT_FOUND");
    if (!paymentEligibility(data, Date.now(), true) || data.razorpayOrderId !== checked.orderId) throw new Error("PAYMENT_ATTEMPT_ACTIVE");
    const attemptId = randomUUID();
    tx.update(ref, { checkoutAttempt: { id: attemptId, orderId: data.razorpayOrderId, baselinePaymentIds: checked.paymentIds, startedAt: Timestamp.now() }, updatedAt: FieldValue.serverTimestamp() });
    return { bookingId, confirmationCode: data.confirmationCode, razorpay: { keyId: process.env.RAZORPAY_KEY_ID, orderId: data.razorpayOrderId, amount: data.payableNowPaise, currency: data.currency, name: "Helpkey", attemptId, holdExpiresAt: data.expiresAt.toDate().toISOString(), serverTime: new Date().toISOString(), recoveryVersion: 1 } };
  });
}
