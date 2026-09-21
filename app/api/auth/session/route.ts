import { withApiHandler } from "@/lib/api/handler";
import { setSessionCookie } from "@/lib/auth/session";
import { upsertUserFromToken } from "@/lib/auth/users";
import { adminAuth } from "@/lib/firebase/admin";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { clientIp, privateFingerprint } from "@/lib/api/request";
import { ApiException } from "@/lib/api/errors";

const rawPOST = async function POST(request: Request) {
  try {
    await enforceRateLimit({ bucket: "session-ip", identifier: privateFingerprint(clientIp(request)), limit: 30, windowSeconds: 300 });
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

    if (message.startsWith("auth/") || message.includes("TOKEN") || message.includes("ID token")) return Response.json({ error: "INVALID_ID_TOKEN" }, { status: 401 });
    throw new ApiException("SESSION_PROVIDER_UNAVAILABLE", 503, "Authentication is temporarily unavailable.");
  }
}

export const POST = withApiHandler(rawPOST, { route: "/api/auth/session", auth: "public", requireAuth: false, cache: "private" });
