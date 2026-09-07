import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { serializeBooking } from "@/lib/bookings";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const rows = await adminDb.collection("bookings").where("guestId", "==", user.uid).limit(100).get();
  return Response.json({
    bookings: rows.docs
      .map((doc) => serializeBooking(doc.id, doc.data()))
      .sort((a, b) => String(b.checkIn).localeCompare(String(a.checkIn))),
  });
}
