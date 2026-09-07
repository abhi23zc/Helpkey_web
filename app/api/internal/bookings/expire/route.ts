import { bookingError, expirePendingBookings } from "@/lib/bookings";

export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-cron-secret") ?? new URL(request.url).searchParams.get("secret");
    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) throw new Error("CRON_UNAUTHORIZED");
    return Response.json(await expirePendingBookings("system:booking-expiry"));
  } catch (error) {
    return Response.json({ error: bookingError(error) }, { status: 401 });
  }
}
