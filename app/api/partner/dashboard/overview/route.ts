import { withApiHandler } from "@/lib/api/handler";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { propertyOwner } from "@/lib/partner/service";
import { localParts } from "@/lib/booking/domain";
import { intervalReport } from "@/lib/booking/reporting";
import { reviewSummary } from "@/lib/reviews";

const querySchema = z.object({
  propertyId: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  range: z.enum(["daily", "weekly", "monthly"]).default("daily"),
});

const activeBookingStatuses = new Set(["pending_payment", "confirmed", "checked_in", "checked_out", "completed"]);
const occupiedStatuses = new Set(["confirmed", "checked_in"]);
const terminalBookingStatuses = new Set(["cancelled", "expired", "payment_failed", "no_show"]);

function number(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function iso(value: unknown) {
  return value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function"
    ? value.toDate().toISOString()
    : null;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}

function startOfWeek(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  return dateKey(date);
}

function monthKey(value: string) {
  return value.slice(0, 7);
}

function reportBuckets(selectedDate: string, range: "daily" | "weekly" | "monthly") {
  if (range === "daily") {
    return Array.from({ length: 7 }, (_, index) => {
      const key = addDays(selectedDate, index - 6);
      return { key, label: new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${key}T00:00:00Z`)), start: key, end: key };
    });
  }
  if (range === "weekly") {
    const end = startOfWeek(selectedDate);
    return Array.from({ length: 8 }, (_, index) => {
      const start = addDays(end, (index - 7) * 7);
      return { key: start, label: new Intl.DateTimeFormat("en-IN", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${start}T00:00:00Z`)), start, end: addDays(start, 6) };
    });
  }
  const end = new Date(`${selectedDate.slice(0, 7)}-01T00:00:00.000Z`);
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + index - 11, 1));
    const key = dateKey(date).slice(0, 7);
    return { key, label: new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(date), start: `${key}-01`, end: dateKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))) };
  });
}

function dateInBucket(date: string | null, bucket: { start: string; end: string }, range: "daily" | "weekly" | "monthly") {
  if (!date) return false;
  if (range === "monthly") return monthKey(date) === monthKey(bucket.start);
  return date >= bucket.start && date <= bucket.end;
}

function bookingDate(data: FirebaseFirestore.DocumentData, field: "createdAt" | "paidAt", timezone: string) {
  const value = iso(data[field]);
  return value ? localParts(Date.parse(value), timezone).date : null;
}

