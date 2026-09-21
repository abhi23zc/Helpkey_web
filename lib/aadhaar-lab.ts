import "server-only";

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { providerFetch } from "@/lib/providers/http";
import { adminDb } from "@/lib/firebase/admin";
import { deletePrivateObject, getPrivateObject, putPrivateObject } from "@/lib/r2";

const COLLECTION = "aadhaarVerificationLab";
const SANDBOX_BASE = "https://sandbox.cashfree.com/verification";
const PRODUCTION_BASE = "https://api.cashfree.com/verification";
const RETENTION_DAYS = Number.parseInt(process.env.AADHAAR_LAB_RETENTION_DAYS ?? "30", 10) || 30;
const OTP_TTL_MS = 10 * 60 * 1000;
const LIVE_CONFIRMATION = "I CONFIRM LIVE AADHAAR OTP VERIFICATION";
// Cashfree's documented sandbox table includes 655675523712 as a valid test
// fixture although it does not satisfy the Verhoeff checksum. This exception is
// deliberately limited to the provider's sandbox fixture and never applies live.
const CASHFREE_SANDBOX_AADHAAR_FIXTURES = new Set(["655675523712"]);

export type LabEnvironment = "sandbox" | "production";
type EncryptedPayload = { ciphertext: string; iv: string; tag: string; version: 1 };
type ProviderResponse = Record<string, unknown>;

export const startAadhaarLabSchema = z.object({
  aadhaar: z.string().min(1).max(32), consentAttested: z.literal(true),
  environment: z.enum(["sandbox", "production"]).default("sandbox"),
  liveConfirmation: z.string().optional(),
}).strict();
export const verifyAadhaarLabSchema = z.object({ otp: z.string().trim().regex(/^\d{4,8}$/) }).strict();

export function normalizeAadhaar(value: string) { return value.replace(/[\s-]/g, ""); }
export function isValidAadhaar(value: string) {
  const normalized = normalizeAadhaar(value);
  if (!/^\d{12}$/.test(normalized) || /^([0-9])\1{11}$/.test(normalized)) return false;
  const d = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
  const p = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,6,2,7,9,3,1,0,4],[8,9,2,5,1,6,7,3,0,4],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
  let c = 0; [...normalized].reverse().forEach((digit, i) => { c = d[c][p[i % 8][Number(digit)]]; });
  return c === 0;
}
function isAllowedAadhaar(environment: LabEnvironment, aadhaar: string) {
  return isValidAadhaar(aadhaar) || (environment === "sandbox" && CASHFREE_SANDBOX_AADHAAR_FIXTURES.has(aadhaar));
}

