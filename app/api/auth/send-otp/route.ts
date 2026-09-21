import { withApiHandler } from "@/lib/api/handler";
import { createOtpChallenge } from "@/lib/auth/otp";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { clientIp, privateFingerprint } from "@/lib/api/request";
import { ApiException } from "@/lib/api/errors";
import { ProviderError } from "@/lib/providers/http";

const rawPOST = async function POST(request: Request) {
  try {
    const body = (await request.json()) as { phoneNumber?: string };

    if (!body.phoneNumber) {
      return Response.json({ error: "Phone number is required." }, { status: 400 });
    }

    await Promise.all([
      enforceRateLimit({ bucket: "otp-phone", identifier: privateFingerprint(body.phoneNumber.replace(/\D/g, "")), limit: 5, windowSeconds: 900, failClosed: true }),
      enforceRateLimit({ bucket: "otp-ip", identifier: privateFingerprint(clientIp(request)), limit: 20, windowSeconds: 900, failClosed: true }),
    ]);

    const challenge = await createOtpChallenge(body.phoneNumber);

    return Response.json(challenge);
  } catch (error) {
    if (error instanceof ApiException) throw error;
    if (error instanceof ProviderError) throw new ApiException(error.code, 503, "OTP delivery is temporarily unavailable.");
    const message = error instanceof Error ? error.message : "Unable to send OTP.";
    const status = message === "INVALID_PHONE_NUMBER" ? 400 : 500;

    return Response.json({ error: message }, { status });
  }
}

export const POST = withApiHandler(rawPOST, { route: "/api/auth/send-otp", auth: "public", requireAuth: false, cache: "private" });
