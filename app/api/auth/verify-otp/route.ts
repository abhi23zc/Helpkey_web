import { withApiHandler } from "@/lib/api/handler";
import { verifyOtpChallenge } from "@/lib/auth/otp";

const rawPOST = async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      challengeId?: string;
      otp?: string;
    };

    if (!body.challengeId || !body.otp) {
      return Response.json({ error: "Challenge and OTP are required." }, { status: 400 });
    }

    const result = await verifyOtpChallenge(body.challengeId, body.otp);

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify OTP.";
    const status = ["INVALID_OTP", "OTP_EXPIRED", "TOO_MANY_ATTEMPTS"].includes(message)
      ? 400
      : 500;

    return Response.json({ error: message }, { status });
  }
}

export const POST = withApiHandler(rawPOST, { route: "/api/auth/verify-otp", auth: "public", requireAuth: false, cache: "private" });
