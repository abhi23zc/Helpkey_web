import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { AppUser } from "@/types/auth";

export const USERS_COLLECTION = "users";

type UpsertUserInput = {
  token: DecodedIdToken;
  fullName?: string;
};

function timestampToIso(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  return null;
}

export function serializeUser(uid: string, data: FirebaseFirestore.DocumentData): AppUser {
  return {
    uid,
    fullName: typeof data.fullName === "string" ? data.fullName : "",
    email: typeof data.email === "string" ? data.email : "",
    phoneNumber: typeof data.phoneNumber === "string" ? data.phoneNumber : "",
    photoURL: typeof data.photoURL === "string" ? data.photoURL : "",
    role: "customer",
    segmentPreference: "business-traveler",
    isActive: data.isActive !== false,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    lastLoginAt: timestampToIso(data.lastLoginAt),
  };
}

export async function getUserByUid(uid: string) {
  const snapshot = await adminDb.collection(USERS_COLLECTION).doc(uid).get();

  if (!snapshot.exists) {
    return null;
  }

  return serializeUser(snapshot.id, snapshot.data() ?? {});
}

export async function upsertUserFromToken({ token, fullName }: UpsertUserInput) {
  const authUser = await adminAuth.getUser(token.uid);
  const userRef = adminDb.collection(USERS_COLLECTION).doc(token.uid);
  const snapshot = await userRef.get();
  const existing = snapshot.data();
  const resolvedFullName =
    fullName?.trim() || authUser.displayName || existing?.fullName || "";

  if (!resolvedFullName) {
    throw new Error("FULL_NAME_REQUIRED");
  }

  const nextUser = {
    uid: token.uid,
    fullName: resolvedFullName,
    email: authUser.email ?? token.email ?? existing?.email ?? "",
    phoneNumber: authUser.phoneNumber ?? token.phone_number ?? existing?.phoneNumber ?? "",
    photoURL: authUser.photoURL ?? token.picture ?? existing?.photoURL ?? "",
    role: existing?.role ?? "customer",
    segmentPreference: existing?.segmentPreference ?? "business-traveler",
    isActive: existing?.isActive ?? true,
    updatedAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp(),
    ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  };

  if (nextUser.isActive === false) {
    throw new Error("USER_INACTIVE");
  }

  await userRef.set(nextUser, { merge: true });

  const updated = await userRef.get();
  return serializeUser(updated.id, updated.data() ?? {});
}
