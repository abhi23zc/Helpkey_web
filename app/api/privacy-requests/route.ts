import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { withApiHandler } from "@/lib/api/handler";
import { ApiException } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { clientIp, privateFingerprint } from "@/lib/api/request";
import { privacyRequestSchema } from "@/lib/privacy-request-schema";

export const POST = withApiHandler(async request => {
  await enforceRateLimit({ bucket: "privacy-request-ip", identifier: privateFingerprint(clientIp(request)), limit: 5, windowSeconds: 3600, failClosed: true });
  let body: unknown;
  try { body = await request.json(); } catch { throw new ApiException("INVALID_BODY", 400, "Enter a valid request."); }
  const parsed = privacyRequestSchema.safeParse(body);
  if (!parsed.success) throw new ApiException("INVALID_REQUEST", 400, parsed.error.issues[0]?.message ?? "Check your request details.");
  const { kind, name, contact, accountIdentifier, message } = parsed.data;
  const ref = adminDb.collection("privacyRequests").doc();
  await ref.create({ kind, name, contact, accountIdentifier, message, status: "pending", createdAt: FieldValue.serverTimestamp() });
  return Response.json({ reference: ref.id }, { status: 201 });
}, { route: "/api/privacy-requests", auth: "public", cache: "private", bodyLimitBytes: 16384, legacyShape: false });
