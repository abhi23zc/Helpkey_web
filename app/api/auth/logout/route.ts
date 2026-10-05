import { withApiHandler } from "@/lib/api/handler";
import { signOutRequest } from "@/lib/auth/session";

const rawPOST = async function POST() {
  await signOutRequest();

  return Response.json({ ok: true });
}

export const POST = withApiHandler(rawPOST, { route: "/api/auth/logout", auth: "public", requireAuth: false, cache: "private" });
