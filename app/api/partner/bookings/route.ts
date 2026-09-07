import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/partner/service";
import { serializeBooking } from "@/lib/bookings";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    await requireRole(user.uid, "partner");
    const url = new URL(request.url);
    const propertyId = url.searchParams.get("propertyId");
    const status = url.searchParams.get("status");
    const search = (url.searchParams.get("q") ?? "").trim().toLowerCase();

    const memberships = await adminDb.collection("propertyMemberships").where("userId", "==", user.uid).where("status", "==", "active").get();
    const allowed = new Set(memberships.docs.map((doc) => doc.data().propertyId).filter(Boolean));
    if (propertyId && !allowed.has(propertyId)) throw new Error("FORBIDDEN");
    if (!propertyId && allowed.size === 0) return Response.json({ bookings: [] });

    let rows: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    if (propertyId) {
      let query: FirebaseFirestore.Query = adminDb.collection("bookings").where("propertyId", "==", propertyId);
      if (status && status !== "all") query = query.where("bookingStatus", "==", status);
      rows = (await query.limit(200).get()).docs;
    } else {
      const chunks = [...allowed].slice(0, 10);
      rows = (await Promise.all(chunks.map((id) => adminDb.collection("bookings").where("propertyId", "==", id).limit(100).get()))).flatMap((snap) => snap.docs);
    }

    const bookings = rows
      .map((doc) => serializeBooking(doc.id, doc.data()))
      .filter((booking) => (!status || status === "all" || booking.bookingStatus === status) && (!search || [booking.confirmationCode, booking.propertyName, booking.roomName, booking.leadGuest?.name, booking.leadGuest?.email, booking.leadGuest?.phone].some((value) => String(value ?? "").toLowerCase().includes(search))))
      .sort((a, b) => String(b.checkIn).localeCompare(String(a.checkIn)));
    return Response.json({ bookings });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load reservations." }, { status: 403 });
  }
}
