import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/partner/service";
import { bookingError, releaseBookingHold } from "@/lib/bookings";

const schema = z.object({ status: z.enum(["checked_in", "completed", "no_show", "cancelled"]) }).strict();

export async function POST(request: Request, { params }: RouteContext<"/api/partner/bookings/[bookingId]/status">) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    await requireRole(user.uid, "partner");
    const { bookingId } = await params;
    const input = schema.parse(await request.json());
    const ref = adminDb.collection("bookings").doc(bookingId);
    const booking = await ref.get();
    const data = booking.data();
    if (!booking.exists || !data?.propertyId) throw new Error("BOOKING_NOT_FOUND");
    const membership = await adminDb.collection("propertyMemberships").doc(`${data.propertyId}_${user.uid}`).get();
    if (!membership.exists || membership.data()?.status !== "active") throw new Error("FORBIDDEN");
    if (input.status === "cancelled" || input.status === "no_show") {
      await releaseBookingHold(bookingId, user.uid, input.status, input.status === "cancelled" ? "PARTNER_CANCELLED" : "PARTNER_NO_SHOW");
    } else {
      if (!["confirmed", "checked_in"].includes(String(data.bookingStatus))) throw new Error("BOOKING_NOT_CANCELLABLE");
      await ref.update({ bookingStatus: input.status, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: bookingError(error) }, { status: 422 });
  }
}
