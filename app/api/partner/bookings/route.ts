import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/partner/service";
import { serializeBooking } from "@/lib/bookings";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

const manualBookingSchema = z.object({
  propertyId: z.string().min(1),
  guestName: z.string().trim().min(2).max(120),
  guestEmail: z.string().trim().email().optional().or(z.literal("")),
  guestPhone: z.string().trim().min(7).max(25).optional().or(z.literal("")),
  roomDescription: z.string().trim().min(1).max(200),
  checkIn: z.string().regex(isoDate),
  checkOut: z.string().regex(isoDate),
  adults: z.number().int().min(1).max(12).default(1),
  children: z.number().int().min(0).max(10).default(0),
  nightlyRateRupees: z.number().min(0).default(0),
  paymentMethod: z.enum(["pay_at_property", "paid"]).default("pay_at_property"),
  specialRequest: z.string().trim().max(1000).optional().default(""),
});

function genCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return "HK-" + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

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

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    await requireRole(user.uid, "partner");

    const raw = await request.json();
    const input = manualBookingSchema.parse(raw);

    // Verify property membership
    const memberships = await adminDb.collection("propertyMemberships")
      .where("userId", "==", user.uid)
      .where("status", "==", "active")
      .get();
    const allowed = new Set(memberships.docs.map((doc) => doc.data().propertyId).filter(Boolean));
    if (!allowed.has(input.propertyId)) throw new Error("FORBIDDEN");

    // Fetch property name
    const propDoc = await adminDb.collection("properties").doc(input.propertyId).get();
    const propertyName = propDoc.data()?.name ?? "Property";

    // Calculate nights & totals
    const checkInMs = new Date(`${input.checkIn}T00:00:00Z`).getTime();
    const checkOutMs = new Date(`${input.checkOut}T00:00:00Z`).getTime();
    const nights = Math.round((checkOutMs - checkInMs) / 86400000);
    if (nights <= 0) throw new Error("CHECK_OUT_MUST_FOLLOW_CHECK_IN");

    const totalPaise = Math.round(input.nightlyRateRupees * nights * 100);
    const isPaid = input.paymentMethod === "paid";
    const confirmationCode = genCode();

    const ref = adminDb.collection("bookings").doc();
    await ref.set({
      confirmationCode,
      propertyId: input.propertyId,
      propertySlug: null,
      propertyName,
      source: "manual_partner",
      roomType: { id: "manual", name: input.roomDescription },
      ratePlan: { id: "manual", name: "Manual Booking" },
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      nights,
      adults: input.adults,
      children: input.children,
      infants: 0,
      leadGuest: {
        name: input.guestName,
        email: input.guestEmail || null,
        phone: input.guestPhone || null,
        adultGuestNames: [input.guestName],
      },
      specialRequest: input.specialRequest || "",
      subtotalPaise: totalPaise,
      taxPaise: 0,
      customerFeePaise: 0,
      totalPaise,
      payableNowPaise: totalPaise,
      paidPaise: isPaid ? totalPaise : 0,
      currency: "INR",
      bookingStatus: "confirmed",
      paymentStatus: isPaid ? "paid" : "pay_at_property",
      paymentMethod: input.paymentMethod,
      razorpayOrderId: null,
      razorpayPaymentId: null,
      expiresAt: null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: user.uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
    });

    return Response.json({ bookingId: ref.id, confirmationCode }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid booking data: " + error.issues.map((i) => i.message).join(", ") }, { status: 422 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create booking." }, { status: 422 });
  }
}
