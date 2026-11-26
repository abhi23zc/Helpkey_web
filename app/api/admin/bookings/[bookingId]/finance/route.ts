import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { readBookingFinance } from "@/lib/booking-finance/service";

export const GET = withApiHandler(async (_request: Request, context: { params: Promise<{ bookingId: string }> }) =>
  Response.json(await readBookingFinance(actorFromRequest().uid, (await context.params).bookingId, "admin")),
{ route: "/api/admin/bookings/[bookingId]/finance", auth: "strict", requireAuth: true, cache: "private" });
