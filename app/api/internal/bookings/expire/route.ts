import { expirePendingBookings } from "@/lib/bookings";
import { withApiHandler } from "@/lib/api/handler";
import { ApiException } from "@/lib/api/errors";

const rawPOST = async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) throw new ApiException("CRON_UNAUTHORIZED", 401, "Worker authentication failed.");
  return Response.json(await expirePendingBookings("system:booking-expiry"));
};

export const POST = withApiHandler(rawPOST, { route: "/api/internal/bookings/expire", auth: "public", csrf: false, cache: "private", bodyLimitBytes: 1_024 });
