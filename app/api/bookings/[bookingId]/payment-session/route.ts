import { Timestamp } from "firebase-admin/firestore";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { bookingError } from "@/lib/bookings";

export async function POST(_request: Request, { params }: RouteContext<"/api/bookings/[bookingId]/payment-session">) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    const { bookingId } = await params;
    const snap = await adminDb.collection("bookings").doc(bookingId).get();
    const data = snap.data();
    if (!snap.exists || data?.guestId !== user.uid) throw new Error("BOOKING_NOT_FOUND");
    if (data.bookingStatus !== "pending_payment" || !data.razorpayOrderId) throw new Error("PAYMENT_NOT_EXPECTED");
    if (data.expiresAt instanceof Timestamp && data.expiresAt.toMillis() <= Date.now()) throw new Error("PAYMENT_NOT_EXPECTED");
    if (!process.env.RAZORPAY_KEY_ID) throw new Error("ONLINE_PAYMENT_NOT_CONFIGURED");
    return Response.json({
      bookingId,
      confirmationCode: data.confirmationCode,
      razorpay: {
        keyId: process.env.RAZORPAY_KEY_ID,
        orderId: data.razorpayOrderId,
        amount: data.payableNowPaise ?? data.totalPaise,
        currency: data.currency ?? "INR",
        name: "Helpkey",
      },
    });
  } catch (error) {
    return Response.json({ error: bookingError(error) }, { status: 422 });
  }
}
