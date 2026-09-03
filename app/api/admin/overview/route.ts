import { getAuthenticatedUser } from "@/lib/auth/session";
import { overview, requireAdmin } from "@/lib/admin/data";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try { await requireAdmin(user.uid); return Response.json(await overview()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Admin access required." }, { status: 403 }); }
}