function requiredSecret(name: string) { const value = process.env[name]; if (!value) throw new Error(`AADHAAR_LAB_${name}_MISSING`); return value; }
function encryptionKey() { const key = Buffer.from(requiredSecret("AADHAAR_LAB_ENCRYPTION_KEY"), "base64"); if (key.length !== 32) throw new Error("AADHAAR_LAB_ENCRYPTION_KEY_INVALID"); return key; }
function fingerprint(aadhaar: string) { return createHmac("sha256", requiredSecret("AADHAAR_LAB_HMAC_PEPPER")).update(aadhaar).digest("hex"); }
function credentials(environment: LabEnvironment) {
  const suffix = environment === "production" ? "LIVE" : "SANDBOX";
  return { clientId: requiredSecret(`CASHFREE_AADHAAR_${suffix}_CLIENT_ID`), clientSecret: requiredSecret(`CASHFREE_AADHAAR_${suffix}_CLIENT_SECRET`) };
}
export function productionEnabled() { return process.env.CASHFREE_AADHAAR_PRODUCTION_ENABLED === "true" && Boolean(process.env.CASHFREE_AADHAAR_LIVE_CLIENT_ID && process.env.CASHFREE_AADHAAR_LIVE_CLIENT_SECRET); }
export function labReadiness() { return { sandboxReady: Boolean(process.env.CASHFREE_AADHAAR_SANDBOX_CLIENT_ID && process.env.CASHFREE_AADHAAR_SANDBOX_CLIENT_SECRET && process.env.AADHAAR_LAB_ENCRYPTION_KEY && process.env.AADHAAR_LAB_HMAC_PEPPER), productionEnabled: productionEnabled(), retentionDays: RETENTION_DAYS, liveConfirmation: LIVE_CONFIRMATION }; }
function enforceEnvironment(environment: LabEnvironment, confirmation?: string) { if (environment === "production" && (!productionEnabled() || confirmation !== LIVE_CONFIRMATION)) throw new Error("PRODUCTION_CONFIRMATION_REQUIRED"); }
function encrypt(payload: unknown): EncryptedPayload { const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv); const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]); return { version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") }; }
function decrypt(payload: EncryptedPayload) { const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(payload.iv, "base64")); decipher.setAuthTag(Buffer.from(payload.tag, "base64")); return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, "base64")), decipher.final()]).toString("utf8")); }
function objectKey(id: string) { return `aadhaar-lab/${id}/provider-payload.json.enc`; }
function serializeDate(value: unknown) { return value && typeof (value as { toDate?: () => Date }).toDate === "function" ? (value as { toDate: () => Date }).toDate().toISOString() : null; }
function recordDto(id: string, data: Record<string, unknown>) { return { id, operatorId: data.operatorId, environment: data.environment, status: data.status, cashfreeReference: data.cashfreeReference ?? null, aadhaarLastFour: data.aadhaarLastFour, consentAt: serializeDate(data.consentAt), createdAt: serializeDate(data.createdAt), updatedAt: serializeDate(data.updatedAt), expiresAt: serializeDate(data.expiresAt), otpExpiresAt: serializeDate(data.otpExpiresAt), resendCount: data.resendCount ?? 0, errorCode: data.errorCode ?? null, timingMs: data.timingMs ?? null }; }
async function limited(operatorId: string, aadhaarFingerprint: string) { const since = Timestamp.fromMillis(Date.now() - 60 * 60 * 1000); const [byOperator, byAadhaar] = await Promise.all([adminDb.collection(COLLECTION).where("operatorId", "==", operatorId).where("createdAt", ">=", since).limit(11).get(), adminDb.collection(COLLECTION).where("aadhaarFingerprint", "==", aadhaarFingerprint).where("createdAt", ">=", since).limit(4).get()]); if (byOperator.size >= 10 || byAadhaar.size >= 3) throw new Error("RATE_LIMITED"); }
async function cashfree(environment: LabEnvironment, path: string, body: Record<string, unknown>) {
  const auth = credentials(environment), started = Date.now();
  let response: Response;
  try { response = await providerFetch("cashfree", `${environment === "production" ? PRODUCTION_BASE : SANDBOX_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", "x-client-id": auth.clientId, "x-client-secret": auth.clientSecret }, body: JSON.stringify(body), timeoutMs: 10_000, idempotent: false }); }
  catch { throw new Error("CASHFREE_NETWORK_ERROR"); }
  const text = await response.text(); let json: ProviderResponse = {}; try { json = text ? JSON.parse(text) as ProviderResponse : {}; } catch { json = { message: "Provider returned a non-JSON response" }; }
  return { ok: response.ok, status: response.status, json, timingMs: Date.now() - started };
}
async function savePayload(id: string, payload: unknown) { const sealed = encrypt(payload); await putPrivateObject(objectKey(id), Buffer.from(JSON.stringify(sealed), "utf8"), "application/json"); return { objectKey: objectKey(id), encryption: { algorithm: "AES-256-GCM", version: 1 } }; }
async function payloadFor(data: Record<string, unknown>) { if (typeof data.payloadObjectKey !== "string") return { events: [] }; return decrypt(JSON.parse(Buffer.from(await getPrivateObject(data.payloadObjectKey)).toString("utf8")) as EncryptedPayload) as { events: unknown[] }; }
function safeResult(id: string, data: Record<string, unknown>, response: ProviderResponse) { return { record: recordDto(id, data), provider: { status: response.status ?? null, message: response.message ?? null, reference: response.ref_id ?? response.reference_id ?? null }, identity: extractIdentity(response) }; }
function extractIdentity(response: ProviderResponse) { const allowed = ["name", "dob", "gender", "care_of", "address", "year_of_birth", "status", "message", "uid"]; return Object.fromEntries(allowed.filter((key) => response[key] !== undefined).map((key) => [key, response[key]])); }

export async function startAadhaarLab(operatorId: string, input: z.infer<typeof startAadhaarLabSchema>) {
  const aadhaar = normalizeAadhaar(input.aadhaar); if (!isAllowedAadhaar(input.environment, aadhaar)) throw new Error("INVALID_AADHAAR"); enforceEnvironment(input.environment, input.liveConfirmation); const hash = fingerprint(aadhaar); await limited(operatorId, hash);
  const ref = adminDb.collection(COLLECTION).doc(); const now = new Date(); const expiresAt = new Date(now.getTime() + RETENTION_DAYS * 86400000); const request = { aadhaar_number: aadhaar };
  await ref.set({ operatorId, environment: input.environment, status: "requesting", aadhaarLastFour: aadhaar.slice(-4), aadhaarFingerprint: hash, consentAt: Timestamp.fromDate(now), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromDate(expiresAt), otpExpiresAt: Timestamp.fromMillis(now.getTime() + OTP_TTL_MS), resendCount: 0, consumedAt: null, payloadObjectKey: null, encryption: null });
  const provider = await cashfree(input.environment, "/offline-aadhaar", request); const sealed = await savePayload(ref.id, { events: [{ operation: "generate_otp", at: now.toISOString(), request, response: provider.json, httpStatus: provider.status }] }); const cfRef = String(provider.json.ref_id ?? provider.json.reference_id ?? "");
  await ref.update({ status: provider.ok && cfRef ? "otp_sent" : "provider_error", cashfreeReference: cfRef || null, payloadObjectKey: sealed.objectKey, encryption: sealed.encryption, timingMs: provider.timingMs, errorCode: provider.ok ? null : String(provider.json.code ?? provider.json.message ?? `HTTP_${provider.status}`).slice(0, 160), updatedAt: FieldValue.serverTimestamp() });
  const fresh = (await ref.get()).data() ?? {}; return safeResult(ref.id, fresh, provider.json);
}

export async function verifyAadhaarLab(operatorId: string, id: string, otp: string) {
  const ref = adminDb.collection(COLLECTION).doc(id); const record = await ref.get(); const data = record.data(); if (!data || data.operatorId !== operatorId) throw new Error("RECORD_NOT_FOUND"); if (data.status !== "otp_sent" || data.consumedAt || !data.cashfreeReference) throw new Error("REFERENCE_ALREADY_USED"); if (data.otpExpiresAt?.toMillis?.() <= Date.now()) { await ref.update({ status: "expired", updatedAt: FieldValue.serverTimestamp() }); throw new Error("REFERENCE_EXPIRED"); }
  // Mark consumed before the remote request so racing requests cannot submit the same reference twice.
  const claimed = await adminDb.runTransaction(async tx => { const current = await tx.get(ref), value = current.data(); if (!value || value.status !== "otp_sent" || value.consumedAt) return false; tx.update(ref, { status: "verifying", consumedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); return true; }); if (!claimed) throw new Error("REFERENCE_ALREADY_USED");
  const provider = await cashfree(data.environment as LabEnvironment, "/offline-aadhaar/verify", { otp, ref_id: data.cashfreeReference }); const payload = await payloadFor(data); payload.events.push({ operation: "verify_otp", at: new Date().toISOString(), request: { otp }, response: provider.json, httpStatus: provider.status }); const sealed = await savePayload(id, payload);
  await ref.update({ status: provider.ok ? String(provider.json.status ?? "completed").toLowerCase() : "provider_error", payloadObjectKey: sealed.objectKey, encryption: sealed.encryption, timingMs: provider.timingMs, errorCode: provider.ok ? null : String(provider.json.code ?? provider.json.message ?? `HTTP_${provider.status}`).slice(0, 160), updatedAt: FieldValue.serverTimestamp() }); const fresh = (await ref.get()).data() ?? {}; return safeResult(id, fresh, provider.json);
}
export async function resendAadhaarLab(operatorId: string, id: string) {
  const ref = adminDb.collection(COLLECTION).doc(id); const record = await ref.get(); const data = record.data();
  if (!data || data.operatorId !== operatorId) throw new Error("RECORD_NOT_FOUND");
  if (data.status !== "otp_sent" || data.consumedAt || data.otpExpiresAt?.toMillis?.() <= Date.now()) throw new Error("REFERENCE_EXPIRED");
  const claimed = await adminDb.runTransaction(async tx => { const current = await tx.get(ref), value = current.data(); if (!value || value.status !== "otp_sent" || value.consumedAt || (value.resendCount ?? 0) >= 3) return false; tx.update(ref, { resendCount: (value.resendCount ?? 0) + 1, updatedAt: FieldValue.serverTimestamp() }); return true; });
  if (!claimed) throw new Error("RESEND_LIMIT_REACHED");
  const payload = await payloadFor(data); const first = payload.events.find((event: unknown) => (event as { operation?: unknown }).operation === "generate_otp") as { request?: { aadhaar_number?: string } } | undefined; const aadhaar = first?.request?.aadhaar_number;
  if (!aadhaar) throw new Error("RECORD_PAYLOAD_UNAVAILABLE");
  const provider = await cashfree(data.environment as LabEnvironment, "/offline-aadhaar", { aadhaar_number: aadhaar }); const cfRef = String(provider.json.ref_id ?? provider.json.reference_id ?? ""); payload.events.push({ operation: "resend_otp", at: new Date().toISOString(), request: { aadhaar_number: aadhaar }, response: provider.json, httpStatus: provider.status }); const sealed = await savePayload(id, payload);
  await ref.update({ status: provider.ok && cfRef ? "otp_sent" : "provider_error", cashfreeReference: cfRef || data.cashfreeReference, otpExpiresAt: Timestamp.fromMillis(Date.now() + OTP_TTL_MS), payloadObjectKey: sealed.objectKey, encryption: sealed.encryption, timingMs: provider.timingMs, errorCode: provider.ok ? null : String(provider.json.code ?? provider.json.message ?? `HTTP_${provider.status}`).slice(0, 160), updatedAt: FieldValue.serverTimestamp() }); const fresh = (await ref.get()).data() ?? {}; return safeResult(id, fresh, provider.json);
}
export async function listAadhaarLab(operatorId: string) { const rows = await adminDb.collection(COLLECTION).where("operatorId", "==", operatorId).orderBy("createdAt", "desc").limit(100).get(); return rows.docs.map(doc => recordDto(doc.id, doc.data())); }
export async function getAadhaarLabPayload(operatorId: string, id: string) { const doc = await adminDb.collection(COLLECTION).doc(id).get(); const data = doc.data(); if (!data || data.operatorId !== operatorId) throw new Error("RECORD_NOT_FOUND"); return { record: recordDto(doc.id, data), payload: await payloadFor(data) }; }
export async function cleanupExpiredAadhaarLab() { const expired = await adminDb.collection(COLLECTION).where("expiresAt", "<=", Timestamp.now()).limit(100).get(); let deleted = 0, failures = 0; for (const doc of expired.docs) { try { const key = doc.data().payloadObjectKey; if (typeof key === "string") await deletePrivateObject(key); await doc.ref.delete(); deleted++; } catch { failures++; } } return { deleted, failures }; }
