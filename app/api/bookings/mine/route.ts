import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { serializeBookingWithResolvedMedia } from "@/lib/bookings";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const rows = await adminDb.collection("bookings").where("guestId", "==", user.uid).limit(100).get();
  const bookings = await Promise.all(rows.docs.map((doc) => serializeBookingWithResolvedMedia(doc.id, doc.data())));
  return Response.json({
    bookings: bookings
      .sort((a, b) => String(b.checkIn).localeCompare(String(a.checkIn))),
  });
}
