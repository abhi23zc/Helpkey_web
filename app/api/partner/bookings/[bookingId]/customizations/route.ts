import { getAuthenticatedUser } from "@/lib/auth/session";
import { withApiHandler } from "@/lib/api/handler";
import { updateStayRequest } from "@/lib/stay/service";
import { stayError } from "@/lib/stay/api";
async function save(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const u = await getAuthenticatedUser();
  if (!u) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  try {
    await updateStayRequest(
      u.uid,
      (await params).bookingId,
      await request.json(),
    );
    return Response.json({ ok: true });
  } catch (e) {
    return stayError(e);
  }
}
export const POST = withApiHandler(save, {
  route: "/api/partner/bookings/[bookingId]/customizations",
  auth: "strict",
  requireAuth: true,
  cache: "private",
});
