import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { AccountStatus, AppUser, UserRole } from "@/types/auth";

export const USERS_COLLECTION = "users";
type UpsertUserInput = { token: DecodedIdToken; fullName?: string };

function iso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : typeof value === "string" ? value : null;
}
function roles(data: FirebaseFirestore.DocumentData): UserRole[] {
  if (Array.isArray(data.roles)) return data.roles.filter((r): r is UserRole => r === "customer" || r === "partner" || r === "admin");
  return data.role === "partner" || data.role === "admin" ? ["customer", data.role] : ["customer"];
}
export function serializeUser(uid: string, data: FirebaseFirestore.DocumentData): AppUser {
  const accountStatus: AccountStatus = ["suspended", "disabled", "deleted"].includes(data.accountStatus) ? data.accountStatus : "active";
  return { uid, fullName: typeof data.fullName === "string" ? data.fullName : "", email: typeof data.email === "string" && data.email ? data.email : null, phoneNumber: typeof data.phoneNumber === "string" && data.phoneNumber ? data.phoneNumber : null, photoURL: typeof data.photoURL === "string" && data.photoURL ? data.photoURL : null, roles: roles(data), accountStatus, emailVerified: data.emailVerified === true, phoneVerified: data.phoneVerified === true, preferredLanguage: typeof data.preferredLanguage === "string" ? data.preferredLanguage : "en", isActive: accountStatus === "active" && data.isActive !== false, createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt), lastLoginAt: iso(data.lastLoginAt) };
}
export async function getUserByUid(uid: string) { const snap = await adminDb.collection(USERS_COLLECTION).doc(uid).get(); return snap.exists ? serializeUser(snap.id, snap.data() ?? {}) : null; }
/**
 * Stores a phone number on the user profile only when one is not already set.
 * Used to remember the mobile number a guest first enters during checkout so it
 * can be prefilled on later bookings. First write wins; existing numbers and
 * verification state are never overwritten. Runs in a transaction to stay safe
 * under concurrent bookings. Returns true when a number was newly saved.
 */
export async function backfillUserPhoneNumber(uid: string, phoneNumber: string): Promise<boolean> {
  if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber)) return false;
  const ref = adminDb.collection(USERS_COLLECTION).doc(uid);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const data = snap.data() ?? {};
    if (typeof data.phoneNumber === "string" && data.phoneNumber) return false;
    const name = typeof data.fullName === "string" ? data.fullName : "";
    const email = typeof data.email === "string" ? data.email : "";
    const searchTokens = [...new Set([uid, name, email, phoneNumber].flatMap((value) => String(value ?? "").toLowerCase().trim().split(/\s+/)).filter(Boolean))].slice(0, 40);
    tx.set(ref, { phoneNumber, searchTokens, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid }, { merge: true });
    return true;
  });
}
export async function upsertUserFromToken({ token, fullName }: UpsertUserInput) {
  const authUser = await adminAuth.getUser(token.uid); const ref = adminDb.collection(USERS_COLLECTION).doc(token.uid); const snap = await ref.get(); const existing = snap.data() ?? {};
  const name = fullName?.trim() || authUser.displayName || existing.fullName || ""; if (!name) throw new Error("FULL_NAME_REQUIRED");
  const email = (authUser.email ?? token.email ?? existing.email ?? "").toLowerCase() || null; const phoneNumber = authUser.phoneNumber ?? token.phone_number ?? existing.phoneNumber ?? null;
  const next = { uid: token.uid, fullName: name, email, phoneNumber, photoURL: authUser.photoURL ?? token.picture ?? existing.photoURL ?? null, roles: roles(existing), accountStatus: existing.accountStatus ?? "active", emailVerified: authUser.emailVerified === true, phoneVerified: Boolean(authUser.phoneNumber), preferredLanguage: existing.preferredLanguage ?? "en", isActive: existing.isActive ?? true, searchTokens: [...new Set([token.uid, name, email, phoneNumber].flatMap((value) => String(value ?? "").toLowerCase().trim().split(/\s+/)).filter(Boolean))].slice(0, 40), updatedAt: FieldValue.serverTimestamp(), updatedBy: token.uid, lastLoginAt: FieldValue.serverTimestamp(), ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp(), createdBy: token.uid, deletedAt: null }) };
  if (next.accountStatus !== "active" || next.isActive === false) throw new Error("USER_INACTIVE"); await ref.set(next, { merge: true }); const updated = await ref.get(); return serializeUser(updated.id, updated.data() ?? {});
}
