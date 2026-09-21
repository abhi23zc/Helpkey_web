import { withApiHandler } from "@/lib/api/handler";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { listNotifications, markNotificationsRead } from "@/lib/notifications/service";

const rawGET = async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get("unread") === "1";
    const limitParam = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 20;
    const result = await listNotifications(user.uid, { unreadOnly, limit, cursor: url.searchParams.get("cursor") || undefined });
    return Response.json(result);
  } catch {
    return Response.json({ error: "Unable to load notifications." }, { status: 500 });
  }
}

const markSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) }).strict();

const rawPOST = async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    const { ids } = markSchema.parse(await request.json());
    const updated = await markNotificationsRead(user.uid, ids);
    return Response.json({ ok: true, updated });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update notifications." }, { status: 422 });
  }
}

export const GET = withApiHandler(rawGET, { route: "/api/notifications", auth: "read", requireAuth: true, cache: "private" });
export const POST = withApiHandler(rawPOST, { route: "/api/notifications", auth: "strict", requireAuth: true, cache: "private" });
