import { customerOwnsBooking } from "@/lib/booking/customer-access";
import { ApiException } from "@/lib/api/errors";
import { claimCheckoutAttempt, reconcilePaymentForGuest } from "@/lib/booking/recovery";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { bookingFailure } from "@/lib/booking/api-error";
import { withApiHandler } from "@/lib/api/handler";
import { Timestamp } from "firebase-admin/firestore";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { bookingError } from "@/lib/bookings";

const rawPOST = async function POST(_request: Request, { params }: RouteContext<"/api/bookings/[bookingId]/payment-session">) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    const { bookingId } = await params;
    if (_request.headers.get("x-checkout-recovery") === "1") {
      await enforceRateLimit({ bucket: "payment-attempt", identifier: user.uid, limit: 20, windowSeconds: 300, failClosed: true });
      return Response.json(await claimCheckoutAttempt(user.uid, bookingId));
    }
    const snap = await adminDb.collection("bookings").doc(bookingId).get();
    const data = snap.data();
    if (!snap.exists || !data || !customerOwnsBooking(data, user.uid)) throw new Error("BOOKING_NOT_FOUND");
    if (!(await reconcilePaymentForGuest(user.uid, bookingId)).paymentEligible) throw new Error("PAYMENT_ATTEMPT_ACTIVE");
    if (data.bookingStatus !== "pending_payment" || !data.razorpayOrderId) throw new Error("PAYMENT_NOT_EXPECTED");
    if (data.expiresAt instanceof Timestamp && data.expiresAt.toMillis() <= Date.now()) throw new Error("PAYMENT_NOT_EXPECTED");
    if (!process.env.RAZORPAY_KEY_ID) throw new Error("ONLINE_PAYMENT_NOT_CONFIGURED");
    return Response.json({
      bookingId,
      confirmationCode: data.confirmationCode,
      razorpay: {
        holdExpiresAt: data.expiresAt instanceof Timestamp ? data.expiresAt.toDate().toISOString() : null,
        serverTime: new Date().toISOString(),
        attemptId: data.checkoutAttempt?.id ?? null,
        keyId: process.env.RAZORPAY_KEY_ID,
        orderId: data.razorpayOrderId,
        amount: data.payableNowPaise ?? data.totalPaise,
        currency: data.currency ?? "INR",
        name: "Helpkey",
      },
    });
  } catch (error) {
    if (error instanceof ApiException) throw error;
    return Response.json(bookingFailure(error, bookingError(error)), { status: 422 });
  }
}

export const POST = withApiHandler(rawPOST, { route: "/api/bookings/[bookingId]/payment-session", auth: "strict", requireAuth: true, cache: "private" });
