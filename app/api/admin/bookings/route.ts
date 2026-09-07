import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/admin/data";
import { serializeBooking } from "@/lib/bookings";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    await requireAdmin(user.uid);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const search = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    let query: FirebaseFirestore.Query = adminDb.collection("bookings");
    if (status && status !== "all") query = query.where("bookingStatus", "==", status);
    const snap = await query.limit(200).get();
    const bookings = snap.docs
      .map((doc) => serializeBooking(doc.id, doc.data()))
      .filter((booking) => !search || [booking.confirmationCode, booking.propertyName, booking.roomName, booking.leadGuest?.name, booking.leadGuest?.email, booking.leadGuest?.phone].some((value) => String(value ?? "").toLowerCase().includes(search)))
      .sort((a, b) => String(b.createdAt ?? b.checkIn).localeCompare(String(a.createdAt ?? a.checkIn)));
    return Response.json({ bookings });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load bookings." }, { status: 403 });
  }
}
