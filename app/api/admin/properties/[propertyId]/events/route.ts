import { getAuthenticatedUser } from "@/lib/auth/session";
import { listReviewEvents, requireAdmin } from "@/lib/admin/data";

export async function GET(_: Request, { params }: { params: Promise<{ propertyId: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    await requireAdmin(user.uid);
    const { propertyId } = await params;
    const events = await listReviewEvents(propertyId);
    return Response.json({ events });
  } catch {
    return Response.json({ error: "Admin access required." }, { status: 403 });
  }
}