const rawGET = async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });

  try {
    const raw = Object.fromEntries(new URL(request.url).searchParams);
    const input = querySchema.parse(raw);
    const propertyRef = await propertyOwner(user.uid, input.propertyId);
    const [propertySnap, bookingsSnap, roomsSnap, refundsSnap] = await Promise.all([
      propertyRef.get(),
      adminDb.collection("bookings").where("propertyId", "==", input.propertyId).get(),
      adminDb.collection("roomTypes").where("propertyId", "==", input.propertyId).get(),
      adminDb.collection("refunds").where("propertyId", "==", input.propertyId).get(),
    ]);
    const property = propertySnap.data() ?? {};
    const bookings: Array<FirebaseFirestore.DocumentData & { id: string; bookingStatus: string; checkIn: string; checkOut: string }> = bookingsSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id, bookingStatus: String(doc.data().bookingStatus), checkIn: String(doc.data().checkIn), checkOut: String(doc.data().checkOut) }));
    const rooms: Array<FirebaseFirestore.DocumentData & { id: string }> = roomsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const buckets = reportBuckets(input.date, input.range);
    const activeRooms = rooms.filter((room) => room.status === "active");
    const sellableInventory = activeRooms.reduce((total, room) => total + Math.max(0, number(room.totalInventory)), 0);

    const inventoryDays = Array.from({ length: 7 }, (_, index) => addDays(input.date, index));
    const inventoryRefs = activeRooms.flatMap((room) => inventoryDays.map((day) => adminDb.collection(property.inventoryEngine === "interval_v1" ? "inventoryCalendars" : "roomNightInventory").doc(`${input.propertyId}_${room.id}_${day}`)));
    const inventorySnaps = inventoryRefs.length ? await adminDb.getAll(...inventoryRefs) : [];
    const reservedByDay = new Map(inventoryDays.map((day) => [day, 0]));
    for (const snap of inventorySnaps) {
      const data = snap.data();
      const day = typeof data?.date === "string" ? data.date : snap.id.slice(-10);
      const reserved = property.inventoryEngine === "interval_v1" ? Math.max(0, ...Object.keys(data?.reserved ?? {}).map((key) => number(data?.reserved?.[key]) + number(data?.blocked?.[key])), ...Object.keys(data?.blocked ?? {}).map((key) => number(data?.reserved?.[key]) + number(data?.blocked?.[key]))) : Math.max(0, number(data?.reserved));
      reservedByDay.set(day, (reservedByDay.get(day) ?? 0) + reserved);
    }

    const dayBookings = bookings.filter((booking) => booking.checkIn === input.date && occupiedStatuses.has(String(booking.bookingStatus)));
    const departures = bookings.filter((booking) => booking.checkOut === input.date && ["checked_in", "checked_out", "completed"].includes(String(booking.bookingStatus)));
    const staying = bookings.filter((booking) => booking.checkIn <= input.date && booking.checkOut > input.date && occupiedStatuses.has(String(booking.bookingStatus)));
    const pendingRequests = bookings.filter((booking) => (Boolean(booking.specialRequest) || (Array.isArray(booking.customizations) && booking.customizations.some((r: { status?: string }) => r.status === "requested"))) && activeBookingStatuses.has(String(booking.bookingStatus)));
    const noShowRisk = bookings.filter((booking) => booking.bookingStatus === "confirmed" && (booking.startAt ? Date.parse(booking.startAt) < Date.now() : booking.checkIn < input.date));

    const series = buckets.map((bucket) => {
      let bookedPaise = 0;
      let paidPaise = 0;
      for (const booking of bookings) {
        if (!terminalBookingStatuses.has(String(booking.bookingStatus)) && dateInBucket(bookingDate(booking, "createdAt", property.timezone ?? "Asia/Kolkata"), bucket, input.range)) bookedPaise += Math.max(0, number(booking.totalPaise) - number(booking.customizationCreditPaise));
        if (number(booking.paidPaise) > 0 && dateInBucket(bookingDate(booking, "paidAt", property.timezone ?? "Asia/Kolkata"), bucket, input.range)) paidPaise += Math.max(0, number(booking.paidPaise));
      }
      const report = intervalReport(bookings as Parameters<typeof intervalReport>[0], bucket.start, addDays(bucket.end, 1), property.timezone ?? "Asia/Kolkata", sellableInventory);
      const refundedPaise = refundsSnap.docs.filter((doc) => { const data = doc.data(), processedAt = iso(data.processedAt); return data.status === "processed" && processedAt && dateInBucket(localParts(Date.parse(processedAt), property.timezone ?? "Asia/Kolkata").date, bucket, input.range); }).reduce((sum, doc) => sum + number(doc.data().amountPaise), 0);
      return { label: bucket.label, bookedPaise, paidPaise, refundedPaise, ...report };
    });

    const dayReport = intervalReport(bookings as Parameters<typeof intervalReport>[0], input.date, addDays(input.date, 1), property.timezone ?? "Asia/Kolkata", sellableInventory);
    const review = reviewSummary(property.reviewSummary);
    let latestReview: { reviewerName: string; rating: number; text: string; submittedAt: string | null } | null = null;
    try {
      const latest = await adminDb.collection("propertyReviews").where("propertyId", "==", input.propertyId).where("status", "==", "approved").orderBy("submittedAt", "desc").limit(1).get();
      const data = latest.docs[0]?.data();
      if (data) latestReview = { reviewerName: typeof data.reviewerName === "string" ? data.reviewerName : "Helpkey guest", rating: number(data.rating), text: typeof data.text === "string" ? data.text : "", submittedAt: iso(data.submittedAt) ?? iso(data.updatedAt) };
    } catch { /* summary remains available when the compound index is not deployed */ }

    const upcomingReservations = bookings
      .filter((booking) => booking.checkIn >= input.date && activeBookingStatuses.has(String(booking.bookingStatus)))
      .sort((a, b) => String(a.checkIn).localeCompare(String(b.checkIn)))
      .slice(0, 6)
      .map((booking) => ({
        id: booking.id,
        confirmationCode: typeof booking.confirmationCode === "string" ? booking.confirmationCode : "—",
        guestName: typeof booking.leadGuest?.name === "string" ? booking.leadGuest.name : "Guest",
        roomName: typeof booking.roomType?.name === "string" ? booking.roomType.name : "Room",
        checkIn: String(booking.checkIn), checkOut: String(booking.checkOut), nights: number(booking.nights),
        paymentStatus: String(booking.paymentStatus ?? "pending"), bookingStatus: String(booking.bookingStatus ?? "pending_payment"),
        specialRequest: typeof booking.specialRequest === "string" ? booking.specialRequest : null,
      }));

    const available = inventoryDays.map((date) => {
      const reserved = reservedByDay.get(date) ?? 0;
      const remaining = Math.max(0, sellableInventory - reserved);
      return { date, total: sellableInventory, reserved, remaining, percentage: sellableInventory ? Math.round((remaining / sellableInventory) * 100) : 0 };
    });
    const alerts = [
      ...available.filter((day) => day.total > 0 && day.percentage <= 20).slice(0, 2).map((day) => ({ type: "availability" as const, title: "Low availability", detail: `${day.remaining} room${day.remaining === 1 ? "" : "s"} left for ${day.date}`, href: "/partner/rooms" })),
      ...(pendingRequests.length ? [{ type: "requests" as const, title: "Guest requests", detail: `${pendingRequests.length} reservation${pendingRequests.length === 1 ? "" : "s"} need review`, href: "/partner/reservations" }] : []),
      ...(review?.count ? [{ type: "reviews" as const, title: "Guest reviews", detail: `${review.count} approved Helpkey review${review.count === 1 ? "" : "s"}`, href: "/partner/reviews" }] : []),
    ].slice(0, 4);

    return Response.json({
      property: { name: typeof property.name === "string" ? property.name : "Property", status: property.status ?? "draft", onboarding: property.onboarding ?? { completedSteps: [] } },
      currency: typeof property.currency === "string" ? property.currency : "INR",
      metrics: { platformCollectedPaise: bookings.filter((booking) => booking.paymentMethod === "online").reduce((sum, booking) => sum + number(booking.paidPaise), 0), propertyCollectedPaise: bookings.filter((booking) => booking.paymentStatus === "paid_at_property").reduce((sum, booking) => sum + number(booking.paidPaise), 0), roomHours: dayReport.roomHours, roomNights: dayReport.roomNights, refundedPaise: bookings.reduce((sum, booking) => sum + number(booking.refundedPaise), 0), arrivals: dayBookings.length, departures: departures.length, occupancy: dayReport.occupancy, stayingTonight: staying.length, pendingRequests: pendingRequests.length, noShowRisk: noShowRisk.length, bookedPaise: series.reduce((total, item) => total + item.bookedPaise, 0), paidPaise: series.reduce((total, item) => total + item.paidPaise, 0) },
      series, availability: available, upcomingReservations, review: { summary: review ?? { count: 0, average: 0 }, latest: latestReview }, alerts,
    });
  } catch (error) {
    const message = error instanceof z.ZodError ? "Invalid dashboard request." : error instanceof Error && error.message === "FORBIDDEN" ? "Property access required." : "Unable to load dashboard overview.";
    return Response.json({ error: message }, { status: message === "Property access required." ? 403 : 422 });
  }
}

export const GET = withApiHandler(rawGET, { route: "/api/partner/dashboard/overview", auth: "read", requireAuth: true, cache: "private" });
