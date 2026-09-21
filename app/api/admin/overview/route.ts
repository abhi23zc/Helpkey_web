import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { overview, requireAdmin } from "@/lib/admin/data";

const rawGET = async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try { await requireAdmin(user.uid); return Response.json(await overview()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Admin access required." }, { status: 403 }); }
}

export const GET = withApiHandler(rawGET, { route: "/api/admin/overview", auth: "read", requireAuth: true, cache: "private" });
