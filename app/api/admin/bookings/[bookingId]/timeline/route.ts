import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/admin/data";
import { adminDb } from "@/lib/firebase/admin";
import { toPlainJson } from "@/lib/api/plain";
async function get(_request: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  await requireAdmin(user.uid);
  const { bookingId } = await params;
  const ref = adminDb.collection("bookings").doc(bookingId);
  const booking = await ref.get();
  if (!booking.exists) return Response.json({ error: "BOOKING_NOT_FOUND" }, { status: 404 });
  const [events, payments, refunds, hold] = await Promise.all([ref.collection("events").orderBy("createdAt", "asc").get(), adminDb.collection("paymentAttempts").where("bookingId", "==", bookingId).get(), adminDb.collection("refunds").where("bookingId", "==", bookingId).get(), adminDb.collection("inventoryHolds").doc(bookingId).get()]);
  const rows = (snapshot: FirebaseFirestore.QuerySnapshot) => snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return Response.json(toPlainJson({ events: rows(events), payments: rows(payments), refunds: rows(refunds), allocation: hold.data() ?? null, cancellationReason: booking.data()?.statusReason ?? null }));
}
export const GET = withApiHandler(get, { route: "/api/admin/bookings/[bookingId]/timeline", auth: "strict", requireAuth: true, cache: "private" });
