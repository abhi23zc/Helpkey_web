import { getAuthenticatedUser } from "@/lib/auth/session";
import { bookingError, cancelBookingForUser } from "@/lib/bookings";

export async function POST(_request: Request, { params }: RouteContext<"/api/bookings/[bookingId]/cancel">) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    const { bookingId } = await params;
    await cancelBookingForUser(user.uid, bookingId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: bookingError(error) }, { status: 422 });
  }
}
