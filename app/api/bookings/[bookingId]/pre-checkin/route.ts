import { getAuthenticatedUser } from "@/lib/auth/session";
import { withApiHandler } from "@/lib/api/handler";
import { guestStayOptions, savePreCheckin } from "@/lib/stay/service";
import { bookingForGuest } from "@/lib/bookings";
import { stayError } from "@/lib/stay/api";
type Context = { params: Promise<{ bookingId: string }> };
async function get(_request: Request, { params }: Context) {
  const u = await getAuthenticatedUser();
  if (!u) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  try {
    return Response.json(
      await guestStayOptions(u.uid, (await params).bookingId),
    );
  } catch (e) {
    return stayError(e);
  }
}
async function save(request: Request, { params }: Context) {
  const u = await getAuthenticatedUser();
  if (!u) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  try {
    const { bookingId } = await params;
    await savePreCheckin(u.uid, bookingId, await request.json());
    return Response.json({ booking: await bookingForGuest(u.uid, bookingId) });
  } catch (e) {
    return stayError(e);
  }
}
export const GET = withApiHandler(get, {
  route: "/api/bookings/[bookingId]/pre-checkin",
  auth: "read",
  requireAuth: true,
  cache: "private",
});
export const POST = withApiHandler(save, {
  route: "/api/bookings/[bookingId]/pre-checkin",
  auth: "strict",
  requireAuth: true,
  cache: "private",
});
