import { createOtpChallenge } from "@/lib/auth/otp";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { phoneNumber?: string };

    if (!body.phoneNumber) {
      return Response.json({ error: "Phone number is required." }, { status: 400 });
    }

    const challenge = await createOtpChallenge(body.phoneNumber);

    return Response.json(challenge);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send OTP.";
    const status = message === "INVALID_PHONE_NUMBER" ? 400 : 500;

    return Response.json({ error: message }, { status });
  }
}
