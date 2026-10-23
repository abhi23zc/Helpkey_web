import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { bookingError, bookingForGuest } from "@/lib/bookings";

const rawGET = async function GET(
  _request: Request,
  { params }: RouteContext<"/api/bookings/[bookingId]">,
) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  try {
    const { bookingId } = await params;
    return Response.json({ booking: await bookingForGuest(user.uid, bookingId) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "BOOKING_NOT_FOUND";
    return Response.json(
      { error: bookingError(error), code },
      { status: code === "BOOKING_NOT_FOUND" ? 404 : 422 },
    );
  }
};

export const GET = withApiHandler(rawGET, {
  route: "/api/bookings/[bookingId]",
  auth: "read",
  requireAuth: true,
  cache: "private",
});
