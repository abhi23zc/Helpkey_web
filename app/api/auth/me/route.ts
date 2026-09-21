import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";

const rawGET = async function GET() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return Response.json({ error: "Unauthenticated." }, { status: 401 });
  }

  return Response.json({ user });
}

export const GET = withApiHandler(rawGET, { route: "/api/auth/me", auth: "read", requireAuth: true, cache: "private" });
