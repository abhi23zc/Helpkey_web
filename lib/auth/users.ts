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
export async function upsertUserFromToken({ token, fullName }: UpsertUserInput) {
  const authUser = await adminAuth.getUser(token.uid); const ref = adminDb.collection(USERS_COLLECTION).doc(token.uid); const snap = await ref.get(); const existing = snap.data() ?? {};
  const name = fullName?.trim() || authUser.displayName || existing.fullName || ""; if (!name) throw new Error("FULL_NAME_REQUIRED");
  const next = { uid: token.uid, fullName: name, email: (authUser.email ?? token.email ?? existing.email ?? "").toLowerCase() || null, phoneNumber: authUser.phoneNumber ?? token.phone_number ?? existing.phoneNumber ?? null, photoURL: authUser.photoURL ?? token.picture ?? existing.photoURL ?? null, roles: roles(existing), accountStatus: existing.accountStatus ?? "active", emailVerified: authUser.emailVerified === true, phoneVerified: Boolean(authUser.phoneNumber), preferredLanguage: existing.preferredLanguage ?? "en", isActive: existing.isActive ?? true, updatedAt: FieldValue.serverTimestamp(), updatedBy: token.uid, lastLoginAt: FieldValue.serverTimestamp(), ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp(), createdBy: token.uid, deletedAt: null }) };
  if (next.accountStatus !== "active" || next.isActive === false) throw new Error("USER_INACTIVE"); await ref.set(next, { merge: true }); const updated = await ref.get(); return serializeUser(updated.id, updated.data() ?? {});
}
