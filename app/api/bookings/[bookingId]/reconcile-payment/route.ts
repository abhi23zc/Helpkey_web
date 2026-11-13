import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { reconcilePaymentForGuest } from "@/lib/booking/recovery";
const rawPOST = async (request: Request, { params }: { params: Promise<{ bookingId: string }> }) => {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  await enforceRateLimit({ bucket: "payment-recovery", identifier: user.uid, limit: 60, windowSeconds: 300, failClosed: true });
  const body = await request.json();
  const { bookingId } = await params;
  const { paymentIds: _ids, orderId: _order, ...result } = await reconcilePaymentForGuest(user.uid, bookingId, { attemptId: typeof body.attemptId === "string" ? body.attemptId : undefined, nativeResult: typeof body.nativeResult === "string" ? body.nativeResult : undefined });
  void _ids; void _order;
  return Response.json(result);
};
export const POST = withApiHandler(rawPOST, { route: "/api/bookings/[bookingId]/reconcile-payment", auth: "strict", requireAuth: true, cache: "private" });
