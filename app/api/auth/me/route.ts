import { getAuthenticatedUser } from "@/lib/auth/session";

export async function GET() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return Response.json({ error: "Unauthenticated." }, { status: 401 });
  }

  return Response.json({ user });
}
