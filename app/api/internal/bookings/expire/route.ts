import { processBookingNotifications } from "@/lib/booking/notifications";
import { processRefundBatch, reconcilePaymentBatch } from "@/lib/booking/processing";
import { expirePendingBookings } from "@/lib/bookings";
import { withApiHandler } from "@/lib/api/handler";
import { ApiException } from "@/lib/api/errors";

const rawPOST = async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) throw new ApiException("CRON_UNAUTHORIZED", 401, "Worker authentication failed.");
  const task = new URL(request.url).searchParams.get("task") ?? "all";
  if (task === "expiry") return Response.json(await expirePendingBookings("system:booking-expiry"));
  if (task === "payments") return Response.json(await reconcilePaymentBatch());
  if (task === "refunds") return Response.json(await processRefundBatch());
  if (task === "notifications") return Response.json(await processBookingNotifications());
  if (task !== "all") throw new ApiException("INVALID_MAINTENANCE_TASK", 422, "Unknown maintenance task.");
  const expiry = await expirePendingBookings("system:booking-expiry");
  const payments = await reconcilePaymentBatch();
  const refunds = await processRefundBatch();
  const notifications = await processBookingNotifications();
  return Response.json({ ...expiry, payments, refunds, notifications });
};

export const POST = withApiHandler(rawPOST, { route: "/api/internal/bookings/expire", auth: "public", csrf: false, cache: "private", bodyLimitBytes: 1_024 });
