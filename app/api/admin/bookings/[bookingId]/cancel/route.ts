import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/admin/data";
import { adminCancelBooking, bookingError } from "@/lib/bookings";

export async function POST(_request: Request, { params }: RouteContext<"/api/admin/bookings/[bookingId]/cancel">) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    await requireAdmin(user.uid);
    const { bookingId } = await params;
    await adminCancelBooking(user.uid, bookingId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: bookingError(error) }, { status: 422 });
  }
}
