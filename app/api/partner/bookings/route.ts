import { withApiHandler } from "@/lib/api/handler";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/partner/service";
import { createManualReservation, serializeBooking } from "@/lib/bookings";
import { reservationSummary } from "@/lib/booking/reporting";
import { decodeCursor, encodeCursor } from "@/lib/api/pagination";

const rawGET = async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    await requireRole(user.uid, "partner");
    const url = new URL(request.url);
    const propertyId = url.searchParams.get("propertyId");
    const status = url.searchParams.get("status");
    const mode = url.searchParams.get("bookingMode");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const search = (url.searchParams.get("q") ?? "").trim().toLowerCase();

    const memberships = await adminDb.collection("propertyMemberships").where("userId", "==", user.uid).where("status", "==", "active").get();
    const allowed = new Set(memberships.docs.map((doc) => doc.data().propertyId).filter(Boolean));
    if (propertyId && !allowed.has(propertyId)) throw new Error("FORBIDDEN");
    if (!propertyId && allowed.size === 0) return Response.json({ bookings: [], hasMore: false, nextCursor: null });
    const selectedPropertyId = propertyId ?? [...allowed][0];
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 25, 1), 50);
    const snapshot = await adminDb.collection("bookings").where("propertyId", "==", selectedPropertyId).get();
    const property = (await adminDb.collection("properties").doc(selectedPropertyId).get()).data() ?? {};
    const summary = reservationSummary(snapshot.docs.map((doc) => doc.data() as Parameters<typeof reservationSummary>[0][number]), property.timezone ?? "Asia/Kolkata");
    const roomName = url.searchParams.get("roomName"), paymentStatus = url.searchParams.get("paymentStatus");
    const selected = snapshot.docs.filter((doc) => {
      const data = doc.data();
      return summary.matchesView(data as Parameters<typeof summary.matchesView>[0], status ?? "all")
        && (!mode || data.bookingMode === mode || (mode === "overnight" && !data.bookingMode))
        && (!from || data.checkIn >= from) && (!to || data.checkIn <= to)
        && (!search || data.searchTokens?.includes(search))
        && (!roomName || data.roomType?.name === roomName) && (!paymentStatus || data.paymentStatus === paymentStatus);
    }).sort((a, b) => String(b.data().startAt ?? b.data().checkIn).localeCompare(String(a.data().startAt ?? a.data().checkIn)) || b.id.localeCompare(a.id));
    const rawCursor = url.searchParams.get("cursor");
    const cursor = rawCursor ? decodeCursor(rawCursor) : null;
    const offset = cursor ? selected.findIndex((doc) => doc.id === cursor.id) + 1 : 0;
    if (cursor && offset === 0) throw new Error("CURSOR_EXPIRED");
    const page = selected.slice(offset, offset + limit);
    const hasMore = selected.length > offset + limit;
    const last = page.at(-1);
    return Response.json({ bookings: page.map((doc) => serializeBooking(doc.id, doc.data())), propertyId: selectedPropertyId, totalCount: selected.length, metrics: summary.metrics, tabCounts: summary.tabCounts, roomNames: summary.roomNames, hasMore, nextCursor: hasMore && last ? encodeCursor({ values: [], id: last.id }) : null });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load reservations." }, { status: 403 });
  }
}

const rawPOST = async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    await requireRole(user.uid, "partner");

    const raw = await request.json();
    const result = await createManualReservation(user.uid, raw, request.headers.get("idempotency-key") ?? JSON.stringify(raw));
    return Response.json({ bookingId: result.id, confirmationCode: result.confirmationCode }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid booking data: " + error.issues.map((i) => i.message).join(", ") }, { status: 422 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create booking." }, { status: 422 });
  }
}

export const GET = withApiHandler(rawGET, { route: "/api/partner/bookings", auth: "read", requireAuth: true, cache: "private" });
export const POST = withApiHandler(rawPOST, { route: "/api/partner/bookings", auth: "strict", requireAuth: true, cache: "private" });
