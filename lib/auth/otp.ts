import "server-only";

import crypto from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

const OTP_COLLECTION = "otpChallenges";
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function getOtpSecret() {
  if (process.env.OTP_HASH_SECRET) {
    return process.env.OTP_HASH_SECRET;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("OTP_HASH_SECRET is required in production.");
  }

  return "helpkey-local-otp-secret";
}

function normalizePhoneNumber(phoneNumber: string) {
  const compact = phoneNumber.replace(/[^\d+]/g, "");

  if (!/^\+\d{6,15}$/.test(compact)) {
    throw new Error("INVALID_PHONE_NUMBER");
  }

  return compact;
}

function createOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashOtp(challengeId: string, phoneNumber: string, otp: string) {
  return crypto
    .createHmac("sha256", getOtpSecret())
    .update(`${challengeId}.${phoneNumber}.${otp}`)
    .digest("hex");
}

async function sendWhatsappOtp(phoneNumber: string, otp: string) {
  const apiKey = process.env.WHATSAPP_OTP_API_KEY ?? process.env.DINEEZY_WHATSAPP_API_KEY;

  if (!apiKey) {
    throw new Error("WHATSAPP_OTP_API_KEY is required.");
  }

  const baseUrl =
    process.env.WHATSAPP_OTP_API_URL ??
    "https://api2.dineezy.in/api/v1/dev/create-message";
  const url = new URL(baseUrl);

  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("to", phoneNumber);
  url.searchParams.set(
    "message",
    `Your Helpkey verification code is ${otp}. It expires in 5 minutes.`,
  );

  const response = await fetch(url, { method: "GET", cache: "no-store" });

  if (!response.ok) {
    throw new Error("OTP_SEND_FAILED");
  }
}

export async function createOtpChallenge(rawPhoneNumber: string) {
  const phoneNumber = normalizePhoneNumber(rawPhoneNumber);
  const challengeRef = adminDb.collection(OTP_COLLECTION).doc();
  const otp = createOtp();
  const expiresAt = Timestamp.fromMillis(Date.now() + OTP_TTL_MS);

  await challengeRef.set({
    phoneNumber,
    otpHash: hashOtp(challengeRef.id, phoneNumber, otp),
    expiresAt,
    attempts: 0,
    consumed: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  await sendWhatsappOtp(phoneNumber, otp);

  return {
    challengeId: challengeRef.id,
    expiresInSeconds: OTP_TTL_MS / 1000,
  };
}

export async function verifyOtpChallenge(challengeId: string, otp: string) {
  if (!challengeId || !/^\d{6}$/.test(otp)) {
    throw new Error("INVALID_OTP");
  }

  const challengeRef = adminDb.collection(OTP_COLLECTION).doc(challengeId);

  const verification = await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(challengeRef);

    if (!snapshot.exists) {
      return { ok: false as const, reason: "INVALID_OTP" };
    }

    const challenge = snapshot.data() ?? {};
    const expiresAt = challenge.expiresAt;

    if (
      challenge.consumed === true ||
      !(expiresAt instanceof Timestamp) ||
      expiresAt.toMillis() < Date.now()
    ) {
      return { ok: false as const, reason: "OTP_EXPIRED" };
    }

    if ((challenge.attempts ?? 0) >= MAX_ATTEMPTS) {
      return { ok: false as const, reason: "TOO_MANY_ATTEMPTS" };
    }

    const expectedHash = hashOtp(challengeId, challenge.phoneNumber, otp);

    if (challenge.otpHash !== expectedHash) {
      transaction.update(challengeRef, {
        attempts: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { ok: false as const, reason: "INVALID_OTP" };
    }

    transaction.update(challengeRef, {
      consumed: true,
      attempts: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { ok: true as const, phoneNumber: challenge.phoneNumber as string };
  });

  if (!verification.ok) {
    throw new Error(verification.reason);
  }

  const userRecord = await getOrCreatePhoneAuthUser(verification.phoneNumber);
  const customToken = await adminAuth.createCustomToken(userRecord.uid);

  return {
    customToken,
    phoneNumber: verification.phoneNumber,
  };
}

async function getOrCreatePhoneAuthUser(phoneNumber: string) {
  try {
    return await adminAuth.getUserByPhoneNumber(phoneNumber);
  } catch (error) {
    const authError = error as { code?: string };

    if (authError.code !== "auth/user-not-found") {
      throw error;
    }

    const uid = `phone_${crypto.createHash("sha256").update(phoneNumber).digest("hex").slice(0, 28)}`;
    return adminAuth.createUser({
      uid,
      phoneNumber,
    });
  }
}
