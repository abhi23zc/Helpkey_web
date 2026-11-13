import { withApiHandler, actorFromRequest } from "@/lib/api/handler";
import { acceptCustomerLink } from "@/lib/partner/guests/service";
export const POST = withApiHandler(
  async (r, c: { params: Promise<{ bookingId: string }> }) =>
    Response.json(
      await acceptCustomerLink(
        actorFromRequest().uid,
        (await c.params).bookingId,
        await r.json(),
      ),
    ),
  {
    route: "/api/bookings/[bookingId]/customer-link",
    auth: "strict",
    requireAuth: true,
    cache: "private",
  },
);
