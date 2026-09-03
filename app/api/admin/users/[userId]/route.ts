import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAdmin, updateUser, userUpdateSchema } from "@/lib/admin/data";

export async function PATCH(request: Request, { params }: RouteContext<"/api/admin/users/[userId]">) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try { await requireAdmin(user.uid); const { userId } = await params; await updateUser(user.uid, userId, userUpdateSchema.parse(await request.json())); return Response.json({ ok: true }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to update account." }, { status: 422 }); }
}
