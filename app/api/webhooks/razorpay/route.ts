import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { bookingError, confirmPaidBooking, releaseBookingHold } from "@/lib/bookings";

const paymentEntity = z.object({
  id: z.string().min(1),
  order_id: z.string().min(1),
  notes: z.record(z.string(), z.unknown()).optional().default({}),
}).passthrough();

const webhookSchema = z.object({
  event: z.string().min(1),
  payload: z.object({
    payment: z.object({ entity: paymentEntity }).optional(),
  }).passthrough(),
}).passthrough();

function safeCompare(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function bookingIdForPayment(orderId: string, notes: Record<string, unknown>) {
  if (typeof notes.bookingId === "string" && notes.bookingId) return notes.bookingId;
  const snap = await adminDb.collection("bookings").where("razorpayOrderId", "==", orderId).limit(1).get();
  return snap.docs[0]?.id ?? null;
}

export async function POST(request: Request) {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new Error("WEBHOOK_NOT_CONFIGURED");
    const body = await request.text();
    const signature = request.headers.get("x-razorpay-signature") ?? "";
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    if (!safeCompare(expected, signature)) throw new Error("WEBHOOK_SIGNATURE_INVALID");

    const input = webhookSchema.parse(JSON.parse(body));
    const payment = input.payload.payment?.entity;
    if (!payment) return Response.json({ ok: true, ignored: true });
    const bookingId = await bookingIdForPayment(payment.order_id, payment.notes);
    if (!bookingId) return Response.json({ ok: true, ignored: true });

    if (input.event === "payment.captured") {
      await confirmPaidBooking(bookingId, { actorId: "razorpay:webhook", orderId: payment.order_id, paymentId: payment.id, source: "razorpay_webhook" });
    } else if (input.event === "payment.failed") {
      await releaseBookingHold(bookingId, "razorpay:webhook", "payment_failed", "RAZORPAY_PAYMENT_FAILED");
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: bookingError(error) }, { status: 422 });
  }
}
