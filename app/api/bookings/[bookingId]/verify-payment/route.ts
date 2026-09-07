import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { bookingError, verifyBookingPayment } from "@/lib/bookings";

export async function POST(request: Request, { params }: RouteContext<"/api/bookings/[bookingId]/verify-payment">) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    const { bookingId } = await params;
    const booking = await adminDb.collection("bookings").doc(bookingId).get();
    if (!booking.exists || booking.data()?.guestId !== user.uid) throw new Error("BOOKING_NOT_FOUND");
    await verifyBookingPayment(user.uid, bookingId, await request.json());
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: bookingError(error) }, { status: 422 });
  }
}
