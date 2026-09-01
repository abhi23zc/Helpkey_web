import { setSessionCookie } from "@/lib/auth/session";
import { upsertUserFromToken } from "@/lib/auth/users";
import { adminAuth } from "@/lib/firebase/admin";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      idToken?: string;
      fullName?: string;
    };

    if (!body.idToken) {
      return Response.json({ error: "ID token is required." }, { status: 400 });
    }

    const decodedToken = await adminAuth.verifyIdToken(body.idToken);
    const user = await upsertUserFromToken({
      token: decodedToken,
      fullName: body.fullName,
    });

    await setSessionCookie(body.idToken);

    return Response.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create session.";

    if (message === "FULL_NAME_REQUIRED") {
      return Response.json({ error: message }, { status: 422 });
    }

    if (message === "USER_INACTIVE") {
      return Response.json({ error: message }, { status: 403 });
    }

    return Response.json({ error: message }, { status: 401 });
  }
}
