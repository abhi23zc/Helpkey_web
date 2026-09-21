import { withApiHandler } from "@/lib/api/handler";
import { clearSessionCookie } from "@/lib/auth/session";

const rawPOST = async function POST() {
  await clearSessionCookie();

  return Response.json({ ok: true });
}

export const POST = withApiHandler(rawPOST, { route: "/api/auth/logout", auth: "public", requireAuth: false, cache: "private" });
