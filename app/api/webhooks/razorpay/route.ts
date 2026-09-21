import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { bookingError, confirmPaidBooking, releaseBookingHold } from "@/lib/bookings";
import { runIdempotent } from "@/lib/api/idempotency";
import { withApiHandler } from "@/lib/api/handler";
import { ApiException } from "@/lib/api/errors";

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

const rawPOST = async function POST(request: Request) {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new ApiException("WEBHOOK_NOT_CONFIGURED", 503, "Webhook processing is unavailable.");
    const body = await request.text();
    const signature = request.headers.get("x-razorpay-signature") ?? "";
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    if (!safeCompare(expected, signature)) throw new ApiException("WEBHOOK_SIGNATURE_INVALID", 401, "Webhook signature is invalid.");

    const input = webhookSchema.parse(JSON.parse(body));
    const payment = input.payload.payment?.entity;
    if (!payment) return Response.json({ ok: true, ignored: true });
    const bookingId = await bookingIdForPayment(payment.order_id, payment.notes);
    if (!bookingId) return Response.json({ ok: true, ignored: true });

    await runIdempotent("razorpay.webhook", `${input.event}:${payment.id}`, "razorpay", async () => {
      if (input.event === "payment.captured") await confirmPaidBooking(bookingId, { actorId: "razorpay:webhook", orderId: payment.order_id, paymentId: payment.id, source: "razorpay_webhook" });
      else if (input.event === "payment.failed") await releaseBookingHold(bookingId, "razorpay:webhook", "payment_failed", "RAZORPAY_PAYMENT_FAILED");
      return { applied: true };
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ApiException) throw error;
    if (error instanceof z.ZodError || error instanceof SyntaxError) throw error;
    throw new ApiException("WEBHOOK_PROCESSING_FAILED", 500, bookingError(error));
  }
};

export const POST = withApiHandler(rawPOST, { route: "/api/webhooks/razorpay", auth: "public", csrf: false, cache: "private", bodyLimitBytes: 256 * 1024 });
